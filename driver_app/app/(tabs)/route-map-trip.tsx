import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform
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
  const { tripId, startLat, startLon } = useLocalSearchParams<{
    tripId: string;
    startLat?: string;
    startLon?: string
  }>();

  const { data, isLoading, refetch } = useBoardingStatus(tripId ?? null);
  const markBoarded = useMarkChildBoarded(tripId ?? '');
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [osrmRoute, setOsrmRoute] = useState<{ latitude: number; longitude: number }[]>([]);
  const [tripStats, setTripStats] = useState<{ distance: string; duration: string } | null>(null);

  const orderedChildren = data?.children ?? [];
  const destination = data?.destination;
  const isEvening = destination?.trip_type?.toLowerCase() === 'evening';

  // Extract multiple schools dynamically
  const uniqueSchools = useMemo(() => {
    const map = new Map();
    orderedChildren.forEach((c: any) => {
      if (c.dest_lat && c.dest_lon) {
        const key = `${parseFloat(c.dest_lat).toFixed(4)}-${parseFloat(c.dest_lon).toFixed(4)}`;
        if (!map.has(key)) {
          map.set(key, { latitude: parseFloat(c.dest_lat), longitude: parseFloat(c.dest_lon), name: c.school_name });
        }
      }
    });
    return Array.from(map.values());
  }, [orderedChildren]);

  // Parse start coordinates
  const busStart = startLat && startLon ? {
    latitude: parseFloat(startLat),
    longitude: parseFloat(startLon)
  } : null;

  // 1. Waypoints for markers (Straight sequence)
  const waypointCoords = useMemo(() => {
    let points = busStart ? [busStart] : [];
    
    const unboardedPoints = orderedChildren
      .map((c: any) => ({
        latitude: isEvening ? parseFloat(c.dropoff_lat) : parseFloat(c.pickup_lat),
        longitude: isEvening ? parseFloat(c.dropoff_lon) : parseFloat(c.pickup_lon)
      }))
      .filter((coord: any) => !isNaN(coord.latitude) && !isNaN(coord.longitude));

    if (isEvening) {
      points = [...points, ...uniqueSchools, ...unboardedPoints];
    } else {
      points = [...points, ...unboardedPoints, ...uniqueSchools];
    }
    
    return points;
  }, [busStart?.latitude, busStart?.longitude, orderedChildren.length, uniqueSchools, isEvening]);

  // 2. Fetch Road-Following Route from OSRM
  useEffect(() => {
    const controller = new AbortController();

    const fetchRoute = async () => {
      const validWaypoints = waypointCoords.filter(
        c => !isNaN(c.latitude) && !isNaN(c.longitude)
      );

      if (validWaypoints.length < 2) {
        setOsrmRoute([]);
        return;
      }

      try {
        const coordsString = validWaypoints
          .map(c => `${c.longitude},${c.latitude}`)
          .join(';');

        const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
        const response = await fetch(url, { signal: controller.signal });

        const contentType = response.headers.get("content-type");
        if (!response.ok || !contentType || !contentType.includes("application/json")) {
          setOsrmRoute(validWaypoints);
          return;
        }

        const json = await response.json();

        if (json.code === 'Ok' && json.routes && json.routes[0]) {
          const route = json.routes[0].geometry.coordinates.map((c: any) => ({
            latitude: c[1],
            longitude: c[0]
          }));
          setOsrmRoute(route);

          const distKm = (json.routes[0].distance / 1000).toFixed(1);
          const durMin = Math.round(json.routes[0].duration / 60);
          setTripStats({ distance: `${distKm} km`, duration: `${durMin} min` });
        } else {
          setOsrmRoute(validWaypoints);
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('[Route] OSRM Fetch Error:', error);
          setOsrmRoute(validWaypoints);
        }
      }
    };

    fetchRoute();
    return () => controller.abort();
  }, [waypointCoords]);

  const openInExternalMaps = (lat: number, lon: number, label: string) => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lat},${lon}`;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });
    if (url) Linking.openURL(url);
  };

  // Fit map to show all markers including bus start and school
  const fitToMarkers = useCallback(() => {
    if (!mapRef.current || waypointCoords.length === 0) return;

    mapRef.current.fitToCoordinates(waypointCoords, {
      edgePadding: { top: 120, right: 80, bottom: 280, left: 80 },
      animated: true,
    });
  }, [waypointCoords]);

  useEffect(() => {
    if (waypointCoords.length > 0) {
      const timer = setTimeout(fitToMarkers, 1000);
      return () => clearTimeout(timer);
    }
  }, [waypointCoords.length, fitToMarkers]);

  const handleMarkBoarded = (childId: string, childName: string) => {
    Alert.alert(
      'Boarding Confirmation',
      `Has ${childName} safely boarded the bus?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'RFID / Face',
          onPress: () => markBoarded.mutate({ childId, board_method: 'FACE' })
        },
        {
          text: 'Manual Entry',
          onPress: () => markBoarded.mutate({ childId, board_method: 'MANUAL' })
        },
      ]
    );
  };

  const boardedCount = orderedChildren.filter((c: any) => c.boarded_at || c.is_boarded).length;
  const totalCount = orderedChildren.length;

  if (!tripId) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center p-10">
        <View className="bg-white p-8 rounded-[40px] shadow-xl items-center">
          <Ionicons name="map-outline" size={64} color="#CBD5E1" />
          <Text className="text-slate-800 font-black text-xl mt-4 text-center">No Active Trip</Text>
          <Text className="text-slate-400 text-center mt-2">Initialize a trip from the dashboard to see the navigation route.</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-8 bg-orange-600 px-8 py-4 rounded-2xl shadow-lg shadow-orange-200"
          >
            <Text className="text-white font-black">Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* --- Floating Header --- */}
      <View
        style={{ top: insets.top + 16 }}
        className="absolute left-6 right-6 z-50 bg-white/95 backdrop-blur-md p-4 rounded-[32px] shadow-2xl border border-white flex-row items-center"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-slate-100 p-2.5 rounded-full mr-4"
        >
          <Ionicons name="chevron-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-slate-800 font-black text-base">Route Manifest</Text>
          <View className="flex-row items-center mt-0.5">
            <Ionicons name="time-outline" size={12} color="#64748B" />
            <Text className="text-[10px] text-slate-500 font-bold ml-1 mr-3">{tripStats?.duration || '--'} mins</Text>
            <Ionicons name="navigate-outline" size={12} color="#64748B" />
            <Text className="text-[10px] text-slate-500 font-bold ml-1">{tripStats?.distance || '--'}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          className="bg-blue-50 p-2.5 rounded-full"
        >
          <Ionicons name="refresh" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* --- Progress Ribbon --- */}
      <View style={{ top: insets.top + 98 }} className="absolute left-10 right-10 z-40">
        <View className="bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
          <View
            className="bg-green-500 h-full"
            style={{ width: totalCount > 0 ? `${(boardedCount / totalCount) * 100}%` : '0%' }}
          />
        </View>
      </View>

      {/* --- Map Container --- */}
      <View className="flex-1 bg-slate-100">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={{ width: '100%', height: '100%' }}
            initialRegion={{
              latitude: busStart?.latitude || 6.9271,
              longitude: busStart?.longitude || 79.8612,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {/* Bus Start Location */}
            {busStart && (
              <Marker
                coordinate={busStart}
                title="Trip Start"
                zIndex={100}
              >
                <View className="bg-orange-600 p-2 rounded-full shadow-lg border-2 border-white">
                  <Ionicons name="bus" size={20} color="white" />
                </View>
              </Marker>
            )}

            {/* Multiple School Destinations */}
            {uniqueSchools.map((school: any, idx: number) => (
              <Marker
                key={`school-${idx}`}
                coordinate={{ latitude: school.latitude, longitude: school.longitude }}
                title={school.name || "School"}
                zIndex={100}
              >
                <View className="bg-green-600 p-2 rounded-full shadow-lg border-2 border-white">
                  <Ionicons name="school" size={20} color="white" />
                </View>
              </Marker>
            ))}

            {/* Road-Following Path */}
            {osrmRoute.length > 1 && (
              <Polyline
                coordinates={osrmRoute}
                strokeColor="#2563EB"
                strokeWidth={6}
              />
            )}

            {orderedChildren.map((child: any, idx: number) => {
              const lat = isEvening ? parseFloat(child.dropoff_lat) : parseFloat(child.pickup_lat);
              const lon = isEvening ? parseFloat(child.dropoff_lon) : parseFloat(child.pickup_lon);
              
              if (isNaN(lat) || isNaN(lon)) return null;
              const isBoarded = !!child.boarded_at || !!child.is_boarded;
              const color = STOP_COLORS[idx % STOP_COLORS.length];

              return (
                <Marker
                  key={child.child_id}
                  coordinate={{ latitude: lat, longitude: lon }}
                  onPress={() => setSelectedChild(child.child_id)}
                >
                  <View className="items-center">
                    <View
                      style={{
                        backgroundColor: isBoarded ? '#16A34A' : 'white',
                        borderColor: isBoarded ? '#DCFCE7' : color,
                        borderWidth: 3
                      }}
                      className="w-10 h-10 rounded-full items-center justify-center shadow-lg"
                    >
                      {isBoarded ? (
                        <Ionicons name="checkmark" size={20} color="white" />
                      ) : (
                        <Text style={{ color }} className="text-sm font-black">{idx + 1}</Text>
                      )}
                    </View>
                    <View className="bg-white/90 px-2 py-0.5 rounded-lg mt-1 shadow-sm border border-slate-100">
                      <Text className="text-[9px] font-black text-slate-800 uppercase">{child.child_name?.split(' ')[0]}</Text>
                    </View>
                  </View>
                </Marker>
              );
            })}
          </MapView>
        )}

        <TouchableOpacity
          onPress={fitToMarkers}
          className="absolute bottom-72 right-6 bg-white p-4 rounded-[20px] shadow-2xl border border-slate-100"
        >
          <Ionicons name="locate" size={24} color="#F97316" />
        </TouchableOpacity>
      </View>

      {/* --- Student Drawer --- */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[48px] shadow-2xl border-t border-slate-50"
        style={{ height: 280, paddingBottom: insets.bottom }}
      >
        <View className="w-12 h-1.5 bg-slate-200 rounded-full self-center mt-3 mb-2" />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {orderedChildren.length === 0 && !isLoading && (
            <View className="py-10 items-center">
              <Text className="text-slate-400 font-bold">No students in manifest</Text>
            </View>
          )}

          {orderedChildren.map((child: any, idx: number) => {
            const isBoarded = !!child.boarded_at || !!child.is_boarded;
            const isSelected = selectedChild === child.child_id;
            
            const lat = isEvening ? parseFloat(child.dropoff_lat) : parseFloat(child.pickup_lat);
            const lon = isEvening ? parseFloat(child.dropoff_lon) : parseFloat(child.pickup_lon);

            return (
              <TouchableOpacity
                key={child.child_id}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedChild(child.child_id);
                  if (!isNaN(lat) && !isNaN(lon) && mapRef.current) {
                    mapRef.current.animateToRegion({
                      latitude: lat,
                      longitude: lon,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    });
                  }
                }}
                className={`flex-row items-center p-4 rounded-[28px] mb-3 border ${isSelected ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-transparent'
                  }`}
              >
                <View
                  className="w-10 h-10 rounded-[16px] items-center justify-center mr-4 shadow-sm"
                  style={{ backgroundColor: isBoarded ? '#16A34A' : 'white' }}
                >
                  {isBoarded ? (
                    <Ionicons name="checkmark" size={18} color="white" />
                  ) : (
                    <Text style={{ color: STOP_COLORS[idx % STOP_COLORS.length] }} className="text-sm font-black">{idx + 1}</Text>
                  )}
                </View>

                <View className="flex-1">
                  <Text className={`text-sm font-black ${isBoarded ? 'text-green-700' : 'text-slate-800'}`}>
                    {child.child_name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => !isNaN(lat) && !isNaN(lon) && openInExternalMaps(lat, lon, child.child_name)}
                    className="flex-row items-center mt-0.5"
                  >
                    <Ionicons name="map-outline" size={10} color="#F97316" />
                    <Text className="text-[10px] text-orange-600 font-black uppercase ml-1">Open in Maps</Text>
                  </TouchableOpacity>
                </View>

                {isBoarded ? (
                  <View className="bg-green-100 px-3 py-1.5 rounded-full">
                    <Ionicons name="shield-checkmark" size={14} color="#16A34A" />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleMarkBoarded(child.child_id, child.child_name)}
                    className="bg-orange-600 px-5 py-2.5 rounded-2xl shadow-sm"
                  >
                    <Text className="text-white text-[11px] font-black uppercase">Board</Text>
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
