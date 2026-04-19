import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Platform, StatusBar, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveAccidentAlerts, useAccidentHistory } from '../../hooks/useApi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AccidentAlert {
  id: number;
  alert_type: string;
  status: string;
  confidence: number;
  evidence: string | null;
  location_lat: number | null;
  location_lon: number | null;
  vehicle_number: string | null;
  driver_first_name: string;
  driver_last_name: string;
  created_at: string;
  resolved_at: string | null;
}

const statusConfig: Record<string, { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  PENDING:   { bg: 'bg-amber-50',  border: 'border-amber-400', text: 'text-amber-800',  icon: 'time-outline',     label: 'PENDING — Driver has 3 min to cancel' },
  CONFIRMED: { bg: 'bg-red-50',    border: 'border-red-500',   text: 'text-red-800',    icon: 'warning',          label: 'CONFIRMED — Emergency Active' },
  CANCELLED: { bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-700',  icon: 'checkmark-circle', label: 'CANCELLED — False Alarm' },
};

const typeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  'FRONTAL CRASH': 'car-sport',
  'SIDE IMPACT':   'arrow-forward-circle',
  'ROLLOVER':      'refresh-circle',
  'FIRE':          'flame',
  'SUBMERSION':    'water',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AlertCard({ alert }: { alert: AccidentAlert }) {
  const cfg = statusConfig[alert.status] || statusConfig.PENDING;
  const typeIcon = typeIcons[alert.alert_type] || 'alert-circle';
  const driverName = `${alert.driver_first_name || ''} ${alert.driver_last_name || ''}`.trim() || 'Unknown';

  return (
    <View className={`mb-3 rounded-2xl border-l-4 ${cfg.border} ${cfg.bg} p-4 shadow-sm`}>
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1">
          <View className={`w-11 h-11 rounded-full items-center justify-center ${
            alert.status === 'CONFIRMED' ? 'bg-red-100' : alert.status === 'PENDING' ? 'bg-amber-100' : 'bg-green-100'
          }`}>
            <Ionicons name={typeIcon} size={24} color={
              alert.status === 'CONFIRMED' ? '#DC2626' : alert.status === 'PENDING' ? '#D97706' : '#16A34A'
            } />
          </View>
          <View className="ml-3 flex-1">
            <Text className={`font-bold text-base ${cfg.text}`}>{alert.alert_type}</Text>
            <Text className="text-slate-500 text-xs mt-0.5">{timeAgo(alert.created_at)}</Text>
          </View>
        </View>
        <View className={`px-2.5 py-1 rounded-full ${
          alert.status === 'CONFIRMED' ? 'bg-red-200' : alert.status === 'PENDING' ? 'bg-amber-200' : 'bg-green-200'
        }`}>
          <Ionicons name={cfg.icon} size={18} color={
            alert.status === 'CONFIRMED' ? '#DC2626' : alert.status === 'PENDING' ? '#D97706' : '#16A34A'
          } />
        </View>
      </View>

      {/* Status label */}
      <Text className={`text-xs font-bold mb-3 ${cfg.text}`}>{cfg.label}</Text>

      {/* Details card */}
      <View className="bg-white/70 rounded-xl p-3 gap-2">
        <View className="flex-row justify-between">
          <Text className="text-slate-500 text-xs">Driver</Text>
          <Text className="text-slate-800 text-xs font-bold">{driverName}</Text>
        </View>
        {alert.vehicle_number && (
          <View className="flex-row justify-between">
            <Text className="text-slate-500 text-xs">Vehicle</Text>
            <Text className="text-slate-800 text-xs font-bold">{alert.vehicle_number}</Text>
          </View>
        )}
        {alert.confidence != null && (
          <View className="flex-row justify-between">
            <Text className="text-slate-500 text-xs">Confidence</Text>
            <Text className={`text-xs font-bold ${
              alert.confidence >= 80 ? 'text-red-600' : alert.confidence >= 55 ? 'text-amber-600' : 'text-green-600'
            }`}>{alert.confidence.toFixed(1)}%</Text>
          </View>
        )}
        {alert.evidence && (
          <View className="flex-row flex-wrap gap-1 mt-1">
            {alert.evidence.trim().split(/\s+/).map((tag, i) => (
              <View key={i} className="bg-slate-200 px-2 py-0.5 rounded">
                <Text className="text-slate-600 text-[10px] font-mono">{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function AccidentAlertsScreen() {
  const insets = useSafeAreaInsets();
  const { data: active, isLoading: loadingActive, refetch: refetchActive } = useActiveAccidentAlerts();
  const { data: history, isLoading: loadingHistory, refetch: refetchHistory } = useAccidentHistory();
  const [refreshing, setRefreshing] = React.useState(false);
  const appState = useRef(AppState.currentState);

  // Auto-refetch when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refetchActive();
        refetchHistory();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refetchActive, refetchHistory]);

  // Auto-refetch history whenever active alerts change
  useEffect(() => {
    if (active && active.length > 0) {
      refetchHistory();
    }
  }, [active?.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchActive(), refetchHistory()]);
    setRefreshing(false);
  };

  const hasActive = active && active.length > 0;

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View
        className="bg-white px-6 pb-4 border-b border-slate-100 shadow-sm"
        style={{ paddingTop: Math.max(insets.top, 20) + 12 }}
      >
        <View className="flex-row items-center">
          <View className={`w-3 h-3 rounded-full mr-3 ${hasActive ? 'bg-red-500' : 'bg-green-500'}`} />
          <View>
            <Text className="text-2xl font-bold text-slate-800">Safety Alerts</Text>
            <Text className="text-slate-400 text-sm mt-0.5">
              {hasActive ? `${active.length} active alert(s)` : 'All systems normal'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Active Alerts */}
        {loadingActive ? (
          <ActivityIndicator size="small" color="#DC2626" className="my-4" />
        ) : hasActive ? (
          <View className="mb-6">
            <Text className="text-sm font-bold text-red-600 uppercase tracking-wider mb-3">
              Active Alerts
            </Text>
            {active.map((a: AccidentAlert) => <AlertCard key={a.id} alert={a} />)}
          </View>
        ) : (
          <View className="bg-green-50 border border-green-200 rounded-2xl p-6 items-center mb-6">
            <Ionicons name="shield-checkmark" size={44} color="#16A34A" />
            <Text className="text-green-700 font-bold mt-3 text-lg">All Clear</Text>
            <Text className="text-green-600 text-sm text-center mt-1">
              No accident alerts. Your child's bus is being monitored by ESP32 sensors.
            </Text>
          </View>
        )}

        {/* History */}
        <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
          Past Alerts
        </Text>
        {loadingHistory ? (
          <ActivityIndicator size="small" color="#6366F1" className="my-4" />
        ) : history && history.length > 0 ? (
          history.map((a: AccidentAlert) => <AlertCard key={a.id} alert={a} />)
        ) : (
          <View className="bg-slate-100 rounded-2xl p-6 items-center">
            <Ionicons name="document-text-outline" size={36} color="#94A3B8" />
            <Text className="text-slate-400 mt-2 text-sm">No past accident alerts</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
