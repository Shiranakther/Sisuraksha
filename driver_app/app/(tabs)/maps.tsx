import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveTrip, useBoardingStatus, useMarkChildBoarded } from '../../hooks/useApi';
import apiClient from '../../api/axios';

const STOP_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2', '#4F46E5', '#B91C1C'];

// Distance helper
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapsScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // 1. Data Hooks
  const { data: activeTrip, isLoading: isLoadingTrip } = useActiveTrip();
  const { data: boardingData, isLoading: isLoadingBoarding } = useBoardingStatus(activeTrip?.id ?? null);
  const markBoarded = useMarkChildBoarded(activeTrip?.id ?? '');

  // 2. State
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const [notifiedChildren, setNotifiedChildren] = useState<Set<string>>(new Set());
  const [osrmRoute, setOsrmRoute] = useState<{ latitude: number; longitude: number }[]>([]);
  const [lastRouteUpdateLocation, setLastRouteUpdateLocation] = useState<{ lat: number, lon: number } | null>(null);

  const orderedChildren = useMemo(() => boardingData?.children ?? [], [boardingData]);
  const destination = useMemo(() => boardingData?.destination, [boardingData]);
  const isEvening = activeTrip?.trip_type?.toLowerCase() === 'evening';

  // Extract multiple schools from the children list dynamically
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

  // Determine how many students are left to pick up/drop off
  const pendingChildrenCount = useMemo(() =>
    orderedChildren.filter((c: any) => !(c.boarded_at || c.is_boarded)).length,
    [orderedChildren]);

  // 3. Optimized OSRM Road Routing
  const fetchRoadRoute = useCallback(async (busLat: number, busLon: number) => {
    if (orderedChildren.length === 0) return;

    let points = [{ latitude: busLat, longitude: busLon }];

    const unboardedPoints = orderedChildren.filter((c: any) => !(c.boarded_at || c.is_boarded)).map((c: any) => {
      const lat = isEvening ? parseFloat(c.dropoff_lat) : parseFloat(c.pickup_lat);
      const lon = isEvening ? parseFloat(c.dropoff_lon) : parseFloat(c.pickup_lon);
      return { latitude: lat, longitude: lon };
    }).filter((p: any) => !isNaN(p.latitude) && !isNaN(p.longitude));

    if (isEvening) {
      // Evening: Bus -> Schools -> Homes (Drop-offs)
      points = [...points, ...uniqueSchools, ...unboardedPoints];
    } else {
      // Morning: Bus -> Homes (Pick-ups) -> Schools
      points = [...points, ...unboardedPoints, ...uniqueSchools];
    }

    try {
      const coordsString = points.map(p => `${p.longitude},${p.latitude}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.code === 'Ok' && json.routes?.[0]) {
        const route = json.routes[0].geometry.coordinates.map((c: any) => ({
          latitude: c[1],
          longitude: c[0]
        }));
        setOsrmRoute(route);
        setLastRouteUpdateLocation({ lat: busLat, lon: busLon });
      }
    } catch (err) {
      console.error("OSRM Fetch Failed", err);
    }
  }, [orderedChildren, destination, isEvening]);

  // Route Load & Refresh
  useEffect(() => {
    if (currentLocation) {
      fetchRoadRoute(currentLocation.coords.latitude, currentLocation.coords.longitude);
    }
  }, [pendingChildrenCount, fetchRoadRoute]);

  // 4. Optimized Location Tracking
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 10 },
        (location) => {
          setCurrentLocation(location);
          setSpeed((location.coords.speed ?? 0) * 3.6);
          setHeading(location.coords.heading ?? 0);

          const busLat = location.coords.latitude;
          const busLon = location.coords.longitude;

          // Only update route if we moved > 500m
          if (lastRouteUpdateLocation) {
            const distMoved = getDistance(busLat, busLon, lastRouteUpdateLocation.lat, lastRouteUpdateLocation.lon);
            if (distMoved > 500) fetchRoadRoute(busLat, busLon);
          }

          // Proximity Alerts
          orderedChildren.forEach(async (child: any) => {
            if (notifiedChildren.has(child.child_id) || child.is_boarded) return;
            const stopLat = parseFloat(isEvening ? child.dropoff_lat : child.pickup_lat);
            const stopLon = parseFloat(isEvening ? child.dropoff_lon : child.pickup_lon);
            if (isNaN(stopLat) || isNaN(stopLon)) return;

            if (getDistance(busLat, busLon, stopLat, stopLon) <= 1000) {
              setNotifiedChildren(prev => new Set(prev).add(child.child_id));
              try {
                await apiClient.post(`/driver/trip/notify-proximity/${child.child_id}`, { tripId: activeTrip?.id, distance: 1000 });
              } catch { }
            }
          });

          if (isFollowing && mapRef.current) {
            mapRef.current.animateCamera({
              center: { latitude: busLat, longitude: busLon },
              heading: location.coords.heading ?? 0,
              pitch: 45,
              zoom: 17
            }, { duration: 1000 });
          }
        }
      );
    })();
    return () => subscription?.remove();
  }, [isFollowing, activeTrip?.id, orderedChildren, lastRouteUpdateLocation]);

  // 5. Memoized Markers
  const markers = useMemo(() => {
    return (
      <>
        {osrmRoute.length > 1 && (
          <Polyline coordinates={osrmRoute} strokeColor="#2563EB" strokeWidth={6} />
        )}

        {/* Trip Start Marker */}
        {activeTrip?.driver_start_latitude && (
          <Marker coordinate={{ latitude: parseFloat(activeTrip.driver_start_latitude as any), longitude: parseFloat(activeTrip.driver_start_longitude as any) }} title="Trip Start">
            <View className="bg-slate-800 p-1.5 rounded-lg border-2 border-white shadow-md">
              <Ionicons name="play" size={14} color="white" />
            </View>
          </Marker>
        )}

        {orderedChildren.map((child: any, idx: number) => {
          const lat = isEvening ? parseFloat(child.dropoff_lat) : parseFloat(child.pickup_lat);
          const lon = isEvening ? parseFloat(child.dropoff_lon) : parseFloat(child.pickup_lon);
          if (isNaN(lat) || isNaN(lon)) return null;
          const isBoarded = !!child.boarded_at || !!child.is_boarded;
          const isNotified = notifiedChildren.has(child.child_id);
          return (
            <Marker key={child.child_id} coordinate={{ latitude: lat, longitude: lon }}>
              <View className="items-center">
                {isNotified && !isBoarded && <View className="bg-orange-500 px-2 py-1 rounded-full mb-1 shadow-sm"><Text className="text-white text-[8px] font-black uppercase">Near</Text></View>}
                <View className="w-9 h-9 rounded-full items-center justify-center border-2 border-white shadow-lg" style={{ backgroundColor: isBoarded ? '#16A34A' : (isNotified ? '#F97316' : STOP_COLORS[idx % STOP_COLORS.length]) }}>
                  <Ionicons name={isEvening ? "log-out" : "log-in"} size={16} color="white" />
                </View>
              </View>
            </Marker>
          );
        })}

        {/* Multiple School Markers */}
        {uniqueSchools.map((school: any, idx: number) => (
          <Marker key={`school-${idx}`} coordinate={{ latitude: school.latitude, longitude: school.longitude }} title={school.name || "School"}>
            <View className="bg-red-600 p-2 rounded-xl border-2 border-white shadow-lg"><Ionicons name="school" size={20} color="white" /></View>
          </Marker>
        ))}
      </>
    );
  }, [osrmRoute, orderedChildren, notifiedChildren, isEvening, uniqueSchools, activeTrip]);

  return (
    <View className="flex-1 bg-white">
      <MapView ref={mapRef} style={{ flex: 1 }} showsUserLocation={false} onPanDrag={() => setIsFollowing(false)}>
        {markers}
        {currentLocation && (
          <Marker coordinate={{ latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude }} flat anchor={{ x: 0.5, y: 0.5 }} rotation={heading}>
            <View className="bg-blue-600 p-1.5 rounded-full border-2 border-white shadow-xl"><Ionicons name="bus" size={20} color="white" /></View>
          </Marker>
        )}
      </MapView>

      <View style={{ top: insets.top + 16 }} className="absolute left-6 right-6 flex-row gap-4">
        <View className="flex-1 bg-slate-900/90 backdrop-blur-md p-4 rounded-[32px] items-center shadow-2xl">
          <Text className="text-white/50 text-[10px] font-black uppercase">Speed</Text>
          <Text className="text-white text-3xl font-black">{Math.round(speed)} <Text className="text-xs">km/h</Text></Text>
        </View>
        <View className="flex-1 bg-white/95 backdrop-blur-md p-4 rounded-[32px] items-center shadow-2xl">
          <Text className="text-slate-400 text-[10px] font-black uppercase">Mission</Text>
          <Text className="text-blue-600 text-lg font-black mt-1 uppercase tracking-tighter">{activeTrip?.trip_type || 'Active'}</Text>
        </View>
      </View>

      <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[48px] shadow-2xl" style={{ height: activeTrip ? 300 : 180, paddingBottom: insets.bottom }}>
        <View className="w-12 h-1.5 bg-slate-200 rounded-full self-center mt-3 mb-2" />
        <ScrollView className="px-6 mt-2" showsVerticalScrollIndicator={false}>
          {orderedChildren.map((child: any) => {
            const isBoarded = !!child.boarded_at || !!child.is_boarded;
            return (
              <View key={child.child_id} className="flex-row items-center p-4 rounded-[28px] mb-3 bg-slate-50 border border-slate-100">
                <View className="w-10 h-10 rounded-2xl items-center justify-center mr-4" style={{ backgroundColor: isBoarded ? '#16A34A' : '#F1F5F9' }}>
                  <Ionicons name={isBoarded ? "checkmark" : (isEvening ? "log-out" : "log-in")} size={18} color={isBoarded ? "white" : "#64748B"} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-black text-slate-800">{child.child_name}</Text>
                  <Text className="text-[10px] text-slate-400 font-bold uppercase">{isBoarded ? 'Completed' : 'Upcoming stop'}</Text>
                </View>
                {!isBoarded && (
                  <TouchableOpacity onPress={() => markBoarded.mutate({ childId: child.child_id, board_method: 'MANUAL' })} className="bg-blue-600 px-5 py-2.5 rounded-2xl">
                    <Text className="text-white text-[10px] font-black uppercase">Confirm</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
