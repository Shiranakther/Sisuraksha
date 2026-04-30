import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';
import { StatCard } from '../ui/stat-card';
import { AlertTimelineItem, TimelineGroup } from '../ui/alert-timeline';

const FOOTBOARD_ESP_IP = '192.168.1.104';
const LIVE_SENSOR_POLL_MS = 250;
const LIVE_SENSOR_TIMEOUT_MS = 600;
const LIVE_ALARM_COOLDOWN_MS = 1500;
const LIVE_STREAM_STALE_MS = 1200;

interface SafetyAlert {
  id: number;
  timestamp: string;
  alert_type: string | null;
  status: string | null;
  speed: number;
  confidence: number;
  message: string | null;
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

type SensorSteps = { s1: boolean; s2: boolean; s3: boolean };

interface LiveSensorState extends SensorSteps {
  online: boolean;
  updatedAt: string | null;
}

// ---------- Alert helpers ----------

/** Parse `alert_type` like "IR Sensors Only (Bottom Step)" → which IR steps fired. */
const extractSensorSteps = (alertType: string | null): SensorSteps | null => {
  const type = alertType || '';
  if (!type.includes('IR Sensors')) return null;
  if (type.includes('Bottom Step')) return { s1: false, s2: false, s3: true };
  if (type.includes('Mid Step'))    return { s1: false, s2: true,  s3: false };
  if (type.includes('Top Step'))    return { s1: true,  s2: false, s3: false };
  // Dual AI+IR — treat all as active
  if (type.includes('AI + IR'))     return { s1: true,  s2: true,  s3: true  };
  return null;
};

/** Map alert_type → detection source tag for the badge. */
const getDetectionSource = (alertType: string | null): 'IR_ONLY' | 'AI_ONLY' | 'DUAL' | null => {
  const type = alertType || '';
  if (type.includes('AI + IR'))       return 'DUAL';
  if (type.includes('IR Sensors Only')) return 'IR_ONLY';
  if (type.includes('AI Vision Only')) return 'AI_ONLY';
  return null;
};

/** Strip legacy "!!!" wrapper from old-format messages stored in DB. */
const sanitizeMessage = (msg: string | null): string =>
  (msg || 'Footboard safety event received').replace(/^!+\s*/g, '').replace(/\s*!+$/g, '').trim();

const getAlertIcon = (alertType: string | null, status: string | null): keyof typeof Ionicons.glyphMap => {
  const type = alertType || '';
  if (type.includes('Bottom Step')) return 'alert';
  if (type.includes('IR Sensors Only')) return 'hardware-chip';
  if (type.includes('AI + IR')) return 'shield-half';
  if (type.includes('AI Vision')) return 'eye';
  if (status === 'CRITICAL') return 'warning';
  if (status === 'WARNING') return 'alert-circle';
  if (status === 'SAFE') return 'checkmark-circle';
  return 'information-circle';
};

const getAlertTitle = (alertType: string | null, status: string | null): string => {
  const type = alertType || 'Footboard Event';
  // IR-only sensor triggers — step-specific titles
  if (type.includes('IR Sensors Only')) {
    if (type.includes('Bottom Step')) return 'Danger: Bottom Step Blocked (S3)';
    if (type.includes('Mid Step'))    return 'Warning: Mid Step Occupied (S2)';
    if (type.includes('Top Step'))    return 'Caution: Entry Step Occupied (S1)';
    return 'IR Sensor Triggered';
  }
  if (type.includes('AI + IR'))       return 'Critical: AI + IR Sensors Triggered';
  if (type.includes('AI Vision Only')) return 'AI Vision: Person on Footboard';
  if (status === 'CRITICAL') return 'Critical Alert';
  if (status === 'WARNING')  return 'Warning Detected';
  if (status === 'SAFE')     return 'Area Clear';
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function FootboardMonitor() {
  const driverId = '8c394627-e397-4bd5-928f-4cc66cfebac1';

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ status: 'offline', enabled: true, lastHeartbeat: null });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ running: false, pid: null });
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [liveSensorState, setLiveSensorState] = useState<LiveSensorState>({
    s1: false,
    s2: false,
    s3: false,
    online: false,
    updatedAt: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const espIp = FOOTBOARD_ESP_IP;

  // Audio Alarms
  const soundRef = useRef<Audio.Sound | null>(null);
  const lastAlertId = useRef<number | null>(null);
  const lastLiveOccupied = useRef(false);
  const lastLiveAlarmAt = useRef(0);
  const lastLiveStreamAt = useRef(0);
  const monitoringActiveRef = useRef(false);

  useEffect(() => {
    monitoringActiveRef.current = modelStatus.running;

    if (!modelStatus.running) {
      lastLiveOccupied.current = false;
      lastLiveStreamAt.current = 0;
      setLiveSensorState({
        s1: false,
        s2: false,
        s3: false,
        online: false,
        updatedAt: null,
      });
    }
  }, [modelStatus.running]);

  // Pre-load sound once on mount
  useEffect(() => {
    let isMounted = true;
    const initAudio = async () => {
      try {
        // Required for sound to play on iOS silent mode and Android
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });
        const { sound: initialSound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/warining footboard is occupied.mp3')
        );
        if (isMounted) {
          soundRef.current = initialSound;
        } else {
          initialSound.unloadAsync();
        }
      } catch (err) {
        console.error("Failed to load audio file", err);
      }
    };
    initAudio();

    return () => {
      isMounted = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playAlarm = useCallback(async () => {
    try {
      if (!soundRef.current) return;
      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      // Only stop if already playing — calling stopAsync on an idle sound throws
      if (status.isPlaying) {
        await soundRef.current.stopAsync();
      }
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.playAsync();
    } catch (error) {
      console.error("Couldn't play audio alarm", error);
    }
  }, []);

  const applyLiveSensorData = useCallback((data: Partial<SensorSteps>) => {
    if (!monitoringActiveRef.current) return;

    const nextSensorState = {
      s1: Boolean(data.s1),
      s2: Boolean(data.s2),
      s3: Boolean(data.s3),
      online: true,
      updatedAt: new Date().toISOString(),
    };
    const isOccupied = nextSensorState.s1 || nextSensorState.s2 || nextSensorState.s3;
    const now = Date.now();

    if (
      isOccupied &&
      !lastLiveOccupied.current &&
      now - lastLiveAlarmAt.current >= LIVE_ALARM_COOLDOWN_MS
    ) {
      lastLiveAlarmAt.current = now;
      void playAlarm();
    }

    lastLiveOccupied.current = isOccupied;
    setLiveSensorState(nextSensorState);
  }, [playAlarm]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.SAFETY_STATUS}?driver_id=${driverId}`);
      const data = response.data;
      setSystemStatus(data);
      // If system is offline, model can't be running — keep UI in sync
      if (data.status === 'offline') {
        setModelStatus({ running: false, pid: null });
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  }, [driverId]);

  const fetchModelStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.MODEL_STATUS}?driver_id=${driverId}`);
      setModelStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch model status:', error);
    }
  }, [driverId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.SAFETY_ALERTS}?driver_id=${driverId}`);
      if (response.data && Array.isArray(response.data)) {
        setAlerts(response.data);

        // Trigger Audio Alarm on new CRITICAL or WARNING alerts
        if (response.data.length > 0) {
          const latestAlert = response.data[0];

          const isSensorAlert = (latestAlert.alert_type || '').includes('IR Sensors');

          if (lastAlertId.current !== null && latestAlert.id !== lastAlertId.current && !isSensorAlert) {
            if (latestAlert.status === 'CRITICAL' || latestAlert.status === 'WARNING') {
              playAlarm();
            }
          }
          lastAlertId.current = latestAlert.id;
        }
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, [driverId, playAlarm]);

  const fetchLiveSensorState = useCallback(async () => {
    if (!monitoringActiveRef.current) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), LIVE_SENSOR_TIMEOUT_MS);
      const response = await fetch(`http://${espIp}/data?t=${Date.now()}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`ESP32 returned ${response.status}`);
      }

      const data = await response.json();
      applyLiveSensorData(data);
    } catch (error) {
      setLiveSensorState(prev => ({
        ...prev,
        online: false,
      }));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [applyLiveSensorData, espIp]);

  const toggleModel = useCallback(async (shouldRun: boolean) => {
    setIsToggling(true);
    try {
      if (shouldRun) {
        const response = await apiClient.post(API_ENDPOINTS.MODEL_START, {
          driver_id: driverId
        });
        if (response.data.success) {
          setModelStatus({ running: true, pid: response.data.pid });
        }
      } else {
        const response = await apiClient.post(API_ENDPOINTS.MODEL_STOP, { driver_id: driverId });
        if (response.data.success) {
          setModelStatus({ running: false, pid: null });
          // Immediately re-fetch status to confirm offline
          setTimeout(() => { fetchStatus(); fetchModelStatus(); }, 500);
        }
      }
    } catch (error) {
      console.error('Failed to toggle model:', error);
      // Re-fetch to get true state from server on error
      fetchModelStatus();
    }
    setIsToggling(false);
  }, [driverId, fetchStatus, fetchModelStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStatus(),
      fetchModelStatus(),
      fetchAlerts(),
      ...(modelStatus.running ? [fetchLiveSensorState()] : []),
    ]);
    setRefreshing(false);
  }, [fetchStatus, fetchModelStatus, fetchAlerts, fetchLiveSensorState, modelStatus.running]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const pollData = async () => {
      if (!isMounted) return;

      // Await all fetches so they don't overlap if network is slow
      await Promise.all([
        fetchStatus(),
        fetchModelStatus(),
        fetchAlerts()
      ]);

      if (isMounted && autoRefresh) {
        const pollingRate = modelStatus.running ? 5000 : 15000;
        timeoutId = setTimeout(pollData, pollingRate);
      }
    };

    if (autoRefresh) {
      pollData(); // Start the polling loop
    }

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [autoRefresh, fetchStatus, fetchModelStatus, fetchAlerts, modelStatus.running]);

  useEffect(() => {
    if (!autoRefresh || !modelStatus.running) return;

    const xhr = new XMLHttpRequest();
    let cursor = 0;
    let buffer = '';

    const consumeEventBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      const eventName = lines
        .find(line => line.startsWith('event:'))
        ?.slice('event:'.length)
        .trim();
      const dataText = lines
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice('data:'.length).trim())
        .join('\n');

      if (eventName !== 's' || !dataText) return;

      try {
        const data = JSON.parse(dataText);
        lastLiveStreamAt.current = Date.now();
        applyLiveSensorData(data);
      } catch (error) {
        // Ignore incomplete stream fragments; the next chunk will carry a full event.
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.LOADING && xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      const chunk = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      buffer += chunk;

      let splitIndex = buffer.search(/\r?\n\r?\n/);
      while (splitIndex >= 0) {
        const block = buffer.slice(0, splitIndex).trim();
        buffer = buffer.slice(splitIndex + (buffer[splitIndex] === '\r' ? 4 : 2));
        if (block) consumeEventBlock(block);
        splitIndex = buffer.search(/\r?\n\r?\n/);
      }
    };

    xhr.onerror = () => {
      setLiveSensorState(prev => ({ ...prev, online: false }));
    };

    xhr.open('GET', `http://${espIp}/events`, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.send();

    return () => {
      xhr.abort();
    };
  }, [applyLiveSensorData, autoRefresh, espIp, modelStatus.running]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const pollLiveSensors = async () => {
      if (!isMounted || !autoRefresh || !modelStatus.running) return;

      const streamIsFresh = Date.now() - lastLiveStreamAt.current < LIVE_STREAM_STALE_MS;
      if (!streamIsFresh) {
        await fetchLiveSensorState();
      }

      if (isMounted && autoRefresh) {
        timeoutId = setTimeout(pollLiveSensors, LIVE_SENSOR_POLL_MS);
      }
    };

    if (autoRefresh && modelStatus.running) {
      pollLiveSensors();
    }

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [autoRefresh, fetchLiveSensorState, modelStatus.running]);

  const groupedAlerts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { today: SafetyAlert[]; yesterday: SafetyAlert[]; earlier: SafetyAlert[] } = {
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
    const criticalCount = alerts.filter(a => a.status === 'CRITICAL').length;
    const warningCount = alerts.filter(a => a.status === 'WARNING').length;

    return {
      today: todayAlerts.length,
      critical: criticalCount,
      warnings: warningCount,
    };
  }, [alerts, groupedAlerts]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const liveSensorRisk = !modelStatus.running
    ? 'OFF'
    : liveSensorState.s3
    ? 'CRITICAL'
    : (liveSensorState.s1 || liveSensorState.s2) ? 'WARNING' : 'SAFE';
  const liveSensorStatusText = !modelStatus.running
    ? 'Monitoring is off'
    : liveSensorState.online ? 'Reading live ESP32 state' : 'ESP32 live state unavailable';

  return (
    <View className="flex-1 bg-slate-100">
      {/* We removed the full header here to use the parent's generic header instead. */}
      {/* But let's show an inline status indicator */}
      <View className="flex-row items-center justify-end px-4 pt-4">
        <View className="flex-row items-center">
          <View className={`w-2 h-2 rounded-full mr-2 ${systemStatus.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <Text className="text-slate-500 text-sm font-medium">
            System {systemStatus.status === 'online' ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* --- SYSTEM TOGGLE --- */}
        <View className="mx-4 mt-4">
          <View className={`p-6 rounded-2xl ${modelStatus.running ? 'bg-indigo-500' : 'bg-slate-400'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className={`w-16 h-16 rounded-2xl items-center justify-center ${modelStatus.running ? 'bg-white/20' : 'bg-white/30'}`}>
                  {isToggling ? (
                    <ActivityIndicator size={32} color="white" />
                  ) : (
                    <Ionicons
                      name={modelStatus.running ? "scan-outline" : "eye-off-outline"}
                      size={32}
                      color="white"
                    />
                  )}
                </View>
                <View className="ml-4">
                  <Text className="text-white/70 text-sm uppercase tracking-wider">Footboard Area</Text>
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

        {/* --- OVERRIDE SETTINGS --- */}
        <TouchableOpacity
          className="mx-4 mt-3 flex-row items-center justify-end"
          onPress={() => setShowSettings(!showSettings)}
        >
          <Ionicons name="settings-outline" size={16} color="#94A3B8" />
          <Text className="text-slate-500 text-sm ml-1">{showSettings ? 'Hide Settings' : 'Hardware Settings'}</Text>
        </TouchableOpacity>

        {showSettings && (
          <View className="mx-4 mt-2 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <Text className="text-slate-800 font-semibold mb-2">ESP32 Sensor IP</Text>
            <View className="bg-slate-50 rounded-xl px-3 py-2 flex-row items-center border border-slate-200">
              <Ionicons name="hardware-chip-outline" size={20} color="#64748B" />
              <Text className="ml-2 text-slate-500 mr-2">http://</Text>
              <Text className="flex-1 text-slate-800">{espIp}</Text>
            </View>
            <Text className="text-xs text-slate-400 mt-2">
              If mDNS fails, the script will use this IP address to fetch IR sensor data.
            </Text>
          </View>
        )}

        {/* --- STAT CARD ROW --- */}
        <View className="flex-row mx-4 mt-4 gap-3">
          <StatCard
            value={stats.today}
            label="Today"
            icon="today-outline"
            iconColor="#3B82F6"
          />
          <StatCard
            value={stats.critical}
            label="Critical"
            icon="warning-outline"
            iconColor="#EF4444"
            accentColor={stats.critical > 0 ? '#EF4444' : undefined}
          />
          <StatCard
            value={stats.warnings}
            label="Warnings"
            icon="alert-circle-outline"
            iconColor="#F59E0B"
            accentColor={stats.warnings > 0 ? '#F59E0B' : undefined}
          />
        </View>

        {/* --- LIVE SENSOR OCCUPATION CARD --- */}
        <View className="mx-4 mt-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Ionicons name="hardware-chip-outline" size={16} color="#64748B" />
              <Text className="text-sm font-semibold text-slate-700 ml-2">Live IR Sensor Occupation</Text>
            </View>
            <Text className="text-xs text-slate-400">
              {!modelStatus.running
                ? 'Inactive'
                : liveSensorState.updatedAt ? formatTime(liveSensorState.updatedAt) : 'Waiting for ESP32'}
            </Text>
          </View>
          {/* Step indicator: S1=Entry, S2=Mid, S3=Bottom */}
          <View className="flex-row gap-2">
            {[
              { key: 's1', label: 'Entry', desc: 'Step 1', active: liveSensorState.s1, isDanger: false },
              { key: 's2', label: 'Mid', desc: 'Step 2', active: liveSensorState.s2, isDanger: false },
              { key: 's3', label: 'Bottom', desc: 'Step 3', active: liveSensorState.s3, isDanger: true },
            ].map(step => (
              <View
                key={step.key}
                className={`flex-1 py-3 rounded-xl items-center ${
                  step.active
                    ? (step.isDanger ? 'bg-red-500' : 'bg-amber-400')
                    : 'bg-slate-100'
                }`}
              >
                <Ionicons
                  name={step.active ? 'person' : 'remove-circle-outline'}
                  size={18}
                  color={step.active ? 'white' : '#CBD5E1'}
                />
                <Text className={`text-xs font-bold mt-1 ${step.active ? 'text-white' : 'text-slate-400'}`}>
                  {step.key.toUpperCase()}
                </Text>
                <Text className={`text-xs mt-0.5 ${step.active ? 'text-white/80' : 'text-slate-300'}`}>
                  {step.active ? (step.isDanger ? 'DANGER' : 'BLOCKED') : 'CLEAR'}
                </Text>
              </View>
            ))}
          </View>
          <View className="flex-row items-center mt-3 pt-3 border-t border-slate-100">
            <Ionicons
              name={modelStatus.running && liveSensorState.online ? 'radio-outline' : 'cloud-offline-outline'}
              size={14}
              color="#94A3B8"
            />
            <Text className="text-xs text-slate-500 ml-1">
              {liveSensorStatusText}
            </Text>
            <View className={`ml-auto px-2 py-0.5 rounded-full ${
              liveSensorRisk === 'OFF' ? 'bg-slate-100' : liveSensorRisk === 'CRITICAL' ? 'bg-red-100' : liveSensorRisk === 'WARNING' ? 'bg-amber-100' : 'bg-emerald-100'
            }`}>
              <Text className={`text-xs font-semibold ${
                liveSensorRisk === 'OFF' ? 'text-slate-500' : liveSensorRisk === 'CRITICAL' ? 'text-red-600' : liveSensorRisk === 'WARNING' ? 'text-amber-600' : 'text-emerald-600'
              }`}>
                {liveSensorRisk}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setAutoRefresh(!autoRefresh)}
          className="mx-4 mt-4 flex-row items-center justify-end"
        >
          <Ionicons
            name={autoRefresh ? "sync" : "sync-outline"}
            size={16}
            color={autoRefresh ? "#3B82F6" : "#94A3B8"}
          />
          <Text className={`ml-1 text-sm ${autoRefresh ? 'text-blue-500' : 'text-slate-400'}`}>
            Auto-refresh {autoRefresh ? 'on' : 'off'}
          </Text>
        </TouchableOpacity>

        <View className="mx-4 mt-4 bg-white rounded-2xl p-4 mb-6">
          <Text className="text-lg font-semibold text-slate-800 mb-4">Activity</Text>

          {alerts.length === 0 ? (
            <View className="py-8 items-center">
              <Ionicons name="shield-checkmark-outline" size={40} color="#CBD5E1" />
              <Text className="text-slate-400 mt-3 text-center">No alerts recorded</Text>
              <Text className="text-slate-300 text-sm text-center mt-1">
                Detections will appear here
              </Text>
            </View>
          ) : (
            <>
              {groupedAlerts.today.length > 0 && (
                <TimelineGroup title="Today">
                  {groupedAlerts.today.map((alert, idx) => (
                    <AlertTimelineItem
                      key={String(alert.id)}
                      time={formatTime(alert.created_at)}
                      title={getAlertTitle(alert.alert_type, alert.status)}
                      message={`${sanitizeMessage(alert.message)} • Speed: ${alert.speed} km/h`}
                      severity={alert.status ?? 'SAFE'}
                      confidence={alert.confidence}
                      icon={getAlertIcon(alert.alert_type, alert.status)}
                      sensorSteps={extractSensorSteps(alert.alert_type)}
                      detectionSource={getDetectionSource(alert.alert_type)}
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
                      title={getAlertTitle(alert.alert_type, alert.status)}
                      message={`${sanitizeMessage(alert.message)} • Speed: ${alert.speed} km/h`}
                      severity={alert.status ?? 'SAFE'}
                      confidence={alert.confidence}
                      icon={getAlertIcon(alert.alert_type, alert.status)}
                      sensorSteps={extractSensorSteps(alert.alert_type)}
                      detectionSource={getDetectionSource(alert.alert_type)}
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
                      title={getAlertTitle(alert.alert_type, alert.status)}
                      message={`${sanitizeMessage(alert.message)} • Speed: ${alert.speed} km/h`}
                      severity={alert.status ?? 'SAFE'}
                      confidence={alert.confidence}
                      icon={getAlertIcon(alert.alert_type, alert.status)}
                      sensorSteps={extractSensorSteps(alert.alert_type)}
                      detectionSource={getDetectionSource(alert.alert_type)}
                      isLast={idx === Math.min(groupedAlerts.earlier.length, 10) - 1}
                    />
                  ))}
                </TimelineGroup>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View >
  );
}
