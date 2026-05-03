import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';
import { StatCard } from '../../components/ui/stat-card';
import { AlertTimelineItem, TimelineGroup } from '../../components/ui/alert-timeline';

interface MonitorAlert {
  id: number;
  timestamp: string;
  alert_type: string;
  severity: string;
  confidence: number;
  message: string;
  detection_class: string;
  created_at: string;
}

interface SystemStatus {
  status: 'online' | 'offline';
  enabled: boolean;
  lastHeartbeat: string | null;
}

interface ModelStatus {
  running: boolean;
  pid: number | null;
}

type CalibrationState = 'IDLE' | 'IN_PROGRESS' | 'REJECTED' | 'PAUSED' | 'COMPLETED' | 'FAILED';

interface CalibrationStatus {
  status: CalibrationState;
  inProgress: boolean;
  progressPercent: number;
  framesCollected: number;
  totalFrames: number;
  instruction: string;
  rejectReason: string;
  skipReason: string;
  attempt: number;
  autoRetryUsed: boolean;
  source: string;
  stageName: string;
  stagePhase: string;
  acceptedSampleCount: number;
  skippedFrameCount: number;
  updatedAt: string | null;
}

const DEFAULT_CALIBRATION_STATUS: CalibrationStatus = {
  status: 'IDLE',
  inProgress: false,
  progressPercent: 0,
  framesCollected: 0,
  totalFrames: 90,
  instruction: '',
  rejectReason: '',
  skipReason: '',
  attempt: 0,
  autoRetryUsed: false,
  source: 'manual',
  stageName: '',
  stagePhase: '',
  acceptedSampleCount: 0,
  skippedFrameCount: 0,
  updatedAt: null,
};

const detectionIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  drowsy: 'eye-off',
  eyes_closed: 'eye-off',
  phone: 'phone-portrait',
  phone_use: 'phone-portrait',
  looking_away: 'eye-off-outline',
  distract: 'eye-off-outline',
  yawn: 'cafe',
  yawning: 'cafe',
  narrow: 'remove-circle',
  fatigue: 'remove-circle',
};

const getDetectionIcon = (alertType: string): keyof typeof Ionicons.glyphMap => {
  const type = alertType.toLowerCase();
  for (const [key, icon] of Object.entries(detectionIcons)) {
    if (type.includes(key)) return icon;
  }
  return 'alert-circle';
};

