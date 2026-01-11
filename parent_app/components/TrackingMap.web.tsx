import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TrackingMapProps {
  busLocation: any;
  parentStop: any;
  routeCoordinates: any[];
  centerOnBus: () => void;
  fitToRoute: () => void;
}

export default function TrackingMap({
  centerOnBus,
  fitToRoute
}: TrackingMapProps) {
  return (
    <View className="flex-1 bg-slate-200 mt-4 relative items-center justify-center overflow-hidden">
      {/* Abstract Map Pattern */}
      <View className="absolute inset-0 opacity-10">
        <View className="absolute top-10 left-0 w-full h-2 bg-slate-400 rotate-12" />
        <View className="absolute top-40 left-0 w-full h-2 bg-slate-400 -rotate-6" />
        <View className="absolute top-1/2 left-20 w-2 h-full bg-slate-400" />
      </View>

      <View className="bg-white/80 p-6 rounded-2xl items-center shadow-sm">
        <Ionicons name="map" size={48} color="#94A3B8" />
        <Text className="text-slate-600 font-bold mt-4 text-lg">Live Map</Text>
        <Text className="text-slate-500 text-center mt-2 max-w-xs">
          Interactive tracking map is available on Android/iOS app only.
        </Text>
      </View>

      {/* Map Controls Placeholder */}
      <View className="absolute top-4 right-4">
        <TouchableOpacity className="bg-white p-3 rounded-full shadow-lg mb-2">
          <Ionicons name="bus" size={20} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity className="bg-white p-3 rounded-full shadow-lg">
          <Ionicons name="expand" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
