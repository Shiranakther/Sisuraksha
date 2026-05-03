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

  const dateDisplay = new Date(today).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

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
        params: { 
          tripId: String(result.trip.id),
          startLat: String(latitude),
          startLon: String(longitude)
        },
      });
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || err.message || 'Failed to create trip');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* --- Premium Header --- */}
      <View 
        style={{ paddingTop: insets.top + 16, backgroundColor: '#F97316' }} 
        className="px-6 pb-20 rounded-b-[40px] shadow-xl"
      >
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity 
            onPress={() => router.back()} 
            className="bg-white/20 p-2 rounded-full"
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <View className="bg-white/20 px-3 py-1 rounded-full">
            <Text className="text-white text-[10px] font-black uppercase tracking-widest">{dateDisplay}</Text>
          </View>
        </View>
        
        <Text className="text-white text-3xl font-black">Final Confirmation</Text>
        <Text className="text-orange-100/80 text-sm mt-1">Verify student lists before starting the engine</Text>
      </View>

      {/* --- Summary Overlap --- */}
      <View className="flex-row px-8 -mt-10 gap-4">
        <View className="flex-1 bg-white p-5 rounded-3xl shadow-lg items-center border-b-4 border-green-500">
          <Text className="text-3xl font-black text-slate-800">{present.length}</Text>
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ready</Text>
        </View>
        <View className="flex-1 bg-white p-5 rounded-3xl shadow-lg items-center border-b-4 border-red-500">
          <Text className="text-3xl font-black text-slate-800">{absent.length}</Text>
          <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Absent</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 mt-6 px-6"
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#F97316" />}
      >
        {isLoading && present.length === 0 && absent.length === 0 && (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        )}

        {/* --- Present Section --- */}
        {present.length > 0 && (
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-6 bg-green-500 rounded-full mr-2" />
              <Text className="text-slate-800 font-black text-base uppercase tracking-tight">Onboard Today</Text>
            </View>
            {present.map((child: any, idx: number) => (
              <View
                key={child.child_id ?? idx}
                className="mb-3 p-4 rounded-[24px] bg-white border border-slate-100 flex-row items-center shadow-sm"
              >
                <View className="bg-green-100 w-12 h-12 rounded-2xl items-center justify-center mr-4">
                  <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-black text-slate-800">{child.child_name}</Text>
                  <View className="flex-row items-center mt-1">
                    <View className="bg-blue-50 px-2 py-0.5 rounded-md mr-2">
                      <Text className="text-[10px] text-blue-600 font-bold">{child.schedule_type || 'BOTH'}</Text>
                    </View>
                    {child.morning_pickup_time && (
                      <View className="bg-green-50 px-2 py-0.5 rounded-md">
                        <Text className="text-[10px] text-green-600 font-bold">ALREADY PICKED</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </View>
            ))}
          </View>
        )}

        {/* --- Absent Section --- */}
        {absent.length > 0 && (
          <View>
            <View className="flex-row items-center mb-3">
              <View className="w-2 h-6 bg-red-500 rounded-full mr-2" />
              <Text className="text-slate-800 font-black text-base uppercase tracking-tight">Staying Home</Text>
            </View>
            {absent.map((child: any, idx: number) => (
              <View
                key={child.child_id ?? idx}
                className="mb-3 p-4 rounded-[24px] bg-red-50/50 border border-red-100 flex-row items-center opacity-80"
              >
                <View className="bg-red-100 w-12 h-12 rounded-2xl items-center justify-center mr-4">
                  <Ionicons name="close-circle" size={28} color="#EF4444" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-black text-slate-700">{child.child_name}</Text>
                  <Text className="text-[11px] text-red-400 font-bold">Marked absent by parent</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!isLoading && present.length === 0 && absent.length === 0 && (
          <View className="py-20 items-center bg-white rounded-3xl border border-dashed border-slate-200">
            <Ionicons name="bus-outline" size={64} color="#CBD5E1" />
            <Text className="text-slate-400 mt-4 text-center font-bold text-lg">No Trip Data</Text>
            <Text className="text-slate-300 text-sm text-center px-10">Attendance status from parents will appear here.</Text>
          </View>
        )}
      </ScrollView>

      {/* --- Start Trip Button --- */}
      <View 
        className="absolute bottom-0 left-0 right-0 bg-white/90 shadow-2xl px-8 pt-4 pb-8"
        style={{ paddingBottom: Math.max(insets.bottom, 20) }}
      >
        <TouchableOpacity
          onPress={handleProcess}
          disabled={processing || createTripMutation.isPending || present.length === 0}
          activeOpacity={0.8}
          className={`h-16 rounded-[24px] items-center flex-row justify-center shadow-lg ${
            present.length === 0 ? 'bg-slate-300' : 'bg-orange-600 shadow-orange-300'
          }`}
        >
          {processing || createTripMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <View className="bg-white/20 p-2 rounded-full mr-3">
                <Ionicons name="navigate" size={20} color="white" />
              </View>
              <Text className="text-white font-black text-lg">Confirm & Start Route</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
