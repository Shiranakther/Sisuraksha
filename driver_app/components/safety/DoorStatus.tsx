import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDoorStatus } from '../../hooks/useApi';

interface DoorStatusData {
  state: string;
  doorOpen: boolean;
  pirBlocked: boolean;
  pirClear: boolean;
  busId: string;
  accidentType: string;
}

const stateConfig: Record<string, { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  IDLE:        { bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-700',  icon: 'lock-closed',       label: 'Door Locked — Normal',       color: '#16A34A' },
  ACCIDENT:    { bg: 'bg-red-50',    border: 'border-red-500',   text: 'text-red-700',    icon: 'warning',           label: 'Accident Detected — Preparing', color: '#DC2626' },
  PIR_BLOCKED: { bg: 'bg-amber-50',  border: 'border-amber-400', text: 'text-amber-700',  icon: 'eye-off',           label: 'Obstruction — PIR Blocked',  color: '#D97706' },
  OPENING:     { bg: 'bg-blue-50',   border: 'border-blue-400',  text: 'text-blue-700',   icon: 'open',              label: 'Door Opening…',              color: '#2563EB' },
  OPEN:        { bg: 'bg-blue-50',   border: 'border-blue-500',  text: 'text-blue-700',   icon: 'exit-outline',      label: 'Door Open — Evacuate',       color: '#2563EB' },
  RESET:       { bg: 'bg-slate-50',  border: 'border-slate-400', text: 'text-slate-700',  icon: 'refresh',           label: 'Resetting…',                 color: '#64748B' },
  OFFLINE:     { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-500',  icon: 'cloud-offline',     label: 'Door ESP32 Offline',         color: '#94A3B8' },
};

export default function DoorStatusMonitor() {
  const { data, isLoading, refetch } = useDoorStatus();
  const [refreshing, setRefreshing] = React.useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        refetch();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [refetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const door: DoorStatusData = data || { state: 'OFFLINE', doorOpen: false, pirBlocked: false, pirClear: false, busId: '', accidentType: '' };
  const cfg = stateConfig[door.state] || stateConfig.OFFLINE;

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Door State Card */}
      <View className={`rounded-xl border-l-4 ${cfg.border} ${cfg.bg} p-5 mb-4`}>
        <View className="flex-row items-center mb-3">
          <View className={`w-12 h-12 rounded-full items-center justify-center ${
            door.state === 'IDLE' ? 'bg-green-100' :
            door.state === 'OFFLINE' ? 'bg-slate-200' :
            door.state === 'ACCIDENT' || door.state === 'PIR_BLOCKED' ? 'bg-red-100' :
            'bg-blue-100'
          }`}>
            <Ionicons name={cfg.icon} size={26} color={cfg.color} />
          </View>
          <View className="ml-4 flex-1">
            <Text className={`text-lg font-bold ${cfg.text}`}>Emergency Door</Text>
            <Text className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</Text>
          </View>
        </View>

        {/* Status Indicators */}
        <View className="bg-white/60 rounded-lg p-4 gap-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name={door.doorOpen ? 'lock-open' : 'lock-closed'} size={18} color={door.doorOpen ? '#2563EB' : '#16A34A'} />
              <Text className="text-slate-600 text-sm ml-2">Door Lock</Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${door.doorOpen ? 'bg-blue-100' : 'bg-green-100'}`}>
              <Text className={`text-xs font-bold ${door.doorOpen ? 'text-blue-700' : 'text-green-700'}`}>
                {door.doorOpen ? 'UNLOCKED' : 'LOCKED'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="body" size={18} color={door.pirBlocked ? '#D97706' : '#16A34A'} />
              <Text className="text-slate-600 text-sm ml-2">PIR Sensor</Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${door.pirBlocked ? 'bg-amber-100' : door.pirClear ? 'bg-green-100' : 'bg-slate-100'}`}>
              <Text className={`text-xs font-bold ${door.pirBlocked ? 'text-amber-700' : door.pirClear ? 'text-green-700' : 'text-slate-500'}`}>
                {door.pirBlocked ? 'BLOCKED' : door.pirClear ? 'CLEAR' : 'STANDBY'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons name="wifi" size={18} color={door.state === 'OFFLINE' ? '#94A3B8' : '#16A34A'} />
              <Text className="text-slate-600 text-sm ml-2">Connection</Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${door.state === 'OFFLINE' ? 'bg-slate-200' : 'bg-green-100'}`}>
              <Text className={`text-xs font-bold ${door.state === 'OFFLINE' ? 'text-slate-500' : 'text-green-700'}`}>
                {door.state === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'}
              </Text>
            </View>
          </View>

          {door.busId ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="bus" size={18} color="#6366F1" />
                <Text className="text-slate-600 text-sm ml-2">Bus ID</Text>
              </View>
              <Text className="text-slate-800 text-sm font-bold">{door.busId}</Text>
            </View>
          ) : null}

          {door.accidentType ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text className="text-slate-600 text-sm ml-2">Alert Type</Text>
              </View>
              <Text className="text-red-600 text-sm font-bold">{door.accidentType}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Info Card */}
      {isLoading ? (
        <ActivityIndicator size="small" color="#6366F1" />
      ) : (
        <View className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <View className="flex-row items-center mb-2">
            <Ionicons name="information-circle" size={20} color="#6366F1" />
            <Text className="text-indigo-700 font-bold ml-2 text-sm">How It Works</Text>
          </View>
          <Text className="text-indigo-600 text-xs leading-5">
            The emergency door automatically unlocks when an accident is confirmed by the sensor system. 
            The PIR sensor checks for obstructions before opening. 
            The rear LCD display alerts nearby traffic.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
