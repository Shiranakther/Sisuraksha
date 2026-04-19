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

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Parent Requests</Text>
          <Text className="text-sm text-slate-400">{today}</Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} className="p-2">
          <Ionicons name="refresh" size={22} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View className="flex-row px-6 py-4 gap-4">
        <View className="flex-1 bg-green-50 p-4 rounded-2xl border border-green-200 items-center">
          <Text className="text-3xl font-bold text-green-700">{presentCount}</Text>
          <Text className="text-sm text-green-600 font-medium">Present</Text>
        </View>
        <View className="flex-1 bg-red-50 p-4 rounded-2xl border border-red-200 items-center">
          <Text className="text-3xl font-bold text-red-700">{absentCount}</Text>
          <Text className="text-sm text-red-600 font-medium">Absent</Text>
        </View>
        <View className="flex-1 bg-blue-50 p-4 rounded-2xl border border-blue-200 items-center">
          <Text className="text-3xl font-bold text-blue-700">{requests.length}</Text>
          <Text className="text-sm text-blue-600 font-medium">Total</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      >
        {isLoading && requests.length === 0 && (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        )}

        {!isLoading && requests.length === 0 && (
          <View className="py-16 items-center">
            <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
            <Text className="text-slate-400 mt-4 text-center">No parent requests for today.</Text>
          </View>
        )}

        {requests.map((req: any, idx: number) => {
          const isPresent = req.is_present !== false;
          return (
            <React.Fragment key={`${req.child_id}-${idx}`}>
            <View
              className={`mb-3 p-4 rounded-2xl border ${
                isPresent ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'
              }`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center flex-1">
                  <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                    isPresent ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    <Ionicons
                      name={isPresent ? 'checkmark-circle' : 'close-circle'}
                      size={24}
                      color={isPresent ? '#16A34A' : '#EF4444'}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-800">{req.child_name}</Text>
                    <Text className="text-sm text-slate-400">{req.parent_name}</Text>
                  </View>
                </View>

                <View className={`px-3 py-1 rounded-full ${isPresent ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Text className={`text-xs font-bold ${isPresent ? 'text-green-700' : 'text-red-700'}`}>
                    {isPresent ? 'PRESENT' : 'ABSENT'}
                  </Text>
                </View>
              </View>

              {req.schedule_type && req.schedule_type !== 'BOTH' && (
                <Text className="text-xs text-slate-500 mb-1">Trip: {req.schedule_type} only</Text>
              )}

              {req.pickup_address && (
                <View className="flex-row items-center mt-1">
                  <Ionicons name="location" size={14} color="#94A3B8" />
                  <Text className="text-xs text-slate-400 ml-1 flex-1" numberOfLines={1}>
                    Pickup: {req.pickup_address}
                  </Text>
                </View>
              )}

              {req.parent_phone && (
                <View className="flex-row items-center mt-1">
                  <Ionicons name="call" size={14} color="#94A3B8" />
                  <Text className="text-xs text-slate-400 ml-1">{req.parent_phone}</Text>
                </View>
              )}

              {req.notes && (
                <View className="flex-row items-center mt-1">
                  <Ionicons name="chatbubble-outline" size={14} color="#94A3B8" />
                  <Text className="text-xs text-slate-400 ml-1">{req.notes}</Text>
                </View>
              )}
            </View>
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* Bottom Action */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/route-today')}
          className="bg-blue-600 py-4 rounded-2xl items-center flex-row justify-center"
        >
          <Ionicons name="arrow-forward" size={20} color="white" style={{ marginRight: 8 }} />
          <Text className="text-white font-bold text-lg">View Today's Trip Data</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
