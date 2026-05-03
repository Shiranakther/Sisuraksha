import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, AppState, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useActiveAccidentAlerts,
  useAccidentHistory,
  useAccidentLiveState,
  useCancelActiveAccidentAlert,
} from '../../hooks/useApi';

interface AccidentAlertRecord {
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

interface AccidentLiveState {
  online?: boolean;
  alert_active?: boolean;
  alert_type?: string;
  alert_message?: string;
  remaining_seconds?: number;
  any_danger?: boolean;
  updated_at?: string;
  sensor_data?: {
    roll?: number;
    pitch?: number;
    mq2?: number;
    rain?: number;
    fsr1?: number;
    fsr2?: number;
    tilt?: boolean;
    pressure?: boolean;
    vibration?: boolean;
    sudden_decel?: boolean;
    fire?: boolean;
    smoke?: boolean;
    water?: boolean;
    gps_valid?: boolean;
    lat?: number;
    lng?: number;
    satellites?: number;
  };
}

const statusConfig: Record<string, { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  PENDING:   { bg: 'bg-amber-50',  border: 'border-amber-400', text: 'text-amber-700',  icon: 'time-outline',          label: 'PENDING — Cancel Window Active' },
  CONFIRMED: { bg: 'bg-red-50',    border: 'border-red-500',   text: 'text-red-700',    icon: 'warning',               label: 'CONFIRMED — Emergency' },
  CANCELLED: { bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-700',  icon: 'checkmark-circle',      label: 'CANCELLED — False Alarm' },
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

function AlertCard({ alert }: { alert: AccidentAlertRecord }) {
  const cfg = statusConfig[alert.status] || statusConfig.PENDING;
  const typeIcon = typeIcons[alert.alert_type] || 'alert-circle';

  return (
    <View className={`mb-3 rounded-xl border-l-4 ${cfg.border} ${cfg.bg} p-4`}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center flex-1">
          <View className={`w-10 h-10 rounded-full items-center justify-center ${
            alert.status === 'CONFIRMED' ? 'bg-red-100' : alert.status === 'PENDING' ? 'bg-amber-100' : 'bg-green-100'
          }`}>
            <Ionicons name={typeIcon} size={22} color={
              alert.status === 'CONFIRMED' ? '#DC2626' : alert.status === 'PENDING' ? '#D97706' : '#16A34A'
            } />
          </View>
          <View className="ml-3 flex-1">
            <Text className={`font-bold text-base ${cfg.text}`}>{alert.alert_type}</Text>
            <Text className="text-slate-500 text-xs">{timeAgo(alert.created_at)}</Text>
          </View>
        </View>
        <View className={`px-2 py-1 rounded-full ${
          alert.status === 'CONFIRMED' ? 'bg-red-200' : alert.status === 'PENDING' ? 'bg-amber-200' : 'bg-green-200'
        }`}>
          <Ionicons name={cfg.icon} size={16} color={
            alert.status === 'CONFIRMED' ? '#DC2626' : alert.status === 'PENDING' ? '#D97706' : '#16A34A'
          } />
        </View>
      </View>

      {/* Status label */}
      <Text className={`text-xs font-semibold mb-2 ${cfg.text}`}>{cfg.label}</Text>

      {/* Details */}
      <View className="bg-white/60 rounded-lg p-3 gap-1">
        {alert.confidence != null && (
          <View className="flex-row justify-between">
            <Text className="text-slate-500 text-xs">Confidence</Text>
            <Text className="text-slate-800 text-xs font-bold">{alert.confidence.toFixed(1)}%</Text>
          </View>
        )}
        {alert.vehicle_number && (
          <View className="flex-row justify-between">
            <Text className="text-slate-500 text-xs">Vehicle</Text>
            <Text className="text-slate-800 text-xs font-bold">{alert.vehicle_number}</Text>
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

function LiveSensorCard({
  live,
  hasPending,
  onCancel,
  cancelling,
}: {
  live: AccidentLiveState | null | undefined;
  hasPending: boolean;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const sensor = live?.sensor_data || {};
  const isOnline = Boolean(live?.online && live.updated_at);
  const alertActive = Boolean(live?.alert_active || hasPending);
  const remaining = Number(live?.remaining_seconds ?? 0);
  const dangerFlags = [
    ['Tilt', sensor.tilt],
    ['Pressure', sensor.pressure],
    ['Vibration', sensor.vibration],
    ['Sudden Decel', sensor.sudden_decel],
    ['Fire', sensor.fire],
    ['Smoke', sensor.smoke],
    ['Water', sensor.water],
  ].filter(([, active]) => active);

  return (
    <View className={`mb-4 rounded-xl border p-4 ${
      alertActive ? 'bg-red-50 border-red-200' : isOnline ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-200'
    }`}>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <View className={`w-2.5 h-2.5 rounded-full mr-2 ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          <Text className="text-base font-bold text-slate-800">ESP32 Accident System</Text>
        </View>
        <Text className="text-xs text-slate-500">{isOnline ? 'Live' : 'Waiting'}</Text>
      </View>

      {alertActive ? (
        <View className="bg-red-100 rounded-lg p-3 mb-3">
          <Text className="text-red-700 font-bold">{live?.alert_type || 'ACCIDENT'} countdown active</Text>
          <Text className="text-red-600 text-sm mt-1">{live?.alert_message || 'Driver can stop this before confirmation.'}</Text>
          <Text className="text-red-700 text-2xl font-black mt-2">{remaining}s</Text>
          <TouchableOpacity
            onPress={onCancel}
            disabled={cancelling}
            className={`mt-3 rounded-lg py-3 items-center ${cancelling ? 'bg-slate-400' : 'bg-red-600'}`}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-bold">Stop Countdown</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <View className="bg-slate-50 rounded-lg p-3 gap-1">
        <View className="flex-row justify-between">
          <Text className="text-slate-500 text-xs">Roll / Pitch</Text>
          <Text className="text-slate-800 text-xs font-bold">
            {Number(sensor.roll ?? 0).toFixed(1)} / {Number(sensor.pitch ?? 0).toFixed(1)}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-slate-500 text-xs">MQ2 / Rain</Text>
          <Text className="text-slate-800 text-xs font-bold">{sensor.mq2 ?? 0} / {sensor.rain ?? 0}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-slate-500 text-xs">FSR 1 / FSR 2</Text>
          <Text className="text-slate-800 text-xs font-bold">{sensor.fsr1 ?? 0} / {sensor.fsr2 ?? 0}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-slate-500 text-xs">GPS</Text>
          <Text className="text-slate-800 text-xs font-bold">
            {sensor.gps_valid ? `${Number(sensor.lat).toFixed(5)}, ${Number(sensor.lng).toFixed(5)}` : 'No fix'}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-1 mt-3">
        {dangerFlags.length > 0 ? dangerFlags.map(([label]) => (
          <View key={String(label)} className="bg-red-100 px-2 py-1 rounded">
            <Text className="text-red-700 text-[10px] font-bold">{label}</Text>
          </View>
        )) : (
          <View className="bg-emerald-100 px-2 py-1 rounded">
            <Text className="text-emerald-700 text-[10px] font-bold">NORMAL</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function AccidentAlertMonitor() {
  const { data: active, isLoading: loadingActive, refetch: refetchActive } = useActiveAccidentAlerts();
  const { data: history, isLoading: loadingHistory, refetch: refetchHistory } = useAccidentHistory();
  const { data: live, refetch: refetchLive } = useAccidentLiveState();
  const cancelActive = useCancelActiveAccidentAlert();

  const [refreshing, setRefreshing] = React.useState(false);
  const appState = useRef(AppState.currentState);

  // Auto-refetch when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refetchActive();
        refetchHistory();
        refetchLive();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refetchActive, refetchHistory, refetchLive]);

  // Auto-refetch history whenever active alerts change
  useEffect(() => {
    if (active && active.length > 0) {
      refetchHistory();
    }
  }, [active?.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchActive(), refetchHistory(), refetchLive()]);
    setRefreshing(false);
  };

  const hasActive = active && active.length > 0;
  const hasPending = Boolean(active?.some((a: AccidentAlertRecord) => a.status === 'PENDING'));
  const handleCancelActive = async () => {
    await cancelActive.mutateAsync();
    await Promise.all([refetchActive(), refetchHistory(), refetchLive()]);
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Active Alerts Section */}
      <View className="mb-4">
        <LiveSensorCard
          live={live}
          hasPending={hasPending}
          onCancel={handleCancelActive}
          cancelling={cancelActive.isPending}
        />

        <View className="flex-row items-center mb-3">
          <View className={`w-3 h-3 rounded-full mr-2 ${hasActive ? 'bg-red-500' : 'bg-green-500'}`} />
          <Text className="text-lg font-bold text-slate-800">
            {hasActive ? 'Active Alerts' : 'No Active Alerts'}
          </Text>
        </View>

        {loadingActive ? (
          <ActivityIndicator size="small" color="#6366F1" />
        ) : hasActive ? (
          active.map((a: AccidentAlertRecord) => <AlertCard key={a.id} alert={a} />)
        ) : (
          <View className="bg-green-50 border border-green-200 rounded-xl p-6 items-center">
            <Ionicons name="shield-checkmark" size={40} color="#16A34A" />
            <Text className="text-green-700 font-bold mt-2 text-base">All Clear</Text>
            <Text className="text-green-600 text-sm text-center mt-1">
              No accident alerts detected. The ESP32 system is monitoring your bus.
            </Text>
          </View>
        )}
      </View>

      {/* History Section */}
      <View>
        <Text className="text-lg font-bold text-slate-800 mb-3">Alert History</Text>

        {loadingHistory ? (
          <ActivityIndicator size="small" color="#6366F1" />
        ) : history && history.length > 0 ? (
          history.map((a: AccidentAlertRecord) => <AlertCard key={a.id} alert={a} />)
        ) : (
          <View className="bg-slate-100 rounded-xl p-6 items-center">
            <Ionicons name="document-text-outline" size={36} color="#94A3B8" />
            <Text className="text-slate-400 mt-2 text-sm">No past accident alerts</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
