import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { router, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DriverScreen() {
  const { user } = useAuth();
  if (user?.role !== 'Driver') return <Redirect href="/(tabs)/home" />;

  return (
    <View className="flex-1 bg-white p-6 pt-12">
      <TouchableOpacity onPress={() => router.back()} className="mb-6 flex-row items-center">
        <Ionicons name="arrow-back" size={24} color="#333" />
        <Text className="ml-2 text-base font-medium">Back</Text>
      </TouchableOpacity>
      
      <Text className="text-3xl font-bold text-slate-800 mb-2">Driver Console</Text>
      <View className="bg-blue-50 p-4 rounded-xl mb-6">
        <Text className="text-blue-700 font-semibold">Active Route: Morning Pickup A</Text>
      </View>

      <View className="flex-row gap-4">
        <TouchableOpacity className="flex-1 bg-green-500 p-6 rounded-xl items-center shadow-lg shadow-green-200">
          <Ionicons name="play" size={40} color="white" />
          <Text className="text-white font-bold mt-2">Start Trip</Text>
        </TouchableOpacity>
        
        <TouchableOpacity className="flex-1 bg-slate-100 p-6 rounded-xl items-center">
          <Ionicons name="qr-code" size={40} color="#333" />
          <Text className="text-slate-800 font-bold mt-2">Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}