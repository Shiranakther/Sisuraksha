import React, { useEffect, useState, useCallback, useContext, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';
import { AuthContext } from '../../auth/AuthContext';
import { StatCard } from '../../components/ui/stat-card';
import { AlertTimelineItem, TimelineGroup } from '../../components/ui/alert-timeline';

interface SafetyAlert {
  id: number;
  timestamp: string;
  alert_type: string;
  status: string;
  speed: number;
  confidence: number;
  message: string;
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

// Alert type to icon mapping
const getAlertIcon = (alertType: string, status: string): keyof typeof Ionicons.glyphMap => {
  const type = alertType.toLowerCase();
  if (type.includes('danger') || status === 'CRITICAL') return 'warning';
  if (type.includes('warning')) return 'alert-circle';
  if (type.includes('safe')) return 'checkmark-circle';
  return 'information-circle';
};

const getAlertTitle = (alertType: string, status: string): string => {
  if (status === 'CRITICAL') return 'Critical Alert';
  if (status === 'WARNING') return 'Warning Detected';
  if (status === 'SAFE') return 'Area Clear';
  return alertType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export default function SafetyMonitorScreen() {
  const authContext = useContext(AuthContext);
  const driverId = '8c394627-e397-4bd5-928f-4cc66cfebac1';
  
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ status: 'offline', enabled: true, lastHeartbeat: null });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ running: false, pid: null });
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.SAFETY_STATUS}?driver_id=${driverId}`);
      setSystemStatus(response.data);
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
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  }, [driverId]);

  const toggleModel = useCallback(async (shouldRun: boolean) => {
    setIsToggling(true);
    try {
      if (shouldRun) {
        const response = await apiClient.post(API_ENDPOINTS.MODEL_START, { driver_id: driverId });
        if (response.data.success) {
          setModelStatus({ running: true, pid: response.data.pid });
        }
      } else {
        const response = await apiClient.post(API_ENDPOINTS.MODEL_STOP, { driver_id: driverId });
        if (response.data.success) {
          setModelStatus({ running: false, pid: null });
        }
      }
    } catch (error) {
      console.error('Failed to toggle model:', error);
    }
    setIsToggling(false);
  }, [driverId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchModelStatus(), fetchAlerts()]);
    setRefreshing(false);
  }, [fetchStatus, fetchModelStatus, fetchAlerts]);

  useEffect(() => {
    fetchStatus();
    fetchModelStatus();
    fetchAlerts();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchStatus();
        fetchAlerts();
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, fetchStatus, fetchAlerts]);

  // Group alerts by date
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

  // Stats
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

  return (
    <View className="flex-1 bg-slate-100">
      {/* Header */}
      <View className="bg-slate-900 pt-14 pb-4 px-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-white">Footboard Safety</Text>
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
        {/* Large Status Indicator */}
        <View className="mx-4 mt-4">
          <View className={`p-6 rounded-2xl ${modelStatus.running ? 'bg-blue-500' : 'bg-slate-400'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className={`w-16 h-16 rounded-2xl items-center justify-center ${modelStatus.running ? 'bg-white/20' : 'bg-white/30'}`}>
                  {isToggling ? (
                    <ActivityIndicator size={32} color="white" />
                  ) : (
                    <Ionicons 
                      name={modelStatus.running ? "videocam" : "videocam-outline"} 
                      size={32} 
                      color="white" 
                    />
                  )}
                </View>
                <View className="ml-4">
                  <Text className="text-white/70 text-sm uppercase tracking-wider">Detection</Text>
                  <Text className="text-white text-2xl font-bold">
                    {isToggling 
                      ? (modelStatus.running ? 'Stopping' : 'Starting') 
                      : (modelStatus.running ? 'Active' : 'Inactive')}
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

        {/* Stats Row */}
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

        {/* Auto-refresh toggle */}
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

        {/* Alerts Timeline */}
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
                      message={`${alert.message} • Speed: ${alert.speed} km/h`}
                      severity={alert.status}
                      confidence={alert.confidence}
                      icon={getAlertIcon(alert.alert_type, alert.status)}
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
                      message={`${alert.message} • Speed: ${alert.speed} km/h`}
                      severity={alert.status}
                      confidence={alert.confidence}
                      icon={getAlertIcon(alert.alert_type, alert.status)}
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
                      message={`${alert.message} • Speed: ${alert.speed} km/h`}
                      severity={alert.status}
                      confidence={alert.confidence}
                      icon={getAlertIcon(alert.alert_type, alert.status)}
                      isLast={idx === Math.min(groupedAlerts.earlier.length, 10) - 1}
                    />
                  ))}
                </TimelineGroup>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}