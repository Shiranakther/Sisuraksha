import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useBoardingStatus, useMarkChildBoarded } from '../../hooks/useApi';

const STOP_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2', '#4F46E5', '#B91C1C'];

export default function RouteMapTripTab() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { data: children, isLoading, refetch } = useBoardingStatus(tripId ?? null);
  const markBoarded = useMarkChildBoarded(tripId ?? '');
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const orderedChildren: any[] = children ?? [];

  // Fit map to show all markers
  const fitToMarkers = useCallback(() => {
    if (!mapRef.current || orderedChildren.length === 0) return;
    const coords = orderedChildren
      .filter((c: any) => c.pickup_lat && c.pickup_lon)
      .map((c: any) => ({ latitude: c.pickup_lat, longitude: c.pickup_lon }));

    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
        animated: true,
      });
    }
  }, [orderedChildren]);

  useEffect(() => {
    if (orderedChildren.length > 0) {
      const timer = setTimeout(fitToMarkers, 500);
      return () => clearTimeout(timer);
    }
  }, [orderedChildren.length, fitToMarkers]);

  const handleMarkBoarded = (childId: string, childName: string) => {
    Alert.alert(
      'Mark Boarded',
      `Mark ${childName} as boarded?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'RFID/Face', onPress: () =>
            markBoarded.mutate({ childId, board_method: 'FACE' })
        },
        {
          text: 'Manual', onPress: () =>
            markBoarded.mutate({ childId, board_method: 'MANUAL' })
        },
      ]
    );
  };

  // Build polyline from ordered pickup locations
  const routeCoords = orderedChildren
    .filter((c: any) => c.pickup_lat && c.pickup_lon)
    .map((c: any) => ({ latitude: c.pickup_lat, longitude: c.pickup_lon }));

  const boardedCount = orderedChildren.filter((c: any) => c.boarded_at).length;
  const totalCount = orderedChildren.length;

  if (!tripId) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center" style={{ paddingTop: insets.top }}>
        <Ionicons name="alert-circle-outline" size={48} color="#CBD5E1" />
        <Text className="text-slate-400 mt-4">No trip selected. Go back and process a trip first.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 bg-blue-600 px-6 py-3 rounded-xl">
          <Text className="text-white font-bold">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="bg-white px-6 py-3 border-b border-slate-100 flex-row items-center z-10">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-800">Trip Route Map</Text>
          <Text className="text-xs text-slate-400">
            {boardedCount}/{totalCount} children boarded
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()}>
          <Ionicons name="refresh" size={22} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View className="bg-white px-6 py-2 border-b border-slate-100">
        <View className="bg-slate-200 h-2 rounded-full overflow-hidden">
          <View
            className="bg-green-500 h-2 rounded-full"
            style={{ width: totalCount > 0 ? `${(boardedCount / totalCount) * 100}%` : '0%' }}
          />
        </View>
      </View>

      {/* Map */}
      <View className="flex-1">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: 6.9271,
              longitude: 79.8612,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {/* Route line */}
            {routeCoords.length > 1 && (
              <Polyline
                coordinates={routeCoords}
                strokeColor="#2563EB"
                strokeWidth={3}
                lineDashPattern={[10, 5]}
              />
            )}

            {/* Child markers */}
            {orderedChildren.map((child: any, idx: number) => {
              if (!child.pickup_lat || !child.pickup_lon) return null;
              const isBoarded = !!child.boarded_at;
              const color = STOP_COLORS[idx % STOP_COLORS.length];

              return (
                <Marker
                  key={child.child_id}
                  coordinate={{ latitude: child.pickup_lat, longitude: child.pickup_lon }}
                  onPress={() => setSelectedChild(child.child_id)}
                >
                  <View className="items-center">
                    <View
                      style={{ backgroundColor: isBoarded ? '#16A34A' : color }}
                      className="w-8 h-8 rounded-full items-center justify-center border-2 border-white"
                    >
                      {isBoarded ? (
                        <Ionicons name="checkmark" size={18} color="white" />
                      ) : (
                        <Text className="text-white text-xs font-bold">{idx + 1}</Text>
                      )}
                    </View>
                    <Text className="text-[10px] font-bold text-slate-700 mt-0.5 bg-white px-1 rounded">
                      {child.child_name?.split(' ')[0]}
                    </Text>
                  </View>
                </Marker>
              );
            })}
          </MapView>
        )}

        {/* Floating center button */}
        <TouchableOpacity
          onPress={fitToMarkers}
          className="absolute top-4 right-4 bg-white p-3 rounded-full shadow-lg"
        >
          <Ionicons name="locate" size={24} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Bottom List */}
      <View
        className="bg-white border-t border-slate-200"
        style={{ maxHeight: 220, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          {orderedChildren.map((child: any, idx: number) => {
            const isBoarded = !!child.boarded_at;
            const isSelected = selectedChild === child.child_id;

            return (
              <TouchableOpacity
                key={child.child_id}
                onPress={() => {
                  setSelectedChild(child.child_id);
                  if (child.pickup_lat && child.pickup_lon && mapRef.current) {
                    mapRef.current.animateToRegion({
                      latitude: child.pickup_lat,
                      longitude: child.pickup_lon,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    });
                  }
                }}
                className={`flex-row items-center p-3 rounded-xl mb-2 ${
                  isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50'
                }`}
              >
                {/* Stop number */}
                <View
                  className="w-7 h-7 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: isBoarded ? '#16A34A' : STOP_COLORS[idx % STOP_COLORS.length] }}
                >
                  {isBoarded ? (
                    <Ionicons name="checkmark" size={14} color="white" />
                  ) : (
                    <Text className="text-white text-xs font-bold">{idx + 1}</Text>
                  )}
                </View>

                {/* Info */}
                <View className="flex-1">
                  <Text className={`text-sm font-bold ${isBoarded ? 'text-green-700' : 'text-slate-800'}`}>
                    {child.child_name}
                  </Text>
                  {child.pickup_address && (
                    <Text className="text-xs text-slate-400" numberOfLines={1}>{child.pickup_address}</Text>
                  )}
                </View>

                {/* Board button or status */}
                {isBoarded ? (
                  <View className="bg-green-100 px-3 py-1.5 rounded-lg">
                    <Text className="text-green-700 text-xs font-bold">Boarded</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleMarkBoarded(child.child_id, child.child_name)}
                    className="bg-orange-500 px-3 py-1.5 rounded-lg"
                  >
                    <Text className="text-white text-xs font-bold">Board</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
