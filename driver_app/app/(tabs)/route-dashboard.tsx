import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RouteDashboardScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-5 bg-white border-b border-slate-200">
        <Text className="text-2xl font-bold text-slate-800">Route Management</Text>
        <Text className="text-slate-500 text-sm mt-1">Manage today's trip and passenger requests</Text>
      </View>
      <View className="flex-1 p-4 gap-4">
        <TouchableOpacity
          onPress={() => router.push('/route-requests' as any)}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex-row items-center gap-4"
        >
          <View className="w-12 h-12 rounded-xl bg-blue-100 items-center justify-center">
            <Ionicons name="people" size={24} color="#2563EB" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-slate-800 text-base">Today's Requests</Text>
            <Text className="text-slate-500 text-sm">View present / absent / no-declaration</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/route-today' as any)}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex-row items-center gap-4"
        >
          <View className="w-12 h-12 rounded-xl bg-emerald-100 items-center justify-center">
            <Ionicons name="map" size={24} color="#059669" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-slate-800 text-base">Start Trip</Text>
            <Text className="text-slate-500 text-sm">View trip data and start route</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
