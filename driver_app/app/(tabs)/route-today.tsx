import React, { useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useTodayTripData, useCreateTrip } from '../../hooks/useApi';

export default function RouteTodayTab() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch } = useTodayTripData();
  const createTripMutation = useCreateTrip();
  const [processing, setProcessing] = useState(false);

  const present = data?.present ?? [];
  const absent = data?.absent ?? [];
  const today = data?.date ?? new Date().toISOString().split('T')[0];

  const handleProcess = async () => {
    if (present.length === 0) {
      Alert.alert('No Children', 'No present children to process a trip for.');
      return;
    }

    setProcessing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed to start a trip.');
        setProcessing(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;

      const result = await createTripMutation.mutateAsync({
        start_lat: latitude,
        start_lon: longitude,
        trip_type: 'MORNING',
      });

      router.push({
        pathname: '/(tabs)/route-map-trip',
        params: { tripId: String(result.trip.id) },
      });
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || err.message || 'Failed to create trip');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="bg-white px-6 py-4 border-b border-slate-100 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Today's Trip Data</Text>
          <Text className="text-sm text-slate-400">{today}</Text>
        </View>
      </View>

      {/* Summary */}
      <View className="flex-row px-6 py-4 gap-4">
        <View className="flex-1 bg-green-50 p-4 rounded-2xl border border-green-200 items-center">
          <Text className="text-3xl font-bold text-green-700">{present.length}</Text>
          <Text className="text-sm text-green-600 font-medium">Present</Text>
        </View>
        <View className="flex-1 bg-red-50 p-4 rounded-2xl border border-red-200 items-center">
          <Text className="text-3xl font-bold text-red-700">{absent.length}</Text>
          <Text className="text-sm text-red-600 font-medium">Absent</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      >
        {isLoading && present.length === 0 && absent.length === 0 && (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        )}

        {/* Present Children */}
        {present.length > 0 && (
          <>
            <Text className="text-sm font-bold text-green-600 uppercase tracking-wider mb-3">
              Present Children
            </Text>
            {present.map((child: any, idx: number) => (
              <View
                key={child.child_id ?? idx}
                className="mb-3 p-4 rounded-2xl bg-white border border-slate-200 flex-row items-center"
              >
                <View className="bg-green-100 w-10 h-10 rounded-full items-center justify-center mr-3">
                  <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800">{child.child_name}</Text>
                  <Text className="text-xs text-slate-400">
                    {child.schedule_type !== 'BOTH' ? `Trip: ${child.schedule_type}` : 'Morning & Evening'}
                  </Text>
                  {child.pickup_address && (
                    <View className="flex-row items-center mt-1">
                      <Ionicons name="location" size={12} color="#94A3B8" />
                      <Text className="text-xs text-slate-400 ml-1" numberOfLines={1}>{child.pickup_address}</Text>
                    </View>
                  )}
                </View>
                {child.morning_pickup_time && (
                  <View className="bg-blue-100 px-2 py-1 rounded-lg">
                    <Text className="text-xs text-blue-700 font-medium">Picked</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {/* Absent Children */}
        {absent.length > 0 && (
          <>
            <Text className="text-sm font-bold text-red-600 uppercase tracking-wider mb-3 mt-4">
              Absent Children
            </Text>
            {absent.map((child: any, idx: number) => (
              <View
                key={child.child_id ?? idx}
                className="mb-3 p-4 rounded-2xl bg-red-50 border border-red-200 flex-row items-center"
              >
                <View className="bg-red-100 w-10 h-10 rounded-full items-center justify-center mr-3">
                  <Ionicons name="close-circle" size={24} color="#EF4444" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800">{child.child_name}</Text>
                  <Text className="text-xs text-red-400">Marked absent by parent</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {!isLoading && present.length === 0 && absent.length === 0 && (
          <View className="py-16 items-center">
            <Ionicons name="bus-outline" size={48} color="#CBD5E1" />
            <Text className="text-slate-400 mt-4 text-center">No trip data for today yet.</Text>
            <Text className="text-slate-300 text-sm text-center mt-1">
              Parents need to set attendance first.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Process Button */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-4"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <TouchableOpacity
          onPress={handleProcess}
          disabled={processing || createTripMutation.isPending || present.length === 0}
          className={`py-4 rounded-2xl items-center flex-row justify-center ${
            present.length === 0 ? 'bg-slate-300' : 'bg-orange-600'
          }`}
        >
          {processing || createTripMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="navigate" size={20} color="white" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold text-lg">Process & Start Trip</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
