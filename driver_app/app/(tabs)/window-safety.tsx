import React, { useEffect, useState, useCallback, useContext } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';
import { AuthContext } from '../../auth/AuthContext';

interface SafetyAlert {
  id: number;
  timestamp: string;
  alert_type: string;
  severity: string;
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

export default function WindowSafetyScreen() {
  const authContext = useContext(AuthContext);
  // Use the working driver_id that has proper foreign key in database
  const driverId = '8c394627-e397-4bd5-928f-4cc66cfebac1';
  
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ status: 'offline', enabled: true, lastHeartbeat: null });
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ running: false, pid: null });
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.WINDOW_SAFETY_STATUS}?driver_id=${driverId}`);
      setSystemStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  }, [driverId]);

  const fetchModelStatus = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.WINDOW_MODEL_STATUS}?driver_id=${driverId}`);
      setModelStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch model status:', error);
    }
  }, [driverId]);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.WINDOW_SAFETY_ALERTS}?driver_id=${driverId}`);
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
        // Start the model
        const response = await apiClient.post(API_ENDPOINTS.WINDOW_MODEL_START, { driver_id: driverId });
        if (response.data.success) {
          setModelStatus({ running: true, pid: response.data.pid });
        }
      } else {
        // Stop the model
        const response = await apiClient.post(API_ENDPOINTS.WINDOW_MODEL_STOP, { driver_id: driverId });
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

    // Auto-refresh every 3 seconds when enabled
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

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'DANGER': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' };
      case 'WARNING': return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' };
      case 'SAFE': return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' };
      default: return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' };
    }
  };

  // Detection type styling - differentiates HEAD, HAND, BODY
  // Checks both alert_type AND message for backwards compatibility
  const getDetectionStyle = (alertType: string, message: string = '') => {
    const type = alertType.toLowerCase();
    const msg = message.toLowerCase();
    
    // Check both alert_type and message content
    if (type.includes('head') || msg.includes('head')) {
      return {
        bg: 'bg-red-50',
        border: 'border-red-400',
        accent: 'bg-red-500',
        text: 'text-red-700',
        badge: 'bg-red-500',
        icon: 'person' as const,
        iconColor: '#DC2626',
        label: 'HEAD'
      };
    } else if (type.includes('hand') || msg.includes('hand')) {
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-400',
        accent: 'bg-orange-500',
        text: 'text-orange-700',
        badge: 'bg-orange-500',
        icon: 'hand-left' as const,
        iconColor: '#EA580C',
        label: 'HAND'
      };
    } else if (type.includes('body') || msg.includes('body')) {
      return {
        bg: 'bg-purple-50',
        border: 'border-purple-400',
        accent: 'bg-purple-500',
        text: 'text-purple-700',
        badge: 'bg-purple-500',
        icon: 'body' as const,
        iconColor: '#7C3AED',
        label: 'BODY'
      };
    }
    // Default fallback
    return {
      bg: 'bg-slate-50',
      border: 'border-slate-400',
      accent: 'bg-slate-500',
      text: 'text-slate-700',
      badge: 'bg-slate-500',
      icon: 'alert-circle' as const,
      iconColor: '#64748B',
      label: 'UNKNOWN'
    };
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="bg-white pt-14 pb-4 px-6 shadow-sm">
        <Text className="text-2xl font-bold text-slate-800">Window Safety</Text>
        <Text className="text-slate-500">Head & Hand Detection System</Text>
      </View>

      {/* Model Control Card - Main Switch */}
      <View className="mx-4 mt-4">
        <View className={`p-4 rounded-2xl border ${modelStatus.running ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              {isToggling ? (
                <ActivityIndicator size={28} color="#3B82F6" />
              ) : (
                <Ionicons 
                  name={modelStatus.running ? "eye" : "eye-outline"} 
                  size={28} 
                  color={modelStatus.running ? "#3B82F6" : "#94A3B8"} 
                />
              )}
              <View className="ml-3 flex-1">
                <Text className="text-lg font-semibold text-slate-800">
                  Window Detection Model
                </Text>
                <Text className={`text-sm ${modelStatus.running ? 'text-blue-600' : 'text-slate-400'}`}>
                  {isToggling 
                    ? (modelStatus.running ? 'Stopping...' : 'Starting camera & AI...') 
                    : (modelStatus.running ? `Running (PID: ${modelStatus.pid})` : 'Model is stopped')}
                </Text>
              </View>
            </View>
            
            <Switch
              value={modelStatus.running}
              onValueChange={toggleModel}
              disabled={isToggling}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={modelStatus.running ? '#3B82F6' : '#94A3B8'}
            />
          </View>
        </View>
      </View>

      {/* System Status Card */}
      <View className="mx-4 mt-3">
        <View className={`p-4 rounded-2xl border ${
          systemStatus.status === 'online' 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className={`w-4 h-4 rounded-full mr-3 ${
                systemStatus.status === 'online' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <View>
                <Text className={`text-lg font-bold ${
                  systemStatus.status === 'online' ? 'text-green-700' : 'text-red-700'
                }`}>
                  System {systemStatus.status === 'online' ? 'Online' : 'Offline'}
                </Text>
                {systemStatus.lastHeartbeat && (
                  <Text className="text-slate-500 text-sm">
                    Last seen: {formatTime(systemStatus.lastHeartbeat)}
                  </Text>
                )}
              </View>
            </View>
            
            <TouchableOpacity 
              onPress={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded-full ${autoRefresh ? 'bg-blue-100' : 'bg-slate-200'}`}
            >
              <Ionicons 
                name={autoRefresh ? "sync" : "sync-outline"} 
                size={24} 
                color={autoRefresh ? "#2563EB" : "#64748B"} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Alerts List */}
      <View className="flex-1 mx-4 mt-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold text-slate-700">Recent Alerts</Text>
          <Text className="text-slate-500">{alerts.length} logs</Text>
        </View>

        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {alerts.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 items-center">
              <Ionicons name="hand-left-outline" size={48} color="#94A3B8" />
              <Text className="text-slate-500 mt-4 text-center">No alerts yet</Text>
              <Text className="text-slate-400 text-sm text-center mt-1">
                Alerts will appear here when head/hand is detected outside window
              </Text>
            </View>
          ) : (
            alerts.map((alert) => {
              const detection = getDetectionStyle(alert.alert_type, alert.message);
              const severityColors = getSeverityColor(alert.severity);
              return (
                <View 
                  key={String(alert.id)} 
                  className={`${detection.bg} ${detection.border} border-l-4 border rounded-xl overflow-hidden mb-3`}
                >
                  {/* Left accent + Content */}
                  <View className="p-4">
                    {/* Header Row: Detection Badge + Timestamp */}
                    <View className="flex-row items-center justify-between mb-3">
                      <View className="flex-row items-center">
                        {/* Detection Type Icon & Badge */}
                        <View className={`${detection.badge} px-3 py-1.5 rounded-full flex-row items-center`}>
                          <Ionicons name={detection.icon} size={16} color="white" />
                          <Text className="text-white font-bold text-sm ml-1.5">
                            {detection.label}
                          </Text>
                        </View>
                        {/* Severity Badge */}
                        <View className={`${severityColors.bg} ${severityColors.border} border ml-2 px-2 py-1 rounded-full`}>
                          <Text className={`${severityColors.text} text-xs font-semibold`}>
                            {alert.severity}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-slate-500 text-xs">
                        {formatDate(alert.created_at)} • {formatTime(alert.created_at)}
                      </Text>
                    </View>
                    
                    {/* Message */}
                    <Text className="text-slate-700 mb-3 text-base">{alert.message}</Text>
                    
                    {/* Confidence Bar */}
                    {alert.confidence && (
                      <View className="mt-1">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-xs text-slate-500">Detection Confidence</Text>
                          <Text className={`text-xs font-semibold ${detection.text}`}>
                            {(alert.confidence * 100).toFixed(0)}%
                          </Text>
                        </View>
                        <View className="h-2 bg-white/50 rounded-full overflow-hidden">
                          <View 
                            className={`h-full ${detection.accent} rounded-full`}
                            style={{ width: `${alert.confidence * 100}%` }}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
          <View className="h-4" />
        </ScrollView>
      </View>
    </View>
  );
}
