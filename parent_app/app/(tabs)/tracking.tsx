import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
// MapView removed
import { Ionicons } from '@expo/vector-icons';
import TrackingMap from '../../components/TrackingMap'; // Resolves to .web.tsx or .tsx

interface BusLocation {
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number; // degrees
  timestamp: string;
}

interface ParentStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  eta: string;
  studentsCount: number; // Added to match previous usage implicitly if needed, or removable
}

// Mock data - replace with API calls
const MOCK_BUS_LOCATION: BusLocation = {
  latitude: 6.9290,
  longitude: 79.8630,
  speed: 28,
  heading: 45,
  timestamp: new Date().toISOString(),
};

const MOCK_PARENT_STOP: ParentStop = {
  id: '1',
  name: 'Bambalapitiya Station',
  latitude: 6.9340,
  longitude: 79.8680,
  eta: '',  // ETA is calculated dynamically in the component
  studentsCount: 0,
};

const MOCK_ROUTE = [
  { latitude: 6.9271, longitude: 79.8612 },
  { latitude: 6.9290, longitude: 79.8630 },
  { latitude: 6.9310, longitude: 79.8660 },
  { latitude: 6.9340, longitude: 79.8680 },
];

export default function TrackingScreen() {
  const [busLocation, setBusLocation] = useState<BusLocation>(MOCK_BUS_LOCATION);
  const [parentStop] = useState<ParentStop>(MOCK_PARENT_STOP);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('Just now');
  const [isLive, setIsLive] = useState(true);

  // ETA calculation (mock)
  const [eta, setEta] = useState({ minutes: 8, arrivalTime: '' });
  const [distance, setDistance] = useState(1.2); // km

  // Calculate ETA based on distance and speed
  useEffect(() => {
    if (busLocation.speed > 0) {
      const timeMinutes = Math.round((distance / busLocation.speed) * 60);
      const arrivalDate = new Date();
      arrivalDate.setMinutes(arrivalDate.getMinutes() + timeMinutes);
      const arrivalTime = arrivalDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setEta({ minutes: timeMinutes, arrivalTime });
    }
  }, [busLocation.speed, distance]);

  // Simulate real-time updates
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      // Simulate bus movement towards stop
      setBusLocation(prev => ({
        ...prev,
        latitude: prev.latitude + (Math.random() * 0.001 - 0.0002),
        longitude: prev.longitude + (Math.random() * 0.001 - 0.0002),
        speed: Math.max(0, Math.min(45, prev.speed + (Math.random() * 10 - 5))),
        timestamp: new Date().toISOString(),
      }));

      // Update distance (decrease as bus approaches)
      setDistance(prev => Math.max(0.1, prev - 0.05));
      setLastUpdated('Just now');
    }, 3000);

    return () => clearInterval(interval);
  }, [isLive]);

  // Update "last updated" text
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.round((Date.now() - new Date(busLocation.timestamp).getTime()) / 1000);
      if (seconds < 10) {
        setLastUpdated('Just now');
      } else if (seconds < 60) {
        setLastUpdated(`${seconds}s ago`);
      } else {
        setLastUpdated(`${Math.round(seconds / 60)}m ago`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [busLocation.timestamp]);

  const centerOnBus = useCallback(() => {
    // Handled in TrackingMap
  }, []);

  const fitToRoute = useCallback(() => {
    // Handled in TrackingMap
  }, []);

  const toggleLive = () => {
    setIsLive(!isLive);
  };

  return (
    <View className="flex-1 bg-slate-100">
      {/* Header */}
      <View className="bg-blue-600 pt-14 pb-4 px-6">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-semibold text-white">Bus Tracker</Text>
            <Text className="text-blue-200 text-sm">Route #12 • Colombo Central</Text>
          </View>
          <TouchableOpacity
            onPress={toggleLive}
            className={`flex-row items-center px-3 py-1.5 rounded-full ${isLive ? 'bg-green-500' : 'bg-slate-500'}`}
          >
            <View className={`w-2 h-2 rounded-full mr-2 ${isLive ? 'bg-white' : 'bg-slate-300'}`} />
            <Text className="text-white text-xs font-bold">{isLive ? 'LIVE' : 'PAUSED'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ETA Banner */}
      <View className="bg-white mx-4 -mt-4 rounded-2xl shadow-lg p-4 z-10">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="bg-blue-100 p-3 rounded-xl mr-3">
              <Ionicons name="time" size={28} color="#2563EB" />
            </View>
            <View>
              <Text className="text-slate-400 text-xs uppercase">Arriving In</Text>
              <Text className="text-3xl font-bold text-slate-800">{eta.minutes} min</Text>
            </View>
          </View>
          <View className="items-end">
            <Text className="text-slate-400 text-xs">ETA</Text>
            <Text className="text-xl font-bold text-blue-600">{eta.arrivalTime}</Text>
          </View>
        </View>

        <View className="flex-row mt-3 pt-3 border-t border-slate-100">
          <View className="flex-1 flex-row items-center">
            <Ionicons name="navigate" size={16} color="#64748B" />
            <Text className="text-slate-600 text-sm ml-1">{distance.toFixed(1)} km away</Text>
          </View>
          <View className="flex-1 flex-row items-center justify-center">
            <Ionicons name="speedometer" size={16} color="#64748B" />
            <Text className="text-slate-600 text-sm ml-1">{Math.round(busLocation.speed)} km/h</Text>
          </View>
          <View className="flex-1 flex-row items-center justify-end">
            <Ionicons name="sync" size={16} color={isLive ? '#22C55E' : '#94A3B8'} />
            <Text className={`text-sm ml-1 ${isLive ? 'text-green-600' : 'text-slate-400'}`}>{lastUpdated}</Text>
          </View>
        </View>
      </View>

      {/* Map (Via Component) */}
      <View className="flex-1 mt-4">
        <TrackingMap
          busLocation={busLocation}
          parentStop={parentStop}
          routeCoordinates={MOCK_ROUTE}
          centerOnBus={centerOnBus} // Pass dummy or real if we hook it up later
          fitToRoute={fitToRoute}
        />
      </View>

      {/* Bottom Info Card */}
      <View className="bg-white rounded-t-3xl shadow-lg px-6 py-5">
        <View className="flex-row items-center mb-3">
          <View className="bg-green-100 p-2 rounded-full mr-3">
            <Ionicons name="flag" size={20} color="#22C55E" />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-slate-400 uppercase">Your Stop</Text>
            <Text className="text-lg font-bold text-slate-800">{parentStop.name}</Text>
          </View>
          <View className="bg-blue-50 px-3 py-2 rounded-xl">
            <Text className="text-blue-600 font-bold">{eta.minutes} min</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => {/* Navigate to attendance */ }}
            className="flex-1 flex-row items-center justify-center bg-slate-100 py-3 rounded-xl"
          >
            <Ionicons name="list" size={18} color="#64748B" />
            <Text className="text-slate-700 font-semibold ml-2">View Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {/* Call driver */ }}
            className="flex-row items-center justify-center bg-blue-500 px-5 py-3 rounded-xl"
          >
            <Ionicons name="call" size={18} color="white" />
            <Text className="text-white font-semibold ml-2">Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
