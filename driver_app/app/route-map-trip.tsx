import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  View, Text, TouchableOpacity, FlatList, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import { useBoardingStatus, useMarkChildBoarded } from '../hooks/useApi';
import FaceScannerModal from '../components/FaceScannerModal';

interface RouteCoord { latitude: number; longitude: number; }

const fetchOSRMRoute = async (coords: RouteCoord[]): Promise<RouteCoord[]> => {
  if (coords.length < 2) return coords;
  const coordStr = coords.map(c => `${c.longitude},${c.latitude}`).join(';');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return coords;
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.[0]) return coords;
    const geoCoords: RouteCoord[] = json.routes[0].geometry.coordinates.map(
      ([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })
    );
    return geoCoords;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('OSRM Fetch Error:', error);
    return coords;
  }
};

const safeFormatTime = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function RouteMapTripScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId: string; startLat?: string; startLon?: string }>();
  const tripId = params.tripId;
  const startLat = params.startLat ? parseFloat(params.startLat) : undefined;
  const startLon = params.startLon ? parseFloat(params.startLon) : undefined;

  const [routeCoords, setRouteCoords] = useState<RouteCoord[]>([]);
  const [fetchingRoute, setFetchingRoute] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  const queryClient = useQueryClient();
  const { data: boardingData, isLoading } = useBoardingStatus(tripId);
  const markBoardedMutation = useMarkChildBoarded(tripId);

  const children: any[] = useMemo(() => {
    if (!boardingData?.children) return [];
    return [...boardingData.children].sort((a, b) => (a.route_order ?? 0) - (b.route_order ?? 0));
  }, [boardingData?.children]);

  const destination = boardingData?.destination;
  const boardedCount = children.filter(c => c.is_boarded || c.boarded_at).length;
  const totalCount = children.length;

  // Build OSRM route once children load
  useEffect(() => {
    if (children.length === 0) return;
    let isMounted = true;

    const waypoints: RouteCoord[] = [];
    if (startLat !== undefined && !isNaN(startLat) && startLon !== undefined && !isNaN(startLon)) {
      waypoints.push({ latitude: startLat, longitude: startLon });
    }

    children.forEach(c => {
      const plat = parseFloat(c.pickup_lat);
      const plon = parseFloat(c.pickup_lon);
      if (!isNaN(plat) && !isNaN(plon)) {
        waypoints.push({ latitude: plat, longitude: plon });
      }
    });

    if (destination?.latitude && destination?.longitude) {
      waypoints.push({ latitude: destination.latitude, longitude: destination.longitude });
    }

    if (waypoints.length < 2) return;

    setFetchingRoute(true);
    fetchOSRMRoute(waypoints).then(coords => {
      if (isMounted) {
        setRouteCoords(coords);
        setFetchingRoute(false);
      }
    });

    return () => { isMounted = false; };
  }, [children.length, startLat, startLon]);

  const mapRegion = (() => {
    const isLatValid = startLat !== undefined && !isNaN(startLat);
    const isLonValid = startLon !== undefined && !isNaN(startLon);

    if (isLatValid && isLonValid) {
      return { latitude: startLat!, longitude: startLon!, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    }

    const firstValidChild = children.find(c => {
      const plat = parseFloat(c.pickup_lat);
      const plon = parseFloat(c.pickup_lon);
      return !isNaN(plat) && !isNaN(plon);
    });

    if (firstValidChild) {
      return {
        latitude: parseFloat(firstValidChild.pickup_lat),
        longitude: parseFloat(firstValidChild.pickup_lon),
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return { latitude: 6.9271, longitude: 79.8612, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  })();

  const handleMarkBoarded = (child: any) => {
    if (child.is_boarded) return;
    Alert.alert(
      'Mark as Boarded',
      `Confirm ${child.child_name} has boarded the bus?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Boarded',
          onPress: () => {
            markBoardedMutation.mutate({ childId: child.child_id });
          },
        },
      ]
    );
  };

  const renderChildRow = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      onPress={() => handleMarkBoarded(item)}
      activeOpacity={item.is_boarded ? 1 : 0.8}
      className={`mx-4 mb-2 bg-white rounded-xl border shadow-sm overflow-hidden ${item.is_boarded ? 'border-emerald-200' : 'border-slate-100'
        }`}
    >
      <View className={`absolute left-0 top-0 bottom-0 w-1 ${item.is_boarded ? 'bg-emerald-500' : 'bg-red-400'}`} />
      <View className="pl-4 pr-3 py-3 flex-row items-center">
        {/* Order badge */}
        <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${item.is_boarded ? 'bg-emerald-500' : 'bg-slate-200'
          }`}>
          {item.is_boarded
            ? <Ionicons name="checkmark" size={16} color="white" />
            : <Text className="text-slate-700 font-bold text-sm">{item.route_order ?? index + 1}</Text>
          }
        </View>

        <View className="flex-1">
          <Text className="font-bold text-slate-800">{item.child_name}</Text>
          <Text className="text-xs text-slate-500">{item.grade || 'No grade'}</Text>
          {item.pickup_address && (
            <View className="flex-row items-center mt-0.5">
              <Ionicons name="location-outline" size={12} color="#94A3B8" />
              <Text className="text-xs text-slate-400 ml-1 flex-1" numberOfLines={1}>{item.pickup_address}</Text>
            </View>
          )}
        </View>

        <View className="items-end">
          <View className={`px-2 py-1 rounded-lg ${item.is_boarded ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <Text className={`text-xs font-bold ${item.is_boarded ? 'text-emerald-700' : 'text-red-700'}`}>
              {item.is_boarded ? 'Boarded' : 'Waiting'}
            </Text>
          </View>
          {item.boarded_at && (
            <Text className="text-xs text-slate-400 mt-1">
              {safeFormatTime(item.boarded_at)}
            </Text>
          )}
          {!item.is_boarded && (
            <Text className="text-xs text-blue-500 mt-1">Tap to board</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="text-slate-500 mt-3">Loading trip data...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-800">Live Trip</Text>
          <Text className="text-slate-500 text-sm">{boardedCount} / {totalCount} boarded</Text>
        </View>
        {fetchingRoute && <ActivityIndicator size="small" color="#10B981" />}
        {boardedCount === totalCount && totalCount > 0 && (
          <View className="bg-emerald-100 px-3 py-1 rounded-full">
            <Text className="text-emerald-700 font-bold text-xs">All Boarded!</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View className="bg-white px-4 pb-3 pt-1">
        <View className="flex-row justify-between mb-1">
          <Text className="text-xs text-slate-500">Progress</Text>
          <Text className="text-xs font-semibold text-emerald-700">
            {totalCount > 0 ? Math.round((boardedCount / totalCount) * 100) : 0}%
          </Text>
        </View>
        <View className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <View
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${totalCount > 0 ? (boardedCount / totalCount) * 100 : 0}%` }}
          />
        </View>
      </View>

      {/* Map - Hidden when scanning to prevent hardware conflict */}
      {!scannerVisible ? (
        <View className="h-64 border-b border-slate-200">
          <MapView 
            style={{ flex: 1 }} 
            initialRegion={mapRegion}
            showsUserLocation
            loadingEnabled
          >
            {/* Driver start position */}
            {startLat !== undefined && !isNaN(startLat) && startLon !== undefined && !isNaN(startLon) && (
              <Marker coordinate={{ latitude: startLat, longitude: startLon }} title="Your Location">
                <View className="bg-blue-600 w-8 h-8 rounded-full items-center justify-center border-2 border-white shadow">
                  <Ionicons name="bus" size={16} color="white" />
                </View>
              </Marker>
            )}

            {/* Child markers */}
            {children.map((c) => {
              const lat = parseFloat(c.pickup_lat);
              const lon = parseFloat(c.pickup_lon);
              if (isNaN(lat) || isNaN(lon)) return null;
              
              return (
                <Marker
                  key={c.child_id}
                  coordinate={{ latitude: lat, longitude: lon }}
                  title={c.child_name}
                  description={c.pickup_address || ''}
                >
                  <View className={`w-8 h-8 rounded-full items-center justify-center border-2 border-white shadow ${
                    c.is_boarded ? 'bg-emerald-500' : 'bg-red-500'
                  }`}>
                    <Ionicons name={c.is_boarded ? 'checkmark' : 'person'} size={14} color="white" />
                  </View>
                </Marker>
              );
            })}
            
            {/* Destination Marker */}
            {destination?.latitude && destination?.longitude && (
              <Marker 
                coordinate={{ latitude: destination.latitude, longitude: destination.longitude }} 
                title={destination.name || "School"}
              >
                <View className="bg-emerald-600 p-2 rounded-full border-2 border-white shadow">
                  <Ionicons name="school" size={16} color="white" />
                </View>
              </Marker>
            )}

            {/* OSRM route polyline */}
            {routeCoords.length > 1 && (
              <Polyline
                coordinates={routeCoords}
                strokeColor="#10B981"
                strokeWidth={4}
              />
            )}
          </MapView>
        </View>
      ) : (
        <View className="h-64 items-center justify-center bg-slate-900">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="text-white mt-2">Camera Active...</Text>
        </View>
      )}

      {/* Children list */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-slate-200">
        <Ionicons name="list" size={18} color="#64748B" />
        <Text className="text-sm font-bold text-slate-700 ml-2 uppercase tracking-wider">Pickup Order</Text>
      </View>

      <FlatList
        data={children}
        keyExtractor={(item) => String(item.child_id)}
        renderItem={renderChildRow}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="items-center mt-10">
            <Ionicons name="people-outline" size={40} color="#CBD5E1" />
            <Text className="text-slate-400 mt-2">No children in this trip</Text>
          </View>
        }
      />
      <FaceScannerModal 
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['boarding-status', tripId] });
        }}
      />
    </View>
  );
}
