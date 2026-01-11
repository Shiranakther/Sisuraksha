import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions } from 'react-native';
// MapView removed from here
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import RouteMap from '../../components/RouteMap'; // Resolves to .web.tsx or .tsx

const { width, height } = Dimensions.get('window');

// IRI Road Quality Types
type IRILevel = 'good' | 'moderate' | 'poor';

interface RouteSegment {
  id: string;
  coordinates: { latitude: number; longitude: number }[];
  iriLevel: IRILevel;
  iriValue: number;
}

interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eta: string;
  studentsCount: number;
}

// Color mapping for IRI levels
const IRI_COLORS: Record<IRILevel, string> = {
  good: '#22C55E',     // Green - IRI < 2
  moderate: '#F59E0B', // Yellow - IRI 2-4
  poor: '#EF4444',     // Red - IRI > 4
};

// Mock route data with IRI segments
const MOCK_ROUTE_SEGMENTS: RouteSegment[] = [
  {
    id: '1',
    coordinates: [
      { latitude: 6.9271, longitude: 79.8612 },
      { latitude: 6.9290, longitude: 79.8630 },
    ],
    iriLevel: 'good',
    iriValue: 1.5,
  },
  {
    id: '2',
    coordinates: [
      { latitude: 6.9290, longitude: 79.8630 },
      { latitude: 6.9310, longitude: 79.8660 },
    ],
    iriLevel: 'moderate',
    iriValue: 3.2,
  },
  {
    id: '3',
    coordinates: [
      { latitude: 6.9310, longitude: 79.8660 },
      { latitude: 6.9340, longitude: 79.8680 },
    ],
    iriLevel: 'poor',
    iriValue: 5.8,
  },
  {
    id: '4',
    coordinates: [
      { latitude: 6.9340, longitude: 79.8680 },
      { latitude: 6.9370, longitude: 79.8700 },
    ],
    iriLevel: 'good',
    iriValue: 1.2,
  },
];

// Mock stops
const MOCK_STOPS: Stop[] = [
  { id: '1', name: 'Kollupitiya Junction', latitude: 6.9271, longitude: 79.8612, eta: '7:15 AM', studentsCount: 3 },
  { id: '2', name: 'Bambalapitiya Station', latitude: 6.9310, longitude: 79.8660, eta: '7:25 AM', studentsCount: 5 },
  { id: '3', name: 'Royal College', latitude: 6.9370, longitude: 79.8700, eta: '7:40 AM', studentsCount: 0 },
];

export default function NavigationScreen() {
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>(MOCK_ROUTE_SEGMENTS);
  const [stops, setStops] = useState<Stop[]>(MOCK_STOPS);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [tripStarted, setTripStarted] = useState(false);
  const [showLegend, setShowLegend] = useState(true);

  // Stats
  const [distance, setDistance] = useState('3.2 km');
  const [eta, setEta] = useState('25 mins');
  const [speed, setSpeed] = useState(0);

  // Get current location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          // On web this might fail silently or differently, handle gracefully
          console.log('Location permission denied');
          setIsLoading(false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        setSpeed(Math.round((location.coords.speed || 0) * 3.6)); // Convert m/s to km/h
      } catch (e) {
        console.log('Error getting location', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Watch location updates
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    if (tripStarted) {
      (async () => {
        try {
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10 },
            (location) => {
              setCurrentLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              });
              setSpeed(Math.round((location.coords.speed || 0) * 3.6));
            }
          );
        } catch (e) {
          console.log("Error watching position", e);
        }
      })();
    }

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [tripStarted]);

  // Pass a dummy function for centerOnLocation since we moved the button inside RouteMap
  // Or keep it here and pass it down if we wanted to control it from outside. 
  // For now, RouteMap handles the logic internally with the button.
  const centerOnLocation = useCallback(() => { }, []);

  const toggleTrip = () => {
    setTripStarted(!tripStarted);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-slate-100 items-center justify-center">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="text-slate-500 mt-4">Loading navigation...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-100">
      {/* Header */}
      <View className="bg-slate-900 pt-14 pb-4 px-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-white">Navigation</Text>
          <View className="flex-row items-center">
            <View className={`w-2 h-2 rounded-full mr-2 ${tripStarted ? 'bg-emerald-400' : 'bg-slate-400'}`} />
            <Text className="text-slate-400 text-sm">{tripStarted ? 'Active Trip' : 'Idle'}</Text>
          </View>
        </View>
      </View>

      {/* Map Container - Uses Platform Specific Component */}
      <RouteMap
        currentLocation={currentLocation}
        routeSegments={routeSegments}
        stops={stops}
        selectedStop={selectedStop}
        onStopPress={setSelectedStop}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        centerOnLocation={centerOnLocation}
        IRI_COLORS={IRI_COLORS}
      />

      {/* Bottom Panel */}
      <View className="bg-white rounded-t-3xl shadow-lg">
        {/* Stats Row */}
        <View className="flex-row px-6 py-4 border-b border-slate-100">
          <View className="flex-1 items-center">
            <Text className="text-xs text-slate-400 uppercase">Distance</Text>
            <Text className="text-lg font-bold text-slate-800">{distance}</Text>
          </View>
          <View className="flex-1 items-center border-l border-r border-slate-100">
            <Text className="text-xs text-slate-400 uppercase">ETA</Text>
            <Text className="text-lg font-bold text-slate-800">{eta}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-xs text-slate-400 uppercase">Speed</Text>
            <Text className="text-lg font-bold text-slate-800">{speed} km/h</Text>
          </View>
        </View>

        {/* Selected Stop Info */}
        {selectedStop && (
          <View className="px-6 py-3 bg-blue-50 border-b border-blue-100">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-bold text-slate-800">{selectedStop.name}</Text>
                <Text className="text-xs text-slate-500">ETA: {selectedStop.eta} • {selectedStop.studentsCount} students</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedStop(null)}>
                <Ionicons name="close-circle" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Upcoming Stops */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 py-3">
          {stops.map((stop) => (
            <TouchableOpacity
              key={stop.id}
              onPress={() => setSelectedStop(stop)}
              className={`mr-3 px-4 py-3 rounded-xl ${selectedStop?.id === stop.id ? 'bg-blue-500' : 'bg-slate-100'}`}
            >
              <Text className={`text-sm font-semibold ${selectedStop?.id === stop.id ? 'text-white' : 'text-slate-700'}`}>
                {stop.name.split(' ')[0]}
              </Text>
              <Text className={`text-xs ${selectedStop?.id === stop.id ? 'text-blue-100' : 'text-slate-400'}`}>
                {stop.eta}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Start/Stop Trip Button */}
        <View className="px-6 pb-8 pt-2">
          <TouchableOpacity
            onPress={toggleTrip}
            className={`py-4 rounded-xl flex-row items-center justify-center ${tripStarted ? 'bg-red-500' : 'bg-blue-500'}`}
          >
            <Ionicons name={tripStarted ? 'stop-circle' : 'play-circle'} size={24} color="white" />
            <Text className="text-white font-bold text-lg ml-2">
              {tripStarted ? 'End Trip' : 'Start Trip'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
