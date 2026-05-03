import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  useMyChildren,
  useSetAttendanceSchedule,
  useGetAttendanceSchedule,
  useGetHolidays,
} from '../hooks/useApi';

// --- Utilities ---
const generateDateRange = () => {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
};

const formatDate = (d: Date) => d.toISOString().split('T')[0];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ChildScheduleState {
  child_id: string;
  child_name: string;
  is_present: boolean;
  schedule_type: 'BOTH' | 'MORNING' | 'AFTERNOON';
  pickup_lat?: number;
  pickup_lon?: number;
  pickup_address?: string;
  dropoff_lat?: number;
  dropoff_lon?: number;
  dropoff_address?: string;
}

export default function AttendanceSetupScreen() {
  const insets = useSafeAreaInsets();
  const dateRange = generateDateRange();
  const [selectedDate, setSelectedDate] = useState<Date>(dateRange[0]);
  const [schedules, setSchedules] = useState<Record<string, ChildScheduleState>>({});
  const [showPickupMap, setShowPickupMap] = useState<string | null>(null);
  const [showDropoffMap, setShowDropoffMap] = useState<string | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 6.9271,
    longitude: 79.8612,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const { data: children, isLoading: loadingChildren } = useMyChildren();
  const selectedDateStr = formatDate(selectedDate);
  const { data: existingSchedules, isLoading: loadingExisting } = useGetAttendanceSchedule(
    (children as any[])?.[0]?.id ?? null,
    selectedDateStr,
    selectedDateStr
  );
  const { data: holidays } = useGetHolidays();
  const saveMutation = useSetAttendanceSchedule();

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const holidayDates = new Set((holidays || []).map((h: any) => h.holiday_date?.split('T')[0]));
  const isHoliday = (d: Date) => holidayDates.has(formatDate(d));

  // Merge existing schedules from API into local state when date changes
  useEffect(() => {
    if (!children) return;
    const newState: Record<string, ChildScheduleState> = {};
    (children as any[]).forEach((child: any) => {
      const existing = (existingSchedules || []).find((s: any) => s.child_id === child.id);
      if (existing) {
        newState[child.id] = {
          child_id: child.id,
          child_name: child.child_name,
          is_present: existing.is_present,
          schedule_type: existing.schedule_type || 'BOTH',
          pickup_lat: existing.pickup_lat ? parseFloat(existing.pickup_lat) : undefined,
          pickup_lon: existing.pickup_lon ? parseFloat(existing.pickup_lon) : undefined,
          pickup_address: existing.pickup_address,
          dropoff_lat: existing.dropoff_lat ? parseFloat(existing.dropoff_lat) : undefined,
          dropoff_lon: existing.dropoff_lon ? parseFloat(existing.dropoff_lon) : undefined,
          dropoff_address: existing.dropoff_address,
        };
      } else {
        newState[child.id] = {
          child_id: child.id,
          child_name: child.child_name,
          is_present: true,
          schedule_type: 'BOTH',
        };
      }
    });
    setSchedules(newState);
  }, [children, existingSchedules, selectedDateStr]);

  const updateSchedule = (childId: string, updates: Partial<ChildScheduleState>) => {
    setSchedules(prev => ({ ...prev, [childId]: { ...prev[childId], ...updates } }));
  };

  const getCurrentLocation = async (childId: string, type: 'pickup' | 'dropoff') => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission denied', 'Allow location access.'); return; }
    const loc = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = loc.coords;
    const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
    const addr = geocode[0];
    const address = `${addr.street || ''}, ${addr.city || addr.subregion || ''}`.trim();
    if (type === 'pickup') {
      updateSchedule(childId, { pickup_lat: latitude, pickup_lon: longitude, pickup_address: address });
    } else {
      updateSchedule(childId, { dropoff_lat: latitude, dropoff_lon: longitude, dropoff_address: address });
    }
    setMapRegion(prev => ({ ...prev, latitude, longitude }));
  };

  const handleSave = async () => {
    const childEntries = Object.values(schedules);
    if (childEntries.length === 0) return;

    // Save each child's schedule individually
    try {
      for (const s of childEntries) {
        await saveMutation.mutateAsync({
          childId: s.child_id,
          schedules: [{
            date: selectedDateStr,
            isPresent: s.is_present,
            scheduleType: s.schedule_type,
            pickupLat: s.pickup_lat,
            pickupLon: s.pickup_lon,
            pickupAddress: s.pickup_address,
            dropoffLat: s.dropoff_lat,
            dropoffLon: s.dropoff_lon,
            dropoffAddress: s.dropoff_address,
          }],
        });
      }
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save some schedules. Please try again.');
    }
  };

  // Map picker modal
  const renderMapPicker = (childId: string, type: 'pickup' | 'dropoff') => {
    const s = schedules[childId];
    const lat = type === 'pickup' ? s?.pickup_lat : s?.dropoff_lat;
    const lon = type === 'pickup' ? s?.pickup_lon : s?.dropoff_lon;
    return (
      <View className="absolute inset-0 bg-white z-50" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-4 py-3 border-b border-slate-200 bg-white">
          <TouchableOpacity onPress={() => { setShowPickupMap(null); setShowDropoffMap(null); }} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#334155" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-slate-800">
            Set {type === 'pickup' ? 'Pickup' : 'Drop-off'} Location
          </Text>
        </View>
        <Text className="text-center text-slate-500 text-sm py-2 bg-blue-50">
          Tap on the map to set location
        </Text>
        <MapView
          style={{ flex: 1 }}
          region={mapRegion}
          onPress={(e) => {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            Location.reverseGeocodeAsync({ latitude, longitude }).then(geocode => {
              const addr2 = geocode[0];
              const address = `${addr2.street || ''}, ${addr2.city || addr2.subregion || ''}`.trim();
              if (type === 'pickup') {
                updateSchedule(childId, { pickup_lat: latitude, pickup_lon: longitude, pickup_address: address });
              } else {
                updateSchedule(childId, { dropoff_lat: latitude, dropoff_lon: longitude, dropoff_address: address });
              }
            });
          }}
        >
          <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false} />
          {lat && lon && (
            <Marker coordinate={{ latitude: lat, longitude: lon }} pinColor={type === 'pickup' ? '#2563EB' : '#DC2626'} />
          )}
        </MapView>
        <TouchableOpacity
          onPress={() => getCurrentLocation(childId, type)}
          className="m-4 bg-blue-600 p-4 rounded-xl items-center flex-row justify-center"
        >
          <Ionicons name="locate" size={20} color="white" />
          <Text className="text-white font-bold ml-2">Use Current Location</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setShowPickupMap(null); setShowDropoffMap(null); }}
          className="mx-4 mb-4 bg-slate-800 p-4 rounded-xl items-center"
        >
          <Text className="text-white font-bold">Confirm Location</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (showPickupMap) return renderMapPicker(showPickupMap, 'pickup');
  if (showDropoffMap) return renderMapPicker(showDropoffMap, 'dropoff');

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center px-4 py-4 bg-white border-b border-slate-200 shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Set Daily Attendance</Text>
          <Text className="text-slate-500 text-sm">Schedule must be set 1 day before</Text>
        </View>
      </View>

      {/* Date Strip */}
      <View className="bg-white border-b border-slate-200 pb-3 pt-2">
        <Text className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Date (Tomorrow onwards)
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3">
          {dateRange.map((date, idx) => {
            const isSelected = formatDate(date) === selectedDateStr;
            const weekend = isWeekend(date);
            const holiday = isHoliday(date);
              return (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    if (weekend) {
                      Alert.alert('Weekend', 'Attendance cannot be scheduled for weekends.');
                      return;
                    }
                    setSelectedDate(date);
                  }}
                  className={`mx-1 w-16 py-2 rounded-xl items-center border ${
                    isSelected ? 'bg-blue-600 border-blue-600'
                      : weekend ? 'bg-slate-50 border-slate-100 opacity-40'
                      : holiday ? 'bg-red-50 border-red-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${
                    isSelected ? 'text-white' : weekend ? 'text-slate-400' : holiday ? 'text-red-500' : 'text-slate-500'
                  }`}>
                    {DAY_NAMES[date.getDay()]}
                  </Text>
                  <Text className={`text-lg font-bold mt-1 ${isSelected ? 'text-white' : weekend ? 'text-slate-300' : 'text-slate-800'}`}>
                    {date.getDate()}
                  </Text>
                  <Text className={`text-xs ${isSelected ? 'text-blue-200' : 'text-slate-300'}`}>
                    {MONTH_NAMES[date.getMonth()]}
                  </Text>
                  {holiday && !isSelected && (
                    <View className="w-1.5 h-1.5 bg-red-400 rounded-full mt-0.5" />
                  )}
                </TouchableOpacity>
              );
          })}
        </ScrollView>
        <View className="flex-row px-4 mt-2 gap-4">
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-orange-200 rounded mr-1" />
            <Text className="text-xs text-slate-500">Weekend</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-red-200 rounded mr-1" />
            <Text className="text-xs text-slate-500">Holiday</Text>
          </View>
        </View>
      </View>

      {/* Children List */}
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 120 }}>

        {(isWeekend(selectedDate) || isHoliday(selectedDate)) && (
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex-row items-start">
            <Ionicons name="information-circle" size={20} color="#D97706" />
            <Text className="text-amber-700 text-sm ml-2 flex-1">
              {isHoliday(selectedDate)
                ? 'This is a holiday. You can still set attendance if school is open.'
                : 'This is a weekend. School is typically closed.'}
            </Text>
          </View>
        )}

        {loadingChildren || loadingExisting ? (
          <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
        ) : !children || (children as any[]).length === 0 ? (
          <View className="items-center mt-20">
            <Ionicons name="person-add" size={48} color="#CBD5E1" />
            <Text className="text-slate-500 mt-4 text-center">No children registered yet.</Text>
          </View>
        ) : (
          (children as any[]).map((child: any) => {
            const s = schedules[child.id];
            if (!s) return null;
            return (
              <View key={child.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 overflow-hidden">

                {/* Child Header */}
                <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
                  <View className="flex-row items-center">
                    <View className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${s.is_present ? 'bg-blue-100' : 'bg-red-100'}`}>
                      <Ionicons name="person" size={18} color={s.is_present ? '#2563EB' : '#EF4444'} />
                    </View>
                    <View>
                      <Text className="text-slate-800 font-bold text-base">{child.child_name}</Text>
                      <Text className="text-slate-400 text-xs">{child.grade || 'No grade set'}</Text>
                    </View>
                  </View>
                </View>

                {/* Present / Absent Toggle */}
                <View className="px-4 py-3 border-b border-slate-100">
                  <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Attendance</Text>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => updateSchedule(child.id, { is_present: true })}
                      className={`flex-1 py-2.5 rounded-lg items-center border ${
                        s.is_present ? 'bg-emerald-600 border-emerald-600' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text className={`text-sm font-semibold ${s.is_present ? 'text-white' : 'text-slate-600'}`}>
                        ✅ Present
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateSchedule(child.id, { is_present: false })}
                      className={`flex-1 py-2.5 rounded-lg items-center border ${
                        !s.is_present ? 'bg-red-500 border-red-500' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text className={`text-sm font-semibold ${!s.is_present ? 'text-white' : 'text-slate-600'}`}>
                        ❌ Absent
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Schedule Type */}
                {s.is_present && (
                  <View className="px-4 py-3 border-b border-slate-100">
                    <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Schedule Type</Text>
                    <View className="flex-row gap-2">
                      {(['MORNING', 'AFTERNOON', 'BOTH'] as const).map(type => (
                        <TouchableOpacity
                          key={type}
                          onPress={() => updateSchedule(child.id, { schedule_type: type })}
                          className={`flex-1 py-2 rounded-lg items-center border ${
                            s.schedule_type === type ? 'bg-blue-600 border-blue-600' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <Text className={`text-xs font-semibold ${s.schedule_type === type ? 'text-white' : 'text-slate-600'}`}>
                            {type === 'MORNING' ? '🌅 Morning' : type === 'AFTERNOON' ? '🌇 Afternoon' : '☀️ Both'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Location Pins */}
                {s.is_present && (
                  <View className="px-4 py-3">
                    <TouchableOpacity
                      onPress={() => setShowPickupMap(child.id)}
                      className="flex-row items-center py-2 border-b border-slate-100"
                    >
                      <Ionicons name="location" size={20} color="#2563EB" />
                      <View className="flex-1 ml-3">
                        <Text className="text-xs font-semibold text-slate-500">Pickup Location</Text>
                        <Text className="text-sm text-slate-700" numberOfLines={1}>
                          {s.pickup_address || 'Tap to set pickup location'}
                        </Text>
                      </View>
                      <Ionicons name="map" size={18} color="#94A3B8" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowDropoffMap(child.id)}
                      className="flex-row items-center py-2 mt-1"
                    >
                      <Ionicons name="flag" size={20} color="#DC2626" />
                      <View className="flex-1 ml-3">
                        <Text className="text-xs font-semibold text-slate-500">Drop-off Location</Text>
                        <Text className="text-sm text-slate-700" numberOfLines={1}>
                          {s.dropoff_address || 'Tap to set drop-off location'}
                        </Text>
                      </View>
                      <Ionicons name="map" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                )}

                {!s.is_present && (
                  <View className="px-4 py-3 items-center">
                    <Text className="text-slate-400 text-sm">Child marked absent for this day</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Save Button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-white border-t border-slate-200">
        <TouchableOpacity
          onPress={handleSave}
          disabled={saveMutation.isPending || loadingChildren}
          className={`w-full py-4 rounded-2xl items-center ${saveMutation.isPending ? 'bg-blue-300' : 'bg-blue-600'}`}
          activeOpacity={0.8}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">
              Save for {DAY_NAMES[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_NAMES[selectedDate.getMonth()]}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
