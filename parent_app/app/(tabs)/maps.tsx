import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MapsScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({ latitude: initial.coords.latitude, longitude: initial.coords.longitude });

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
        (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      );
    })();

    return () => { subscription?.remove(); };
  }, []);

  const centerOnMe = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({ ...location, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    }
  };

  if (permissionDenied) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6" style={{ paddingTop: insets.top }}>
        <Ionicons name="location-outline" size={64} color="#94A3B8" />
        <Text className="text-xl font-semibold text-slate-700 mt-4 text-center">Location Permission Required</Text>
        <Text className="text-slate-500 text-center mt-2">Enable location access in device settings to use the live map.</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="text-slate-500 mt-3">Getting your location...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
        <Text className="text-xl font-bold text-slate-800">Live Map</Text>
        <Text className="text-slate-500 text-sm">Your current location</Text>
      </View>

      {/* Map */}
      <View className="flex-1">
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{ ...location, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          showsUserLocation={false}
          showsMyLocationButton={false}
        >
          {/* OpenStreetMap tiles — no API key required */}
          <UrlTile
            urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
          />

          {/* Driver location marker */}
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.5 }}>
            <View className="bg-blue-600 w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow">
              <Ionicons name="bus" size={20} color="white" />
            </View>
          </Marker>
        </MapView>

        {/* Re-center button */}
        <TouchableOpacity
          onPress={centerOnMe}
          className="absolute bottom-6 right-4 bg-white p-4 rounded-full shadow-lg"
        >
          <Ionicons name="locate" size={24} color="#2563EB" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