const getDetectionTitle = (alertType: string): string => {
  const type = alertType.toLowerCase();
  if (type.includes('drowsy') || type.includes('eyes_closed')) return 'Drowsiness Detected';
  if (type.includes('phone')) return 'Phone Usage';
  if (type.includes('looking') || type.includes('distract')) return 'Driver Distracted';
  if (type.includes('yawn')) return 'Yawning Detected';
  if (type.includes('narrow') || type.includes('fatigue')) return 'Fatigue Signs';
  return alertType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const waitFor = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const CALIBRATION_COUNTDOWN_SECONDS = 5;
const CALIBRATION_START_SYNC_TIMEOUT_MS = 1500;

const speakOnce = (text: string, language: string) =>
  new Promise<void>(resolve => {
    Speech.speak(text, {
      language,
      rate: 0.95,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });

export default function DriverMonitorScreen() {
  const driverId = '8c394627-e397-4bd5-928f-4cc66cfebac1';

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ status: 'offline', enabled: true, lastHeartbeat: null });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ running: false, pid: null });
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [isCalibrationStarting, setIsCalibrationStarting] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [calibrationStatus, setCalibrationStatus] = useState<CalibrationStatus>(DEFAULT_CALIBRATION_STATUS);
  const [autoRetrySpoken, setAutoRetrySpoken] = useState(false);

  const previousCalibrationStateRef = useRef<CalibrationState>('IDLE');
  const closeModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startCalibrationLockRef = useRef(false);

  const stopSpeech = useCallback(() => {
    try {
      Speech.stop();
    } catch {
      // no-op
    }
  }, []);

  const speakEnglish = useCallback(async (english: string) => {
    stopSpeech();
    await speakOnce(english, 'en-US');
  }, [stopSpeech]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.DRIVER_MONITOR_STATUS}?driver_id=${driverId}`);
      setSystemStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  }, [driverId]);

  const fetchModelStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.DRIVER_MODEL_STATUS}?driver_id=${driverId}`);
      setModelStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch model status:', error);
    }
  }, [driverId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.DRIVER_MONITOR_ALERTS}?driver_id=${driverId}`);
      if (response.data && Array.isArray(response.data)) {
        setAlerts(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, [driverId]);

  const fetchCalibrationStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.DRIVER_MODEL_CALIBRATION_STATUS}?driver_id=${driverId}`);
      if (response.data) {
        const nextStatus: CalibrationStatus = {
          ...DEFAULT_CALIBRATION_STATUS,
          ...response.data,
          progressPercent: Number(response.data.progressPercent ?? 0),
          framesCollected: Number(response.data.framesCollected ?? 0),
          totalFrames: Number(response.data.totalFrames ?? DEFAULT_CALIBRATION_STATUS.totalFrames),
          attempt: Number(response.data.attempt ?? 0),
          acceptedSampleCount: Number(response.data.acceptedSampleCount ?? 0),
          skippedFrameCount: Number(response.data.skippedFrameCount ?? 0),
        };

        setCalibrationStatus(prev => {
          if (startCalibrationLockRef.current && prev.inProgress && !nextStatus.inProgress) {
            return prev;
          }
          return nextStatus;
        });
      }
    } catch (error) {
      console.error('Failed to fetch calibration status:', error);
    }
  }, [driverId]);

  const syncCalibrationStatusAfterStart = useCallback(async () => {
    await Promise.race([
      fetchCalibrationStatus(),
      waitFor(CALIBRATION_START_SYNC_TIMEOUT_MS),
    ]);
  }, [fetchCalibrationStatus]);

  const startCalibration = useCallback(async () => {
    if (!modelStatus.running) {
      Alert.alert('Driver Monitor', 'Start monitoring before calibration.');
      return;
    }

    if (startCalibrationLockRef.current) {
      return;
    }

    startCalibrationLockRef.current = true;

    setShowCalibrationModal(true);
    setIsCalibrationStarting(true);
    setAutoRetrySpoken(false);
    setCalibrationStatus(prev => ({
      ...prev,
      status: 'IN_PROGRESS',
      inProgress: true,
      progressPercent: 0,
      framesCollected: 0,
      rejectReason: '',
      skipReason: '',
      stageName: 'FORWARD',
      stagePhase: 'settle',
      acceptedSampleCount: 0,
      skippedFrameCount: 0,
      instruction: 'Get ready. Calibration starts after countdown and will guide you stage by stage.',
    }));

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await speakEnglish('Get ready. You have five seconds. Calibration will start with forward pose and then guide the mirror checks.');

      for (let i = CALIBRATION_COUNTDOWN_SECONDS; i >= 1; i -= 1) {
        setCountdownValue(i);
        await Haptics.selectionAsync();
        await waitFor(1000);
      }
      setCountdownValue(null);

      const response = await apiClient.post(API_ENDPOINTS.DRIVER_MODEL_CALIBRATE, { driver_id: driverId });
      if (!response.data?.success) {
        throw new Error(response.data?.details || response.data?.error || 'Failed to start calibration');
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await speakEnglish('Calibrating now. Follow the stage prompt and keep the pose steady.');
      await syncCalibrationStatusAfterStart();
    } catch (error) {
      const errorMessage = (error as any)?.response?.data?.details || (error as any)?.response?.data?.error || (error as Error)?.message;
      Alert.alert('Calibration', errorMessage || 'Failed to start calibration.');
      await speakEnglish('Calibration could not start. Please try again.');
      setShowCalibrationModal(false);
      setCalibrationStatus(DEFAULT_CALIBRATION_STATUS);
    } finally {
      setCountdownValue(null);
      setIsCalibrationStarting(false);
      startCalibrationLockRef.current = false;
    }
  }, [driverId, modelStatus.running, speakEnglish, syncCalibrationStatusAfterStart]);

  const retryCalibrationStage = useCallback(async () => {
    if (calibrationStatus.status !== 'PAUSED') return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const response = await apiClient.post(API_ENDPOINTS.DRIVER_MODEL_CALIBRATION_RETRY, { driver_id: driverId });
      if (!response.data?.success) {
        throw new Error(response.data?.details || response.data?.error || 'Failed to retry calibration stage');
      }

      setCalibrationStatus(prev => ({
        ...prev,
        status: 'IN_PROGRESS',
        inProgress: true,
        rejectReason: '',
        skipReason: '',
      }));
      await speakEnglish('Retrying the current stage. Follow the stage prompt and hold steady.');
      await syncCalibrationStatusAfterStart();
    } catch (error) {
      const errorMessage = (error as any)?.response?.data?.details || (error as any)?.response?.data?.error || (error as Error)?.message;
      Alert.alert('Calibration', errorMessage || 'Failed to retry the current stage.');
    }
  }, [calibrationStatus.status, driverId, speakEnglish, syncCalibrationStatusAfterStart]);

  const closeCalibrationModal = useCallback(() => {
    if (calibrationStatus.inProgress || isCalibrationStarting) return;
    setShowCalibrationModal(false);
  }, [calibrationStatus.inProgress, isCalibrationStarting]);

  const toggleModel = useCallback(async (shouldRun: boolean) => {
    setIsToggling(true);
    try {
      if (shouldRun) {
        const response = await apiClient.post(API_ENDPOINTS.DRIVER_MODEL_START, { driver_id: driverId });
        if (response.data.success) {
          setModelStatus({ running: true, pid: response.data.pid });
          setTimeout(() => {
            fetchStatus();
            fetchModelStatus();
            fetchCalibrationStatus();
          }, 900);
        } else {
          throw new Error(response.data?.details || response.data?.error || 'Failed to start model');
        }
      } else {
        const response = await apiClient.post(API_ENDPOINTS.DRIVER_MODEL_STOP, { driver_id: driverId });
        if (response.data.success) {
          startCalibrationLockRef.current = false;
          setModelStatus({ running: false, pid: null });
          setShowCalibrationModal(false);
          setIsCalibrationStarting(false);
          setCountdownValue(null);
          setCalibrationStatus(DEFAULT_CALIBRATION_STATUS);
          stopSpeech();
          setTimeout(() => {
            fetchStatus();
            fetchModelStatus();
            fetchCalibrationStatus();
          }, 500);
        } else {
          throw new Error(response.data?.details || response.data?.error || 'Failed to stop model');
        }
      }
    } catch (error) {
      console.error('Failed to toggle model:', error);
      const fallbackMessage = shouldRun ? 'Could not start driver monitor.' : 'Could not stop driver monitor.';
      const errorMessage = (error as any)?.response?.data?.details || (error as any)?.response?.data?.error || (error as Error)?.message;
      Alert.alert('Driver Monitor', errorMessage ? `${fallbackMessage}\n${errorMessage}` : fallbackMessage);
      fetchModelStatus();
    }
    setIsToggling(false);
  }, [driverId, fetchCalibrationStatus, fetchModelStatus, fetchStatus, stopSpeech]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchModelStatus(), fetchAlerts(), fetchCalibrationStatus()]);
    setRefreshing(false);
  }, [fetchStatus, fetchModelStatus, fetchAlerts, fetchCalibrationStatus]);

  useEffect(() => {
    fetchStatus();
    fetchModelStatus();
    fetchAlerts();
    fetchCalibrationStatus();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchStatus();
        fetchModelStatus();
        fetchAlerts();
        fetchCalibrationStatus();
      }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, fetchAlerts, fetchCalibrationStatus, fetchModelStatus, fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    if (!showCalibrationModal && !calibrationStatus.inProgress && !isCalibrationStarting) return;

    const interval = setInterval(() => {
      fetchCalibrationStatus();
    }, 800);

    return () => clearInterval(interval);
  }, [autoRefresh, showCalibrationModal, calibrationStatus.inProgress, isCalibrationStarting, fetchCalibrationStatus]);

  useEffect(() => {
    const previousState = previousCalibrationStateRef.current;
    const currentState = calibrationStatus.status;
    if (previousState === currentState) return;

    previousCalibrationStateRef.current = currentState;

    const runVoiceCue = async () => {
      if (currentState === 'REJECTED') {
        if (calibrationStatus.autoRetryUsed && !autoRetrySpoken) {
          setAutoRetrySpoken(true);
          await speakEnglish('Calibration skipped some unstable samples and is retrying the same stage automatically.');
        }
      }

      if (currentState === 'PAUSED') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        await speakEnglish('Calibration paused on the current stage. Fix the issue shown on screen and tap retry stage.');
      }

      if (currentState === 'FAILED') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        await speakEnglish('Calibration is unavailable right now. Please restart calibration.');
      }

      if (currentState === 'COMPLETED') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await speakEnglish('Calibration complete. Monitoring resumed.');

        if (closeModalTimerRef.current) {
          clearTimeout(closeModalTimerRef.current);
        }
        closeModalTimerRef.current = setTimeout(() => {
          setShowCalibrationModal(false);
        }, 1400);
      }
    };

    runVoiceCue();
  }, [autoRetrySpoken, calibrationStatus.autoRetryUsed, calibrationStatus.status, speakEnglish]);

  useEffect(() => {
    return () => {
      stopSpeech();
      if (closeModalTimerRef.current) {
        clearTimeout(closeModalTimerRef.current);
      }
    };
  }, [stopSpeech]);

  const groupedAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { today: MonitorAlert[]; yesterday: MonitorAlert[]; earlier: MonitorAlert[] } = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    alerts.forEach(alert => {
      const alertDate = new Date(alert.created_at);
      alertDate.setHours(0, 0, 0, 0);

      if (alertDate.getTime() === today.getTime()) {
        groups.today.push(alert);
      } else if (alertDate.getTime() === yesterday.getTime()) {
        groups.yesterday.push(alert);
      } else {
        groups.earlier.push(alert);
      }
    });

    return groups;
  }, [alerts]);

  const stats = useMemo(() => {
    const todayAlerts = groupedAlerts.today;
    const dangerCount = alerts.filter(a => a.severity === 'DANGER').length;

    return {
      today: todayAlerts.length,
      danger: dangerCount,
      score: Math.round((1 - (dangerCount / Math.max(alerts.length, 1))) * 100),
    };
  }, [alerts, groupedAlerts]);

  const formatTime = (timestamp: string) => {
    const ts = parseInt(timestamp, 10);
    const date = !isNaN(ts) && ts > 1000000000000 ? new Date(ts) : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const progress = Math.max(0, Math.min(100, calibrationStatus.progressPercent));
  const disableCalibrateButton = !modelStatus.running || isToggling || isCalibrationStarting || calibrationStatus.inProgress || startCalibrationLockRef.current;
  const stageLabel = calibrationStatus.stageName ? calibrationStatus.stageName.replace(/_/g, ' ') : 'FORWARD';
  const phaseLabel = calibrationStatus.stagePhase ? calibrationStatus.stagePhase.toUpperCase() : 'SETTLE';
  const calibrationHeadline =
    calibrationStatus.status === 'IN_PROGRESS'
      ? `${stageLabel} stage in progress`
      : calibrationStatus.status === 'REJECTED'
      ? 'Stage retrying automatically'
      : calibrationStatus.status === 'PAUSED'
      ? 'Stage paused for manual retry'
      : calibrationStatus.status === 'FAILED'
      ? 'Calibration unavailable'
      : calibrationStatus.status === 'COMPLETED'
      ? 'Calibration complete'
      : 'Ready to calibrate';

  return (
    <View className="flex-1 bg-slate-100">
      <View className="bg-slate-900 pt-14 pb-4 px-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-white">Driver Monitor</Text>
          <View className="flex-row items-center">
            <View className={`w-2 h-2 rounded-full mr-2 ${systemStatus.status === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <Text className="text-slate-400 text-sm">
              {systemStatus.status === 'online' ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-4 mt-4">
          <View className={`p-6 rounded-2xl ${modelStatus.running ? 'bg-emerald-500' : 'bg-slate-400'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className={`w-16 h-16 rounded-2xl items-center justify-center ${modelStatus.running ? 'bg-white/20' : 'bg-white/30'}`}>
                  {isToggling ? (
                    <ActivityIndicator size={32} color="white" />
                  ) : (
                    <Ionicons
                      name={modelStatus.running ? 'car' : 'car-outline'}
                      size={32}
                      color="white"
                    />
                  )}
                </View>
                <View className="ml-4">
                  <Text className="text-white/70 text-sm uppercase tracking-wider">Status</Text>
                  <Text className="text-white text-2xl font-bold">
                    {isToggling
                      ? (modelStatus.running ? 'Stopping' : 'Starting')
                      : (modelStatus.running ? 'Monitoring' : 'Inactive')}
                  </Text>
                </View>
              </View>

              <Switch
                value={modelStatus.running}
                onValueChange={toggleModel}
                disabled={isToggling}
                trackColor={{ false: 'rgba(255,255,255,0.3)', true: 'rgba(255,255,255,0.3)' }}
                thumbColor="white"
                style={{ transform: [{ scale: 1.2 }] }}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          disabled={disableCalibrateButton}
          onPress={startCalibration}
          className={`mx-4 mt-3 p-4 rounded-xl flex-row items-center justify-center ${disableCalibrateButton ? 'bg-slate-300' : 'bg-blue-600'}`}
        >
          {isCalibrationStarting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Ionicons name="construct-outline" size={18} color="white" />
          )}
          <Text className="text-white font-bold ml-2">
            {isCalibrationStarting ? 'Preparing Calibration...' : 'Recalibrate Camera'}
          </Text>
        </TouchableOpacity>

        <Text className="mx-4 mt-2 text-xs text-slate-500">
          Voice prompts: English only. Keep eyes on the road-facing camera.
        </Text>

        <View className="flex-row mx-4 mt-4 gap-3">
          <StatCard value={stats.today} label="Today" icon="today-outline" iconColor="#3B82F6" />
          <StatCard
            value={stats.danger}
            label="Critical"
            icon="warning-outline"
            iconColor="#EF4444"
            accentColor={stats.danger > 0 ? '#EF4444' : undefined}
          />
          <StatCard
            value={`${stats.score}%`}
            label="Score"
            icon="shield-checkmark-outline"
            iconColor="#10B981"
            accentColor={stats.score >= 80 ? '#10B981' : stats.score >= 50 ? '#F59E0B' : '#EF4444'}
          />
        </View>

        <TouchableOpacity
          onPress={() => setAutoRefresh(!autoRefresh)}
          className="mx-4 mt-4 flex-row items-center justify-end"
        >
          <Ionicons
            name={autoRefresh ? 'sync' : 'sync-outline'}
            size={16}
            color={autoRefresh ? '#3B82F6' : '#94A3B8'}
          />
          <Text className={`ml-1 text-sm ${autoRefresh ? 'text-blue-500' : 'text-slate-400'}`}>
            Auto-refresh {autoRefresh ? 'on' : 'off'}
          </Text>
        </TouchableOpacity>

        <View className="mx-4 mt-4 bg-white rounded-2xl p-4 mb-6">
          <Text className="text-lg font-semibold text-slate-800 mb-4">Activity</Text>

          {alerts.length === 0 ? (
            <View className="py-8 items-center">
              <Ionicons name="car-sport-outline" size={40} color="#CBD5E1" />
              <Text className="text-slate-400 mt-3 text-center">No alerts recorded</Text>
              <Text className="text-slate-300 text-sm text-center mt-1">Detections will appear here</Text>
            </View>
          ) : (
            <>
              {groupedAlerts.today.length > 0 && (
                <TimelineGroup title="Today">
                  {groupedAlerts.today.map((alert, idx) => (
                    <AlertTimelineItem
                      key={String(alert.id)}
                      time={formatTime(alert.created_at)}
                      title={getDetectionTitle(alert.alert_type)}
                      message={alert.message}
                      severity={alert.severity}
                      confidence={alert.confidence}
                      icon={getDetectionIcon(alert.alert_type)}
                      isLast={idx === groupedAlerts.today.length - 1 && groupedAlerts.yesterday.length === 0 && groupedAlerts.earlier.length === 0}
                    />
                  ))}
                </TimelineGroup>
              )}

              {groupedAlerts.yesterday.length > 0 && (
                <TimelineGroup title="Yesterday">
                  {groupedAlerts.yesterday.map((alert, idx) => (
                    <AlertTimelineItem
                      key={String(alert.id)}
                      time={formatTime(alert.created_at)}
                      title={getDetectionTitle(alert.alert_type)}
                      message={alert.message}
                      severity={alert.severity}
                      confidence={alert.confidence}
                      icon={getDetectionIcon(alert.alert_type)}
                      isLast={idx === groupedAlerts.yesterday.length - 1 && groupedAlerts.earlier.length === 0}
                    />
                  ))}
                </TimelineGroup>
              )}

              {groupedAlerts.earlier.length > 0 && (
                <TimelineGroup title="Earlier">
                  {groupedAlerts.earlier.slice(0, 10).map((alert, idx) => (
                    <AlertTimelineItem
                      key={String(alert.id)}
                      time={formatTime(alert.created_at)}
                      title={getDetectionTitle(alert.alert_type)}
                      message={alert.message}
                      severity={alert.severity}
                      confidence={alert.confidence}
                      icon={getDetectionIcon(alert.alert_type)}
                      isLast={idx === Math.min(groupedAlerts.earlier.length, 10) - 1}
                    />
                  ))}
                </TimelineGroup>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showCalibrationModal}
        animationType="fade"
        transparent
        onRequestClose={closeCalibrationModal}
      >
        <View className="flex-1 bg-black/45 items-center justify-center px-5">
          <View className="bg-white rounded-2xl p-5" style={{ width: '100%', maxWidth: 430 }}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Ionicons
                  name={
                    calibrationStatus.status === 'COMPLETED'
                      ? 'checkmark-circle'
                      : calibrationStatus.status === 'PAUSED'
                      ? 'pause-circle'
                      : calibrationStatus.status === 'FAILED'
                      ? 'alert-circle'
                      : 'videocam'
                  }
                  size={22}
                  color={
                    calibrationStatus.status === 'COMPLETED'
                      ? '#16A34A'
                      : calibrationStatus.status === 'PAUSED'
                      ? '#F59E0B'
                      : calibrationStatus.status === 'FAILED'
                      ? '#DC2626'
                      : '#2563EB'
                  }
                />
                <Text className="ml-2 text-lg font-bold text-slate-800">Calibration</Text>
              </View>

              <TouchableOpacity
                disabled={calibrationStatus.inProgress || isCalibrationStarting}
                onPress={closeCalibrationModal}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={calibrationStatus.inProgress || isCalibrationStarting ? '#CBD5E1' : '#64748B'}
                />
              </TouchableOpacity>
            </View>

            {isCalibrationStarting ? (
              <View className="items-center py-4">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text className="mt-3 text-slate-700 font-semibold">Preparing calibration...</Text>
                {countdownValue !== null && (
                  <Text className="mt-1 text-4xl font-bold text-blue-600">{countdownValue}</Text>
                )}
              </View>
            ) : (
              <>
                <Text className="text-slate-700 font-semibold">{calibrationHeadline}</Text>
                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-xs font-semibold text-blue-700">{stageLabel}</Text>
                  <Text className="text-xs text-slate-500">Phase {phaseLabel}</Text>
                </View>

                <View className="mt-4 h-3 bg-slate-200 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      backgroundColor:
                        calibrationStatus.status === 'COMPLETED'
                          ? '#16A34A'
                          : calibrationStatus.status === 'PAUSED'
                          ? '#F59E0B'
                          : '#2563EB',
                    }}
                  />
                </View>

                <View className="mt-2 flex-row items-center justify-between">
                  <Text className="text-xs text-slate-500">
                    {calibrationStatus.framesCollected} / {Math.max(1, calibrationStatus.totalFrames)} frames
                  </Text>
                  <Text className="text-xs font-bold text-slate-700">{progress}%</Text>
                </View>

                <View className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <Text className="text-slate-700 text-xs">
                    Accepted this stage: {calibrationStatus.acceptedSampleCount}  |  Skipped: {calibrationStatus.skippedFrameCount}
                  </Text>
                </View>

                {Boolean(calibrationStatus.rejectReason) && (
                  <View className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <Text className="text-amber-800 text-xs">
                      {calibrationStatus.rejectReason}
                    </Text>
                  </View>
                )}

                {Boolean(calibrationStatus.skipReason) && (
                  <View className="mt-3 bg-sky-50 border border-sky-200 rounded-xl p-3">
                    <Text className="text-sky-800 text-xs">
                      Current skip reason: {calibrationStatus.skipReason}
                    </Text>
                  </View>
                )}

                {Boolean(calibrationStatus.instruction) && (
                  <Text className="mt-3 text-xs text-slate-500">{calibrationStatus.instruction}</Text>
                )}

                <View className="flex-row mt-5 gap-3">
                  {calibrationStatus.status === 'PAUSED' && (
                    <TouchableOpacity
                      onPress={retryCalibrationStage}
                      className="flex-1 bg-blue-600 p-3 rounded-xl items-center"
                    >
                      <Text className="text-white font-bold">Retry Stage</Text>
                    </TouchableOpacity>
                  )}

                  {calibrationStatus.status === 'FAILED' && (
                    <TouchableOpacity
                      onPress={startCalibration}
                      className="flex-1 bg-blue-600 p-3 rounded-xl items-center"
                    >
                      <Text className="text-white font-bold">Restart</Text>
                    </TouchableOpacity>
                  )}

                  {!calibrationStatus.inProgress && !isCalibrationStarting && (
                    <TouchableOpacity
                      onPress={closeCalibrationModal}
                      className={`p-3 rounded-xl items-center ${
                        calibrationStatus.status === 'FAILED' || calibrationStatus.status === 'PAUSED'
                          ? 'flex-1 bg-slate-200'
                          : 'w-full bg-slate-200'
                      }`}
                    >
                      <Text className="text-slate-700 font-semibold">Close</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
