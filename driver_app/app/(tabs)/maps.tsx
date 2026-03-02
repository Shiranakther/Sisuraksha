import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function MapsPlaceholderScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <Ionicons name="map-outline" size={64} color="#94A3B8" />
      <Text className="text-xl font-semibold text-slate-800 mt-4">Maps Placeholder</Text>
      <Text className="text-slate-500 mt-2 text-center px-6">
        This is a placeholder for the future maps functionality.
      </Text>
    </View>
  );
}
