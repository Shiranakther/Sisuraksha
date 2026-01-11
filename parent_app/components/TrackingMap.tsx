import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

interface TrackingMapProps {
  busLocation: { latitude: number; longitude: number; speed: number; heading: number };
  parentStop: { latitude: number; longitude: number; name: string };
  routeCoordinates: { latitude: number; longitude: number }[];
  centerOnBus: () => void;
  fitToRoute: () => void;
}

export default function TrackingMap({
  busLocation,
  parentStop,
  routeCoordinates,
  centerOnBus,
  fitToRoute
}: TrackingMapProps) {
  const mapRef = useRef<MapView>(null);

  // We can expose the underlying map methods via useImperativeHandle if needed,
  // but for now we'll just implement the effects based on props or external triggers loosely 
  // tied to the parent state if needed. 
  // Actually, the parent component invokes `centerOnBus` and `fitToRoute` based on user interaction.
  // We need to implement those behaviors inside this component and expose them, 
  // OR simply let the parent render the buttons ON TOP and we pass a ref from parent?
  // Passing a ref from parent to child is cleaner for "controlling" the map.

  // Let's use a simpler approach: 
  // The MapView is here. The parent wants to control it. 
  // We can forward the ref? Yes.
  // But define it here to keep imports isolated.

  // Alternative: The parent passes a "command" prop? No, that's messy.
  // Let's just put the buttons INSIDE this component for simplicity, like we did for Driver app.
  // But wait, the parent app `tracking.tsx` has buttons absolutely positioned.
  // I will move those buttons HERE.

  // Wait, I need to coordinate with the `centerOnBus` prop passed from parent? 
  // The prompt says `centerOnBus` is a prop. 
  // If I move the buttons here, I don't need the prop from parent triggering the map,
  // I just need to trigger the map myself.

  // I will move the "Map Controls" block from `tracking.tsx` into this component.

  const handleCenterOnBus = () => {
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: busLocation.latitude,
        longitude: busLocation.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
    }
  };

  const handleFitToRoute = () => {
    if (mapRef.current) {
      mapRef.current.fitToCoordinates(
        [busLocation, parentStop],
        { edgePadding: { top: 100, right: 50, bottom: 200, left: 50 }, animated: true }
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: busLocation.latitude,
          longitude: busLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {/* Route Line */}
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#3B82F6"
          strokeWidth={4}
          lineDashPattern={[1]}
        />

        {/* Bus Marker */}
        <Marker
          coordinate={{ latitude: busLocation.latitude, longitude: busLocation.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View className="items-center">
            <View className="bg-blue-500 p-2 rounded-full shadow-lg">
              <Ionicons name="bus" size={24} color="white" />
            </View>
            <View className="bg-blue-500 w-3 h-3 rotate-45 -mt-1.5" />
          </View>
        </Marker>

        {/* Parent Stop Marker */}
        <Marker
          coordinate={{ latitude: parentStop.latitude, longitude: parentStop.longitude }}
        >
          <View className="items-center">
            <View className="bg-green-500 p-2 rounded-full shadow-lg">
              <Ionicons name="location" size={24} color="white" />
            </View>
            <View className="bg-white px-2 py-1 rounded-lg mt-1 shadow-sm">
              <Text className="text-xs font-bold text-slate-700">Your Stop</Text>
            </View>
          </View>
        </Marker>
      </MapView>

      {/* Map Controls (Moved inside) */}
      <View className="absolute top-4 right-4">
        <TouchableOpacity
          onPress={handleCenterOnBus}
          className="bg-white p-3 rounded-full shadow-lg mb-2"
        >
          <Ionicons name="bus" size={20} color="#2563EB" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleFitToRoute}
          className="bg-white p-3 rounded-full shadow-lg"
        >
          <Ionicons name="expand" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
