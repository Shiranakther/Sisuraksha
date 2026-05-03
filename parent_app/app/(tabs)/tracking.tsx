import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackingMap from '../../components/TrackingMap';
import { useLiveTracking } from '../../hooks/useApi';
import { router } from 'expo-router';

// Helper to calculate distance in km
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function TrackingScreen() {
  const { data: liveData, isLoading, error } = useLiveTracking();
  const [lastUpdatedText, setLastUpdatedText] = useState('Just now');

  // Derived data
  const busLocation = liveData?.busLocation;
  const parentStop = liveData?.parentStop;
  const driver = liveData?.driver;

  const distance = useMemo(() => {
    if (!busLocation || !parentStop) return 0;
    return getDistance(
      busLocation.latitude, busLocation.longitude,
      parentStop.latitude, parentStop.longitude
    );
  }, [busLocation, parentStop]);

  const etaMinutes = useMemo(() => {
    if (!busLocation || distance === 0) return 0;
    const speed = busLocation.speed > 5 ? busLocation.speed : 25; // fallback to 25km/h if stopped
    return Math.max(1, Math.round((distance / speed) * 60));
  }, [distance, busLocation?.speed]);

  const arrivalTime = useMemo(() => {
    if (etaMinutes === 0) return '--:--';
    const d = new Date();
    d.setMinutes(d.getMinutes() + etaMinutes);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [etaMinutes]);

  useEffect(() => {
    if (!busLocation?.lastUpdated) return;
    const interval = setInterval(() => {
      const diff = Math.round((Date.now() - new Date(busLocation.lastUpdated).getTime()) / 1000);
      if (diff < 10) setLastUpdatedText('Just now');
      else if (diff < 60) setLastUpdatedText(`${diff}s ago`);
      else setLastUpdatedText(`${Math.round(diff/60)}m ago`);
    }, 1000);
    return () => clearInterval(interval);
  }, [busLocation?.lastUpdated]);

  if (isLoading && !liveData) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
        <Text className="mt-4 text-slate-500 font-medium">Connecting to bus GPS...</Text>
      </View>
    );
  }

  if (!liveData) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-10">
        <View className="bg-white p-8 rounded-3xl shadow-sm items-center border border-slate-100">
          <View className="bg-slate-100 p-4 rounded-full mb-4">
            <Ionicons name="bus-outline" size={48} color="#94A3B8" />
          </View>
          <Text className="text-xl font-bold text-slate-800 text-center">No Active Trip</Text>
          <Text className="text-slate-400 text-center mt-2 leading-5">
            There is no live bus trip for your child at the moment. Tracking will start automatically when the driver begins the route.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-100">
      {/* Header */}
      <View className="bg-blue-600 pt-14 pb-4 px-6 shadow-md">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-bold text-white">Live Tracking</Text>
            <Text className="text-blue-100 text-xs font-medium opacity-90">
              {driver?.vehicleNumber || 'Bus'} • {driver?.name || 'Driver'}
            </Text>
          </View>
          <View className="bg-emerald-500 flex-row items-center px-3 py-1.5 rounded-full shadow-sm">
            <View className="w-1.5 h-1.5 rounded-full bg-white mr-2 animate-pulse" />
            <Text className="text-white text-[10px] font-black uppercase tracking-tighter">Live</Text>
          </View>
        </View>
      </View>

      {/* ETA Banner */}
      <View className="bg-white mx-4 -mt-4 rounded-2xl shadow-xl p-5 z-10 border border-slate-50">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="bg-blue-50 p-3 rounded-2xl mr-4 border border-blue-100">
              <Ionicons name="time" size={32} color="#2563EB" />
            </View>
            <View>
              <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Arriving In</Text>
              <View className="flex-row items-baseline">
                <Text className="text-4xl font-black text-slate-900">{etaMinutes}</Text>
                <Text className="text-lg font-bold text-slate-900 ml-1">min</Text>
              </View>
            </View>
          </View>
          <View className="items-end bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">ETA</Text>
            <Text className="text-xl font-black text-blue-600">{arrivalTime}</Text>
          </View>
        </View>

        <View className="flex-row mt-5 pt-4 border-t border-slate-50 gap-2">
          <View className="flex-1 bg-slate-50/50 py-2 rounded-xl items-center border border-slate-50">
            <Ionicons name="navigate" size={14} color="#64748B" />
            <Text className="text-slate-900 text-xs font-bold mt-1">{distance.toFixed(1)} km</Text>
            <Text className="text-[9px] text-slate-400 uppercase font-bold">Away</Text>
          </View>
          <View className="flex-1 bg-slate-50/50 py-2 rounded-xl items-center border border-slate-50">
            <Ionicons name="speedometer" size={14} color="#64748B" />
            <Text className="text-slate-900 text-xs font-bold mt-1">{Math.round(busLocation?.speed || 0)} km/h</Text>
            <Text className="text-[9px] text-slate-400 uppercase font-bold">Speed</Text>
          </View>
          <View className="flex-1 bg-slate-50/50 py-2 rounded-xl items-center border border-slate-50">
            <Ionicons name="sync" size={14} color="#22C55E" />
            <Text className="text-emerald-600 text-xs font-bold mt-1">{lastUpdatedText}</Text>
            <Text className="text-[9px] text-slate-400 uppercase font-bold">Updated</Text>
          </View>
        </View>
      </View>

      {/* Map */}
      <View className="flex-1 mt-4 rounded-t-3xl overflow-hidden shadow-inner bg-slate-200">
        <TrackingMap
          busLocation={busLocation}
          parentStop={parentStop}
          routeCoordinates={[]} // Can be fetched if route_polyline is available
          centerOnBus={() => {}}
          fitToRoute={() => {}}
        />
      </View>

      {/* Footer Info */}
      <View className="bg-white px-6 pt-5 pb-8 shadow-2xl border-t border-slate-50">
        <View className="flex-row items-center mb-5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <View className="bg-emerald-100 p-2.5 rounded-xl mr-4 shadow-sm">
            <Ionicons name="location" size={22} color="#059669" />
          </View>
          <View className="flex-1">
            <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pickup Point</Text>
            <Text className="text-base font-bold text-slate-800" numberOfLines={1}>{parentStop?.name || 'Your Stop'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => router.push('/attendance-history')}
            className="flex-1 flex-row items-center justify-center bg-slate-100 py-4 rounded-2xl"
          >
            <Ionicons name="list" size={20} color="#475569" />
            <Text className="text-slate-700 font-bold ml-2">History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (driver?.name) Alert.alert('Call Driver', `Do you want to call ${driver.name}?`, [{ text: 'Cancel' }, { text: 'Call', onPress: () => Linking.openURL('tel:123456789') }]);
            }}
            className="flex-1 flex-row items-center justify-center bg-blue-600 py-4 rounded-2xl shadow-lg shadow-blue-200"
          >
            <Ionicons name="call" size={20} color="white" />
            <Text className="text-white font-bold ml-2">Contact</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
