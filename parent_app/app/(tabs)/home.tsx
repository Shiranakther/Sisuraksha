import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useMyLocation, useUpdateLocation } from '../../hooks/useApi';
import AttendanceDeclaration from '../../components/AttendanceDeclaration';

export default function HomeScreen() {
  const { user } = useAuth();

  // 1. Fetch saved location
  const { data: savedLocation, isLoading: isLoadingLocation } = useMyLocation();
  const updateLocationMutation = useUpdateLocation();

  const [gpsLoading, setGpsLoading] = useState(false);

  // 2. Function to Get GPS & Send to Backend
  const handleUpdateLocation = async () => {
    // ... (Keep your existing GPS logic here unchanged) ...
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
    <ScrollView className="flex-1 bg-slate-50 p-6 pt-16">
      {/* --- Header --- */}
      <View className="mb-8">
        <Text className="text-2xl font-bold text-slate-800">Hello, Parent</Text>
        <Text className="text-slate-500">{user?.email}</Text>
      </View>

      <Text className="text-slate-800 font-bold mb-3 text-lg">Menu</Text>

      {/* 1. Parent Dashboard Card (Existing) */}
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/parent')}
        className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center mb-4"
      >
        <View className="bg-green-100 p-4 rounded-full mr-4">
          <Ionicons name="people" size={32} color="#16A34A" />
        </View>
        <View>
          <Text className="text-lg font-bold text-slate-800">Parent Dashboard</Text>
          <Text className="text-slate-500">Track your children</Text>
        </View>
      </TouchableOpacity>


      <TouchableOpacity
        // Make sure this matches your file name: app/(tabs)/assign_bus.tsx
        onPress={() => router.push('/(tabs)/assign_bus')}
        className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center mb-6"
      >
        <View className="bg-orange-100 p-4 rounded-full mr-4">
          <Ionicons name="bus" size={32} color="#F59E0B" />
        </View>
        <View>
          <Text className="text-lg font-bold text-slate-800">Find School Bus</Text>
          <Text className="text-slate-500">Assign a driver to child</Text>
        </View>
      </TouchableOpacity>

      {/* --- Today's Bus Attendance Section --- */}
      <Text className="text-slate-800 font-bold mb-3 text-lg">Today's Bus Attendance</Text>
      <View className="mb-6">
        <AttendanceDeclaration />
      </View>

      {/* --- Location Management Section (Existing) --- */}
      <Text className="text-slate-800 font-bold mb-3 text-lg">My Location</Text>

      <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <View className="flex-row items-start mb-4">
          <Ionicons name="location-sharp" size={24} color="#EF4444" style={{ marginRight: 8 }} />
          <View className="flex-1">
            <Text className="text-slate-400 text-xs uppercase font-bold tracking-wider">Current Address</Text>
            {isLoadingLocation ? (
              <ActivityIndicator size="small" color="#000" className="mt-2 self-start" />
            ) : (
              <View>
                <Text className="text-slate-800 text-base font-medium mt-1">
                  {savedLocation?.address || "No address saved yet."}
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
          className="bg-slate-800 p-4 rounded-xl items-center flex-row justify-center"
        >
          {gpsLoading || updateLocationMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="navigate" size={18} color="white" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold">Update with Current GPS</Text>
            </>
          )}
        </TouchableOpacity>

        <Text className="text-xs text-slate-400 text-center mt-3">
          Updates your location for bus routing
        </Text>
      </View>

    </ScrollView>
  );
}