import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useTripHistory } from '../../hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TripHistoryScreen() {
  const { data: trips, isLoading } = useTripHistory();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-slate-50">
      <View 
        className="px-6 pb-4 bg-white shadow-sm border-b border-slate-100 z-10"
        style={{ paddingTop: Math.max(insets.top, 20) + 16 }}
      >
        <Text className="text-2xl font-bold text-slate-800">Trip History</Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-6">
        {isLoading ? (
          <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
        ) : !trips || trips.length === 0 ? (
          <View className="items-center mt-20">
            <Ionicons name="bus-outline" size={64} color="#CBD5E1" />
            <Text className="text-slate-500 mt-4 text-lg">No past trips found.</Text>
          </View>
        ) : (
          trips.map((trip: any, idx: number) => {
            const startTime = new Date(trip.started_at);
            const endTime = trip.ended_at ? new Date(trip.ended_at) : null;
            
            return (
              <View key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-slate-800 font-bold text-lg">
                    {startTime.toLocaleDateString()} - <Text className="capitalize text-indigo-600">{trip.type}</Text>
                  </Text>
                  <View className={`px-3 py-1 rounded-full ${trip.status === 'completed' ? 'bg-green-100' : 'bg-orange-100'}`}>
                    <Text className={`text-xs font-bold ${trip.status === 'completed' ? 'text-green-700' : 'text-orange-700'}`}>
                      {trip.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                
                <View className="bg-slate-50 p-3 rounded-xl mb-3">
                  <View className="flex-row items-center mb-2">
                    <Ionicons name="location" size={16} color="#10B981" />
                    <Text className="text-slate-600 ml-2 font-medium">Start: {startTime.toLocaleTimeString()}</Text>
                  </View>
                  <Text className="text-slate-400 text-xs ml-6 mb-2">
                    Lat: {trip.start_lat?.toFixed(4)}, Lon: {trip.start_lon?.toFixed(4)}
                  </Text>

                  {endTime && (
                    <>
                      <View className="flex-row items-center">
                        <Ionicons name="location" size={16} color="#EF4444" />
                        <Text className="text-slate-600 ml-2 font-medium">End: {endTime.toLocaleTimeString()}</Text>
                      </View>
                      <Text className="text-slate-400 text-xs ml-6">
                        Lat: {trip.end_lat?.toFixed(4)}, Lon: {trip.end_lon?.toFixed(4)}
                      </Text>
                    </>
                  )}
                </View>

              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
