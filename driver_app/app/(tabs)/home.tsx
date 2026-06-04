import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDriverProfile, useActiveTrip, useStartTrip, useEndTrip } from '../../hooks/useApi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGeofenceAlert } from '../../hooks/useGeofenceAlert';
import MissedDropoffAlert from '../../components/MissedDropoffAlert';
import * as Location from 'expo-location';

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Fetch Driver Profile
  const { data: profile, isLoading } = useDriverProfile();

  const { data: activeTrip } = useActiveTrip();
  const startTripMutation = useStartTrip();
  const endTripMutation = useEndTrip();
  
  const isTripActive = !!activeTrip;
  const { showModal, missedChildren, dismissAlert } = useGeofenceAlert(isTripActive);

  const handleTripAction = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({});
      if (isTripActive) {
        endTripMutation.mutate({ 
          trip_id: activeTrip.id, 
          end_lat: location.coords.latitude, 
          end_lon: location.coords.longitude 
        });
      } else {
        const hour = new Date().getHours();
        const type = hour < 12 ? 'morning' : 'evening';
        startTripMutation.mutate({ 
          type, 
          start_lat: location.coords.latitude, 
          start_lon: location.coords.longitude 
        });
      }
    } catch (e) {
      console.log('Location error:', e);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">

      {/* --- Dynamic Header --- */}
      <View
        className="px-6 pb-4 flex-row justify-between items-center bg-white shadow-sm border-b border-slate-100 z-10"
        style={{ paddingTop: Math.max(insets.top, 20) + 16 }}
      >
        <View>
          <Text className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-1">
            Driver Console
          </Text>
          <Text className="text-2xl font-bold text-slate-800">
            {isLoading ? 'Loading...' : `Welcome back, ${profile?.first_name || 'Driver'}`}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center border border-orange-100"
        >
          <Ionicons name="person" size={24} color="#EA580C" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>

        {/* --- Face Scan Attendance Card (Prominent) --- */}
        <Text className="text-slate-800 font-bold mb-4 text-lg">Face Attendance</Text>

        <TouchableOpacity
          onPress={() => router.push('/(tabs)/attendance')}
          className="w-full bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-200 flex-row items-center mb-8"
          activeOpacity={0.8}
        >
          <View className="bg-white/20 p-4 rounded-full mr-4">
            <Ionicons name="scan" size={32} color="white" />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-white">Scan Student Face</Text>
            <Text className="text-indigo-200">Verify & mark attendance via face recognition</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* --- Primary Actions --- */}
        <Text className="text-slate-800 font-bold mb-4 text-lg">Active Trip Controls</Text>

        <TouchableOpacity
          onPress={handleTripAction}
          className={`w-full p-6 rounded-2xl shadow-sm border flex-row items-center mb-8 ${isTripActive ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}
        >
          <View className={`${isTripActive ? 'bg-red-200' : 'bg-orange-100'} p-4 rounded-full mr-4`}>
            <Ionicons name="bus" size={32} color={isTripActive ? "#DC2626" : "#F97316"} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-slate-800">
              {isTripActive ? 'End Current Trip' : 'Start Trip'}
            </Text>
            <Text className="text-slate-500">
              {isTripActive ? 'Stop live navigation & tracking' : 'Live navigation & student tracking'}
            </Text>
          </View>
          {startTripMutation.isPending || endTripMutation.isPending ? (
            <ActivityIndicator color={isTripActive ? "#DC2626" : "#F97316"} />
          ) : (
             <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
          )}
        </TouchableOpacity>

        {/* --- Secondary Grid --- */}
        <Text className="text-slate-800 font-bold mb-4 text-lg">Management</Text>

        <View className="flex-row flex-wrap justify-between mb-8 gap-4">

          <TouchableOpacity
            onPress={() => router.push('./passengers')}
            className="w-[47%] bg-white p-5 rounded-2xl shadow-sm border border-slate-100 items-center justify-center"
          >
            <View className="bg-indigo-100 w-14 h-14 rounded-full items-center justify-center mb-3">
              <Ionicons name="people" size={28} color="#4F46E5" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">My Passengers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('./attendance')}
            className="w-[47%] bg-white p-5 rounded-2xl shadow-sm border border-slate-100 items-center justify-center"
          >
            <View className="bg-teal-100 w-14 h-14 rounded-full items-center justify-center mb-3">
              <Ionicons name="calendar-outline" size={28} color="#0D9488" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">Attendance Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/trip-history')}
            className="w-[47%] bg-white p-5 rounded-2xl shadow-sm border border-slate-100 items-center justify-center"
          >
            <View className="bg-blue-100 w-14 h-14 rounded-full items-center justify-center mb-3">
              <Ionicons name="map-outline" size={28} color="#3B82F6" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">Trip History</Text>
            <Text className="text-xs text-slate-400 text-center mt-1">Past routes</Text>
          </TouchableOpacity>

        </View>

        {/* --- Debug/Parent Bridge (If mixed role handling needed eventually) --- */}
        {user?.role === 'Parent' && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/parent')}
            className="w-full bg-green-50 p-6 rounded-2xl border border-green-200 flex-row items-center mt-4"
          >
            <View className="bg-green-200 p-3 rounded-full mr-4">
              <Ionicons name="people-circle" size={28} color="#16A34A" />
            </View>
            <View>
              <Text className="text-lg font-bold text-green-800">Switch to Parent View</Text>
              <Text className="text-green-600/80">You have dual permissions</Text>
            </View>
          </TouchableOpacity>
        )}

      </ScrollView>
      <MissedDropoffAlert visible={showModal} missedChildren={missedChildren} onDismiss={dismissAlert} />
    </View>
  );
}