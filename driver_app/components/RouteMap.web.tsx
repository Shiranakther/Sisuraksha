import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RouteMapProps {
  currentLocation: any;
  routeSegments: any[];
  stops: any[];
  selectedStop: any;
  onStopPress: (stop: any) => void;
  showLegend: boolean;
  setShowLegend: (show: boolean) => void;
  centerOnLocation: () => void;
  IRI_COLORS: Record<string, string>;
}

export default function RouteMap({
  showLegend,
  setShowLegend,
}: RouteMapProps) {
  return (
    <View className="flex-1 bg-slate-200 relative items-center justify-center overflow-hidden">
      {/* Abstract Map Pattern */}
      <View className="absolute inset-0 opacity-10">
        <View className="absolute top-10 left-0 w-full h-2 bg-slate-400 rotate-12" />
        <View className="absolute top-40 left-0 w-full h-2 bg-slate-400 -rotate-6" />
        <View className="absolute top-1/2 left-20 w-2 h-full bg-slate-400" />
      </View>

      <View className="bg-white/80 p-6 rounded-2xl items-center shadow-sm">
        <Ionicons name="map" size={48} color="#94A3B8" />
        <Text className="text-slate-600 font-bold mt-4 text-lg">Interactive Map</Text>
        <Text className="text-slate-500 text-center mt-2 max-w-xs">
          Native maps are not supported in web preview.
          Run on Android/iOS to see the OSRM navigation and IRI overlay.
        </Text>
      </View>

      {/* Floating Controls Placeholder */}
      <View className="absolute top-4 right-4">
        <TouchableOpacity className="bg-white p-3 rounded-full shadow-lg mb-2">
          <Ionicons name="locate" size={24} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowLegend(!showLegend)} className="bg-white p-3 rounded-full shadow-lg">
          <Ionicons name="information-circle" size={24} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* IRI Legend */}
      {showLegend && (
        <View className="absolute top-4 left-4 bg-white/95 p-3 rounded-xl shadow-lg">
          <Text className="text-xs font-bold text-slate-700 mb-2">Road Quality (IRI)</Text>
          <View className="flex-row items-center mb-1">
            <View className="w-4 h-4 rounded bg-green-500 mr-2" />
            <Text className="text-xs text-slate-600">Good (IRI {'<'} 2)</Text>
          </View>
          <View className="flex-row items-center mb-1">
            <View className="w-4 h-4 rounded bg-yellow-500 mr-2" />
            <Text className="text-xs text-slate-600">Moderate (IRI 2-4)</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-4 h-4 rounded bg-red-500 mr-2" />
            <Text className="text-xs text-slate-600">Poor (IRI {'>'} 4)</Text>
          </View>
        </View>
      )}
    </View>
  );
}
