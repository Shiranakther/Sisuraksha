import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useMyLocation, useUpdateLocation, useProfile } from '../../hooks/useApi';
import AttendanceDeclaration from '../../components/AttendanceDeclaration';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // 1. Fetch Profile and Location
  const { data: profile, isLoading: isLoadingProfile } = useProfile();
  const { data: savedLocation, isLoading: isLoadingLocation } = useMyLocation();
  const updateLocationMutation = useUpdateLocation();

  const [gpsLoading, setGpsLoading] = useState(false);

  // 2. GPS Logic
  const handleUpdateLocation = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Allow location access to update your address.');
        setGpsLoading(false);
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      let addressResponse = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (addressResponse.length > 0) {
        const addr = addressResponse[0];
        const street = addr.street || addr.name || '';
        const city = addr.city || addr.subregion || '';
        const fullAddress = `${street}, ${city}, ${addr.region || ''}`;

        updateLocationMutation.mutate({
          latitude,
          longitude,
          address: fullAddress,
          city: city || 'Unknown City',
        });
      }
    } catch (error) {
      Alert.alert('Error', 'Could not fetch location.');
    } finally {
      setGpsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header Container */}
      <View
        className="px-6 pb-4 flex-row justify-between items-center bg-white shadow-sm border-b border-slate-100 z-10"
        style={{ paddingTop: Math.max(insets.top, 20) + 16 }}
      >
        <View>
          <Text className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-1">
            Dashboard
          </Text>
          <Text className="text-2xl font-bold text-slate-800">
            {isLoadingProfile ? 'Loading...' : `Welcome back, ${profile?.first_name || 'Parent'}`}
          </Text>
        </View>

        {/* Profile Button */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          className="w-12 h-12 bg-blue-50 rounded-full items-center justify-center border border-blue-100"
        >
          <Ionicons name="person" size={24} color="#2563EB" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 100 }}>

        {/* --- Quick Actions Grid --- */}
        <Text className="text-slate-800 font-bold mb-4 text-lg">Quick Actions</Text>
        <View className="flex-row flex-wrap justify-between mb-8 gap-4">

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/parent')}
            className="w-[47%] bg-white p-5 rounded-2xl shadow-sm border border-slate-100 items-center justify-center"
          >
            <View className="bg-green-100 w-14 h-14 rounded-full items-center justify-center mb-3">
              <Ionicons name="people" size={28} color="#16A34A" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">Track Children</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/assign_bus')}
            className="w-[47%] bg-white p-5 rounded-2xl shadow-sm border border-slate-100 items-center justify-center"
          >
            <View className="bg-orange-100 w-14 h-14 rounded-full items-center justify-center mb-3">
              <Ionicons name="bus" size={28} color="#F59E0B" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">Find Bus</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/parent')}
            className="w-[47%] bg-white p-5 rounded-2xl shadow-sm border border-slate-100 items-center justify-center"
          >
            <View className="bg-blue-100 w-14 h-14 rounded-full items-center justify-center mb-3">
              <Ionicons name="camera" size={28} color="#3B82F6" />
            </View>
            <Text className="text-base font-bold text-slate-800 text-center">Face ID</Text>
            <Text className="text-xs text-slate-400 text-center mt-1">Register face</Text>
          </TouchableOpacity>

        </View>

        {/* --- Today's Bus Attendance Section --- */}
        <Text className="text-slate-800 font-bold mb-4 text-lg">Today's Attendance</Text>
        <View className="mb-8">
          <AttendanceDeclaration />
        </View>

        {/* --- Location Management Section --- */}
        <Text className="text-slate-800 font-bold mb-4 text-lg">Drop-off Location</Text>

        <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
          <View className="flex-row items-start mb-6">
            <View className="bg-red-50 p-3 rounded-full mr-4">
              <Ionicons name="location-sharp" size={24} color="#EF4444" />
            </View>
            <View className="flex-1 justify-center">
              <Text className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-1">
                Saved Address
              </Text>
              {isLoadingLocation ? (
                <ActivityIndicator size="small" color="#000" className="mt-2 self-start" />
              ) : (
                <View>
                  <Text className="text-slate-800 text-base font-medium">
                    {savedLocation?.address || "No address saved."}
                  </Text>
                  {savedLocation?.city && (
                    <Text className="text-slate-500 text-sm">{savedLocation.city}</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={handleUpdateLocation}
            disabled={gpsLoading || updateLocationMutation.isPending}
            className="bg-slate-800 py-3.5 px-4 rounded-xl items-center flex-row justify-center"
          >
            {gpsLoading || updateLocationMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="navigate" size={18} color="white" style={{ marginRight: 8 }} />
                <Text className="text-white font-bold text-base">Update via GPS</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}