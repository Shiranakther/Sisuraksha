import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FootboardMonitor from '../../components/safety/FootboardSafety';
import WindowSafetyMonitor from '../../components/safety/WindowSafety';
import AccidentAlertMonitor from '../../components/safety/AccidentAlert';
import DoorStatusMonitor from '../../components/safety/DoorStatus';

type SafetyTabKey = 'footboard' | 'window' | 'accident' | 'door';

type SafetyViewOption = {
  key: SafetyTabKey;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  activeBg: string;
  activeBorder: string;
  activeTextSubtle: string;
};

const SAFETY_VIEW_OPTIONS: SafetyViewOption[] = [
  {
    key: 'footboard',
    label: 'Footboard',
    subtitle: 'Entry step safety',
    icon: 'footsteps',
    accent: '#2563EB',
    activeBg: '#1D4ED8',
    activeBorder: '#60A5FA',
    activeTextSubtle: '#BFDBFE',
  },
  {
    key: 'window',
    label: 'Window',
    subtitle: 'Window area monitor',
    icon: 'scan',
    accent: '#4F46E5',
    activeBg: '#4338CA',
    activeBorder: '#818CF8',
    activeTextSubtle: '#C7D2FE',
  },
  {
    key: 'accident',
    label: 'Accident',
    subtitle: 'Emergency alerts',
    icon: 'alert-circle',
    accent: '#DC2626',
    activeBg: '#B91C1C',
    activeBorder: '#FCA5A5',
    activeTextSubtle: '#FECACA',
  },
  {
    key: 'door',
    label: 'Door',
    subtitle: 'Emergency exit status',
    icon: 'exit-outline',
    accent: '#059669',
    activeBg: '#047857',
    activeBorder: '#6EE7B7',
    activeTextSubtle: '#A7F3D0',
  },
];

export default function SafetyHubScreen() {
  const [activeTab, setActiveTab] = useState<SafetyTabKey>('footboard');
  const activeView = SAFETY_VIEW_OPTIONS.find(option => option.key === activeTab);

  return (
    <View className="flex-1 bg-slate-900" style={{ paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      {/* Universal Header */}
      <View className="bg-slate-900 pt-6 pb-4 px-6">
        <Text className="text-2xl font-bold text-white">System Monitor</Text>
        <Text className="text-slate-400 mt-1">Select a safety camera view</Text>
      </View>

      <View className="px-4 pb-2 flex-row items-center justify-between">
        <Text className="text-slate-400 text-xs uppercase tracking-widest font-semibold">Monitor Views</Text>
        <View className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
          <Text className="text-slate-300 text-[11px] font-semibold">
            {activeView?.label ?? 'Safety'} Active
          </Text>
        </View>
      </View>

      {/* Button Selection Area (2x2 Grid) */}
      <View className="px-4 pb-2 flex-row flex-wrap justify-between">
        {SAFETY_VIEW_OPTIONS.map(option => {
          const isActive = option.key === activeTab;

          return (
            <TouchableOpacity
              key={option.key}
              onPress={() => setActiveTab(option.key)}
              activeOpacity={0.85}
              style={{
                width: '48%',
                height: 106,
                marginBottom: 16,
                borderRadius: 18,
                borderWidth: 1.5,
                paddingHorizontal: 12,
                paddingVertical: 12,
                justifyContent: 'space-between',
                backgroundColor: isActive ? option.activeBg : '#0F172A',
                borderColor: isActive ? option.activeBorder : '#1E293B',
                shadowColor: isActive ? option.accent : '#000',
                shadowOpacity: isActive ? 0.3 : 0.1,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: isActive ? 5 : 2,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.16)' : '#1E293B',
                  }}
                >
                  <Ionicons name={option.icon} size={16} color={isActive ? 'white' : '#94A3B8'} />
                </View>

                {isActive ? (
                  <View style={{ borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text className="text-[9px] font-bold uppercase tracking-wide text-white">Active</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={14} color="#475569" />
                )}
              </View>

              <View>
                <Text style={{ color: isActive ? '#FFFFFF' : '#E2E8F0' }} className="text-[14px] font-bold tracking-wide" numberOfLines={1}>
                  {option.label}
                </Text>
                <Text style={{ color: isActive ? option.activeTextSubtle : '#94A3B8' }} className="text-[10px] mt-0.5" numberOfLines={1}>
                  {option.subtitle}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Render Selected Content (Preserving state across switches) */}
      <View className="flex-1 bg-slate-100 rounded-t-3xl overflow-hidden">
        <View className="items-center pt-2 pb-1">
          <View className="w-12 h-1.5 rounded-full bg-slate-300" />
        </View>
        <View style={{ flex: 1, display: activeTab === 'footboard' ? 'flex' : 'none' }}>
          <FootboardMonitor />
        </View>
        <View style={{ flex: 1, display: activeTab === 'window' ? 'flex' : 'none' }}>
          <WindowSafetyMonitor />
        </View>
        <View style={{ flex: 1, display: activeTab === 'accident' ? 'flex' : 'none' }}>
          <AccidentAlertMonitor />
        </View>
        <View style={{ flex: 1, display: activeTab === 'door' ? 'flex' : 'none' }}>
          <DoorStatusMonitor />
        </View>
      </View>
    </View>
  );
}
