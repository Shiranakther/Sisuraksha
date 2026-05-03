import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, Alert, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOptimizedRoute, useMarkStudentBoarded } from '../hooks/useApi';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function OptimizedRouteMapScreen() {
  const insets = useSafeAreaInsets();
  const { data: routeData, isLoading, refetch } = useOptimizedRoute();
  const boardMutation = useMarkStudentBoarded();
  
  const [driverLocation, setDriverLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setDriverLocation(location);

      // Optionally, set up location tracking here
    })();
  }, []);

  const handleBoardStudent = (childId: string, childName: string) => {
    Alert.alert(
      "Confirm Boarding",
      `Are you sure you want to mark ${childName} as picked up?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Picked Up", 
          onPress: () => {
            boardMutation.mutate(childId, {
              onSuccess: () => {
                Alert.alert("Success", `${childName} marked as picked up!`);
                refetch();
              },
              onError: (err: any) => {
                Alert.alert("Error", err?.response?.data?.message || "Failed to update status");
              }
            });
          }
        }
      ]
    );
  };

  if (isLoading || !driverLocation) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-slate-600 font-medium">Loading optimized route...</Text>
      </View>
    );
  }

  const { start_location, waypoints, destination } = routeData || {};
  
  // Prepare map coordinates
  const originCoord = driverLocation ? { latitude: driverLocation.coords.latitude, longitude: driverLocation.coords.longitude } : start_location;
  const destCoord = destination ? { latitude: destination.latitude, longitude: destination.longitude } : null;
  const waypointCoords = (waypoints || []).map((wp: any) => ({
    latitude: wp.latitude,
    longitude: wp.longitude,
  }));

  const initialRegion = originCoord ? {
    ...originCoord,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  } : undefined;

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-3 bg-white border-b border-slate-200 z-10 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-slate-800">Optimized ADDR Route</Text>
        <TouchableOpacity onPress={() => refetch()} className="p-2 bg-blue-50 rounded-full">
           <Ionicons name="refresh" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <View className="h-3/5 w-full">
        {initialRegion && (
          <MapView style={StyleSheet.absoluteFillObject} initialRegion={initialRegion}>
            
            {/* Driver Current Location */}
            {originCoord && (
              <Marker coordinate={originCoord} title="My Location">
                <View className="bg-blue-600 p-2 rounded-full border-2 border-white">
                  <Ionicons name="bus" size={16} color="white" />
                </View>
              </Marker>
            )}

            {/* Waypoints (Students) */}
            {waypoints?.map((wp: any, index: number) => {
              // Ensure we check if the student was picked up (might need backend to return this flag in the future, assuming false if returned in list for now)
              const isPickedUp = wp.picked_up; 
              return (
                <Marker 
                  key={`wp-${wp.child_id}`} 
                  coordinate={{ latitude: wp.latitude, longitude: wp.longitude }}
                  title={wp.child_name}
                  description="Student Pickup"
                >
                  <View className={`${isPickedUp ? 'bg-emerald-500' : 'bg-red-500'} p-1.5 rounded-full border-2 border-white`}>
                    <Ionicons name="person" size={14} color="white" />
                  </View>
                </Marker>
              );
            })}

            {/* Destination (School) */}
            {destCoord && (
              <Marker coordinate={destCoord} title={destination?.name || "School"}>
                <View className="bg-indigo-600 p-2 rounded-full border-2 border-white">
                  <Ionicons name="school" size={16} color="white" />
                </View>
              </Marker>
            )}

            {/* Render Polyline */}
            {originCoord && destCoord && GOOGLE_MAPS_API_KEY !== '' && (
              <MapViewDirections
                origin={originCoord}
                destination={destCoord}
                waypoints={waypointCoords}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={4}
                strokeColor="#3B82F6"
                optimizeWaypoints={true} // Google Maps TSP optimization
              />
            )}
          </MapView>
        )}
      </View>

      {/* Pickup List / Roster */}
      <View className="flex-1 bg-white pt-4">
        <Text className="px-5 text-lg font-bold text-slate-800 mb-3">Today's Pickup Queue</Text>
        <FlatList
          data={waypoints}
          keyExtractor={(item) => item.child_id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          ListEmptyComponent={
            <Text className="text-slate-500 mt-4 text-center">No students to pick up today. All absent.</Text>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between p-4 mb-3 bg-slate-50 rounded-xl border border-slate-100">
              <View className="flex-row items-center flex-1">
                <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center mr-3">
                  <Ionicons name="person" size={20} color="#3B82F6" />
                </View>
                <View>
                  <Text className="font-bold text-slate-800 text-base">{item.child_name}</Text>
                  <Text className="text-xs text-slate-500">Pickup Required</Text>
                </View>
              </View>
              <TouchableOpacity 
                onPress={() => handleBoardStudent(item.child_id, item.child_name)}
                disabled={boardMutation.isPending}
                className="bg-slate-800 px-4 py-2 rounded-lg"
              >
                {boardMutation.isPending ? (
                   <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-sm">Pick Up</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </View>
  );
}
