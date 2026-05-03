import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StatusBar, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FootboardMonitor from '../../components/safety/FootboardSafety';
import WindowSafetyMonitor from '../../components/safety/WindowSafety';
import AccidentAlertMonitor from '../../components/safety/AccidentAlert';
import DoorStatusMonitor from '../../components/safety/DoorStatus';

export default function SafetyHubScreen() {
  const [activeTab, setActiveTab] = useState<'footboard' | 'window' | 'accident' | 'door'>('footboard');

  return (
    <View className="flex-1 bg-slate-900" style={{ paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      {/* Universal Header */}
      <View className="bg-slate-900 pt-6 pb-4 px-6">
        <Text className="text-2xl font-bold text-white">System Monitor</Text>
        <Text className="text-slate-400 mt-1">Select a safety camera view</Text>
      </View>

      {/* Button Selection Area */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-6" contentContainerStyle={{ gap: 12 }}>
        <TouchableOpacity
          onPress={() => setActiveTab('footboard')}
          className={`p-4 rounded-xl border flex-row items-center justify-center shadow-sm ${
            activeTab === 'footboard' 
              ? 'bg-blue-600 border-blue-500 shadow-blue-500/30' 
              : 'bg-slate-800 border-slate-700'
          }`}
          style={{ minWidth: 120 }}
        >
          <Ionicons name="footsteps" size={22} color={activeTab === 'footboard' ? 'white' : '#94A3B8'} />
          <Text className={`ml-2 text-base font-bold tracking-wide ${activeTab === 'footboard' ? 'text-white' : 'text-slate-400'}`}>
            Footboard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('window')}
          className={`p-4 rounded-xl border flex-row items-center justify-center shadow-sm ${
            activeTab === 'window' 
              ? 'bg-indigo-600 border-indigo-500 shadow-indigo-500/30' 
              : 'bg-slate-800 border-slate-700'
          }`}
          style={{ minWidth: 120 }}
        >
          <Ionicons name="scan" size={22} color={activeTab === 'window' ? 'white' : '#94A3B8'} />
          <Text className={`ml-2 text-base font-bold tracking-wide ${activeTab === 'window' ? 'text-white' : 'text-slate-400'}`}>
            Window
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('accident')}
          className={`p-4 rounded-xl border flex-row items-center justify-center shadow-sm ${
            activeTab === 'accident' 
              ? 'bg-red-600 border-red-500 shadow-red-500/30' 
              : 'bg-slate-800 border-slate-700'
          }`}
          style={{ minWidth: 120 }}
        >
          <Ionicons name="alert-circle" size={22} color={activeTab === 'accident' ? 'white' : '#94A3B8'} />
          <Text className={`ml-2 text-base font-bold tracking-wide ${activeTab === 'accident' ? 'text-white' : 'text-slate-400'}`}>
            Accident
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('door')}
          className={`p-4 rounded-xl border flex-row items-center justify-center shadow-sm ${
            activeTab === 'door' 
              ? 'bg-emerald-600 border-emerald-500 shadow-emerald-500/30' 
              : 'bg-slate-800 border-slate-700'
          }`}
          style={{ minWidth: 120 }}
        >
          <Ionicons name="exit-outline" size={22} color={activeTab === 'door' ? 'white' : '#94A3B8'} />
          <Text className={`ml-2 text-base font-bold tracking-wide ${activeTab === 'door' ? 'text-white' : 'text-slate-400'}`}>
            Door
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Render Selected Content (Preserving state across switches) */}
      <View className="flex-1 bg-slate-100 rounded-t-3xl overflow-hidden">
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