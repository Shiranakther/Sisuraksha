import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useTodayTripData, useCreateTrip } from '../hooks/useApi';

type ChildFilter = 'ALL' | 'PRESENT' | 'ABSENT';

export default function RouteTodayScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<ChildFilter>('ALL');
  const [processing, setProcessing] = useState(false);

  const { data, isLoading } = useTodayTripData();
  const createTripMutation = useCreateTrip();

  const present: any[] = data?.present || [];
  const absent: any[] = data?.absent || [];
  const children: any[] = [
    ...present.map(c => ({ ...c, is_present: true })),
    ...absent.map(c => ({ ...c, is_present: false })),
  ];

  const filtered = filter === 'PRESENT' ? present : filter === 'ABSENT' ? absent : children;

  const handleProcessTrip = () => {
    if (present.length === 0) {
      Alert.alert('No Present Children', 'There are no children marked present today.');
      return;
    }
    Alert.alert(
      'Create Trip',
      `Process route for ${present.length} child(ren) using local GPS. This will create an optimized pickup route.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Trip',
          onPress: async () => {
            setProcessing(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Location Required', 'Please allow location access to create the trip.');
              setProcessing(false);
              return;
            }
            const loc = await Location.getCurrentPositionAsync({});
            createTripMutation.mutate(
              { start_lat: loc.coords.latitude, start_lon: loc.coords.longitude },
              {
                onSuccess: (res: any) => {
                  setProcessing(false);
                  router.push({
                    pathname: '/route-map-trip',
                    params: {
                      tripId: res.trip_id,
                      startLat: loc.coords.latitude.toString(),
                      startLon: loc.coords.longitude.toString(),
                    },
                  } as any);
                },
                onError: () => setProcessing(false),
              }
            );
          },
        },
      ]
    );
  };

  const renderChild = ({ item }: { item: any }) => (
    <View className="mx-4 mb-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <View className={`absolute left-0 top-0 bottom-0 w-1 ${item.is_present ? 'bg-emerald-500' : 'bg-red-400'}`} />
      <View className="pl-4 pr-3 py-3 flex-row items-center">
        <View className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center mr-3">
          <Ionicons name="person" size={18} color={item.is_present ? '#10B981' : '#EF4444'} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-slate-800">{item.child_name}</Text>
          <Text className="text-xs text-slate-500">{item.grade || 'No grade'}</Text>
          {item.pickup_address && (
            <View className="flex-row items-center mt-1">
              <Ionicons name="location-outline" size={12} color="#94A3B8" />
              <Text className="text-xs text-slate-400 ml-1 flex-1" numberOfLines={1}>{item.pickup_address}</Text>
            </View>
          )}
        </View>
        <View className={`px-2 py-1 rounded-lg ${item.is_present ? 'bg-emerald-100' : 'bg-red-100'}`}>
          <Text className={`text-xs font-bold ${item.is_present ? 'text-emerald-700' : 'text-red-700'}`}>
            {item.is_present ? 'Present' : 'Absent'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center px-4 py-4 bg-white border-b border-slate-200 shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-bold text-slate-800">Today's Trip Data</Text>
          <Text className="text-slate-500 text-sm">Review before starting route</Text>
        </View>
      </View>

      {/* Summary cards */}
      <View className="flex-row mx-4 my-3 gap-3">
        {[
          { label: 'Present', count: present.length, bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
          { label: 'Absent', count: absent.length, bg: 'bg-red-50 border-red-100', text: 'text-red-700' },
          { label: 'Total', count: children.length, bg: 'bg-slate-100 border-slate-200', text: 'text-slate-700' },
        ].map(item => (
          <View key={item.label} className={`flex-1 rounded-xl border ${item.bg} p-3 items-center`}>
            <Text className={`text-2xl font-bold ${item.text}`}>{item.count}</Text>
            <Text className={`text-xs font-semibold ${item.text} mt-0.5`}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Tab filter */}
      <View className="flex-row bg-white border-b border-slate-200 mx-4 rounded-xl mb-3 overflow-hidden">
        {(['ALL', 'PRESENT', 'ABSENT'] as ChildFilter[]).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setFilter(tab)}
            className={`flex-1 py-2.5 items-center ${filter === tab ? 'bg-slate-800' : 'bg-white'}`}
          >
            <Text className={`text-xs font-bold ${filter === tab ? 'text-white' : 'text-slate-500'}`}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>



      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : children.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="people-outline" size={56} color="#CBD5E1" />
          <Text className="text-slate-500 mt-4 text-center">No children found for today's route.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.child_id}
          renderItem={renderChild}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Process Trip button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-white border-t border-slate-200">
          <TouchableOpacity
            onPress={handleProcessTrip}
            disabled={processing || present.length === 0}
            className={`w-full py-4 rounded-2xl items-center flex-row justify-center ${
              processing || present.length === 0 ? 'bg-slate-300' : 'bg-emerald-600'
            }`}
            activeOpacity={0.8}
          >
            {processing ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white font-bold text-base ml-2">Processing Route...</Text>
              </>
            ) : (
              <>
                <Ionicons name="navigate" size={20} color="white" />
                <Text className="text-white font-bold text-base ml-2">
                  Process Trip ({present.length} Children)
                </Text>
              </>
            )}
          </TouchableOpacity>
      </View>
    </View>
  );
}
