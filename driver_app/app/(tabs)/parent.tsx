import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { router, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ParentScreen() {
  const { user } = useAuth();
  if (user?.role !== 'Parent') return <Redirect href="/(tabs)/home" />;

  return (
    <View className="flex-1 bg-white p-6 pt-12">
      <TouchableOpacity onPress={() => router.back()} className="mb-6 flex-row items-center">
        <Ionicons name="arrow-back" size={24} color="#333" />
        <Text className="ml-2 text-base font-medium">Back</Text>
      </TouchableOpacity>
      
      <Text className="text-3xl font-bold text-slate-800 mb-6">My Children</Text>
      
      <View className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="w-12 h-12 bg-purple-100 rounded-full items-center justify-center mr-4">
            <Text className="text-xl">👶</Text>
          </View>
          <View>
            <Text className="text-lg font-bold text-slate-800">Alex Doe</Text>
            <Text className="text-green-600 text-sm font-medium">● On the bus</Text>
          </View>
        </View>
        <TouchableOpacity className="bg-blue-50 p-3 rounded-full">
          <Ionicons name="map" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>
    </View>
  );
}