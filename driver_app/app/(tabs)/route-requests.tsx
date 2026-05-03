import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTripRequests } from '../../hooks/useApi';

export default function RouteRequestsTab() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useTripRequests();

  const requests = data?.data ?? [];
  const today = data?.date ?? new Date().toISOString().split('T')[0];

  const presentCount = requests.filter((r: any) => r.is_present !== false).length;
  const absentCount = requests.filter((r: any) => r.is_present === false).length;

  const dateDisplay = new Date(today).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  return (
    <View className="flex-1 bg-slate-50">
      {/* --- Premium Header --- */}
      <View
        style={{ paddingTop: insets.top + 16, backgroundColor: '#2563EB' }}
        className="px-6 pb-24 rounded-b-[40px] shadow-xl"
      >
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity
            onPress={() => router.back()}
            className="bg-white/20 p-2 rounded-full"
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => refetch()}
            className="bg-white/20 p-2 rounded-full"
          >
            <Ionicons name="refresh" size={22} color="white" />
          </TouchableOpacity>
        </View>

        <Text className="text-white/70 text-sm font-medium uppercase tracking-widest">{dateDisplay}</Text>
        <Text className="text-white text-3xl font-black mt-1">Trip Management</Text>
        <Text className="text-blue-100/80 text-sm mt-1">Review student availability for today's route</Text>
      </View>

      {/* --- Stats Overlap Cards --- */}
      <View className="flex-row px-6 -mt-16 gap-3">
        <View className="flex-1 bg-white p-4 rounded-3xl shadow-lg border border-slate-50 items-center">
          <View className="bg-green-100 p-2 rounded-full mb-2">
            <Ionicons name="checkmark-done" size={20} color="#16A34A" />
          </View>
          <Text className="text-2xl font-black text-slate-800">{presentCount}</Text>
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Present</Text>
        </View>

        <View className="flex-1 bg-white p-4 rounded-3xl shadow-lg border border-slate-50 items-center">
          <View className="bg-red-100 p-2 rounded-full mb-2">
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          </View>
          <Text className="text-2xl font-black text-slate-800">{absentCount}</Text>
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Absent</Text>
        </View>

        <View className="flex-1 bg-white p-4 rounded-3xl shadow-lg border border-slate-50 items-center">
          <View className="bg-blue-100 p-2 rounded-full mb-2">
            <Ionicons name="people" size={20} color="#2563EB" />
          </View>
          <Text className="text-2xl font-black text-slate-800">{requests.length}</Text>
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total</Text>
        </View>
      </View>

      {/* --- Student List --- */}
      <ScrollView
        className="flex-1 mt-6 px-6"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#2563EB" />}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-slate-800 font-bold text-lg">Student Roster</Text>
          <View className="bg-slate-200 px-3 py-1 rounded-full">
            <Text className="text-slate-600 text-xs font-bold">{requests.length} Assigned</Text>
          </View>
        </View>

        {isLoading && requests.length === 0 && (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#2563EB" />
            <Text className="text-slate-400 mt-4 font-medium">Fetching roster...</Text>
          </View>
        )}

        {!isLoading && requests.length === 0 && (
          <View className="py-20 items-center bg-white rounded-3xl border border-dashed border-slate-200">
            <View className="bg-slate-50 p-6 rounded-full">
              <Ionicons name="people-outline" size={48} color="#CBD5E1" />
            </View>
            <Text className="text-slate-400 mt-4 text-center font-bold text-lg">No students found</Text>
            <Text className="text-slate-300 text-sm text-center px-8">Verify your profile or check back later.</Text>
          </View>
        )}

        {requests.map((req: any, idx: number) => {
          const isPresent = req.is_present !== false;
          return (
            <View
              key={`${req.child_id}-${idx}`}
              className="mb-4 bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden"
            >
              <View className="flex-row items-center p-5">
                <View className={`w-14 h-14 rounded-2xl items-center justify-center ${isPresent ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                  <Ionicons
                    name={isPresent ? 'person' : 'person-remove'}
                    size={28}
                    color={isPresent ? '#16A34A' : '#EF4444'}
                  />
                </View>

                <View className="flex-1 ml-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-lg font-black text-slate-800" numberOfLines={1}>
                      {req.child_name}
                    </Text>
                    <View className={`px-3 py-1 rounded-full ${isPresent ? 'bg-green-100' : 'bg-red-100'}`}>
                      <Text className={`text-[10px] font-black ${isPresent ? 'text-green-700' : 'text-red-700'}`}>
                        {isPresent ? 'PRESENT' : 'ABSENT'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-slate-400 text-xs font-medium">Parent: {req.parent_name}</Text>
                </View>
              </View>

              <View className="bg-slate-50/50 px-5 py-4 border-t border-slate-50">
                <View className="flex-row flex-wrap gap-y-2">
                  <View className="w-1/2 flex-row items-center">
                    <View className="bg-blue-100/50 p-1 rounded-md mr-2">
                      <Ionicons name="bus-outline" size={12} color="#2563EB" />
                    </View>
                    <Text className="text-[11px] text-slate-500 font-bold">{req.schedule_type || 'BOTH'}</Text>
                  </View>

                  {req.parent_phone && (
                    <View className="w-1/2 flex-row items-center">
                      <View className="bg-orange-100/50 p-1 rounded-md mr-2">
                        <Ionicons name="call-outline" size={12} color="#EA580C" />
                      </View>
                      <Text className="text-[11px] text-slate-500 font-bold">{req.parent_phone}</Text>
                    </View>
                  )}

                  {req.pickup_address && (
                    <View className="w-full flex-row items-center mt-1">
                      <View className="bg-purple-100/50 p-1 rounded-md mr-2">
                        <Ionicons name="location-outline" size={12} color="#9333EA" />
                      </View>
                      <Text className="text-[11px] text-slate-500 font-bold flex-1" numberOfLines={1}>
                        {req.pickup_address}
                      </Text>
                    </View>
                  )}
                </View>

                {req.notes && (
                  <View className="mt-3 bg-white p-3 rounded-2xl border border-slate-100">
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color="#64748B" />
                      <Text className="text-[10px] text-slate-400 font-black ml-1 uppercase">Notes</Text>
                    </View>
                    <Text className="text-xs text-slate-600 italic">"{req.notes}"</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* --- Premium Bottom Action --- */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white/90 shadow-2xl px-8 pt-4 pb-8"
        style={{ paddingBottom: Math.max(insets.bottom, 20) }}
      >
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/route-today')}
          activeOpacity={0.8}
          className="bg-blue-600 h-16 rounded-[24px] items-center flex-row justify-center shadow-lg shadow-blue-300"
        >
          <View className="bg-white/20 p-2 rounded-full mr-3">
            <Ionicons name="flash" size={20} color="white" />
          </View>
          <Text className="text-white font-black text-lg">Initialize Today's Route</Text>
          <Ionicons name="chevron-forward" size={20} color="white" className="ml-2" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
