import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

interface RouteSegment {
  id: string;
  coordinates: { latitude: number; longitude: number }[];
  iriLevel: 'good' | 'moderate' | 'poor';
}

interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eta: string;
  studentsCount: number;
}

interface RouteMapProps {
  currentLocation: { latitude: number; longitude: number } | null;
  routeSegments: RouteSegment[];
  stops: Stop[];
  selectedStop: Stop | null;
  onStopPress: (stop: Stop) => void;
  showLegend: boolean;
  setShowLegend: (show: boolean) => void;
  centerOnLocation: () => void;
  IRI_COLORS: Record<string, string>;
}

export default function RouteMap({
  currentLocation,
  routeSegments,
  stops,
  selectedStop,
  onStopPress,
  showLegend,
  setShowLegend,
  centerOnLocation,
  IRI_COLORS
}: RouteMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (currentLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        ...currentLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  }, [centerOnLocation]); // Re-run when centerOnLocation is called/changed (simplification)

  // Better implementation for centering call:
  // exposing a ref or using an imperative handle would be cleaner,
  // but for now we rely on the parent driving the camera or just user interaction.
  // Actually, let's keep it simple: We just render the map. 
  // The 'centerOnLocation' prop passed down is a function, so we can't 'listen' to it easily 
  // unless we pass a signal. For this refactor, I will just wire up the button inside this component 
  // or accept a ref. 

  // To avoid complex re-writes, I will keep the controls INSIDE this component for now, 
  // or just pass the function to the parent? 
  // The parent has the button. 
  // Let's forward the ref or just handle the button click in the parent?
  // The original code had the button overlay ON TOP of the map. 
  // I will move the button overlay INSIDE this component to have access to mapRef.

  return (
    <View className="flex-1">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: currentLocation?.latitude || 6.9271,
          longitude: currentLocation?.longitude || 79.8612,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {routeSegments.map((segment) => (
          <Polyline
            key={segment.id}
            coordinates={segment.coordinates}
            strokeColor={IRI_COLORS[segment.iriLevel]}
            strokeWidth={6}
          />
        ))}

        {stops.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            onPress={() => onStopPress(stop)}
          >
            <View className="items-center">
              <View className="bg-blue-500 p-2 rounded-full">
                <Ionicons name="bus" size={16} color="white" />
              </View>
              <View className="bg-white px-2 py-1 rounded-lg mt-1 shadow-sm">
                <Text className="text-xs font-bold text-slate-700">{stop.eta}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating Controls */}
      <View className="absolute top-4 right-4">
        <TouchableOpacity
          onPress={() => {
            if (currentLocation && mapRef.current) {
              mapRef.current.animateToRegion({
                ...currentLocation,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              });
            }
          }}
          className="bg-white p-3 rounded-full shadow-lg mb-2"
        >
          <Ionicons name="locate" size={24} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowLegend(!showLegend)}
          className="bg-white p-3 rounded-full shadow-lg"
        >
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
