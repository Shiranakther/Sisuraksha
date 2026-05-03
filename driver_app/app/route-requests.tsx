import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTripRequests } from '../hooks/useApi';

const formatToday = () => {
  const today = new Date();
  return today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

export default function RouteRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isFetching } = useTripRequests();

  const requests: any[] = data?.data || [];

  const present = requests.filter(r => r.status === 'present');
  const absent = requests.filter(r => r.status === 'absent');
  const noDeclaration = requests.filter(r => r.status === 'no_declaration');

  const renderChild = (child: any, tintClass: string, iconColor: string) => (
    <View key={child.child_id} className={`mx-4 mb-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden`}>
      <View className={`absolute left-0 top-0 bottom-0 w-1 ${tintClass}`} />
      <View className="pl-4 pr-3 py-3 flex-row items-center">
        <View className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center mr-3">
          <Ionicons name="person" size={18} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-slate-800">{child.child_name}</Text>
          <Text className="text-xs text-slate-500">{child.grade || 'No grade'}</Text>
          {child.pickup_address && (
            <View className="flex-row items-center mt-1">
              <Ionicons name="location-outline" size={12} color="#94A3B8" />
              <Text className="text-xs text-slate-400 ml-1 flex-1" numberOfLines={1}>{child.pickup_address}</Text>
            </View>
          )}
        </View>
        {child.schedule_type && (
          <View className={`px-2 py-1 rounded-lg ${tintClass.replace('bg-', 'bg-').replace('500', '100').replace('400', '100').replace('300', '100')}`}>
            <Text className="text-xs font-semibold" style={{ color: iconColor }}>
              {child.schedule_type === 'MORNING_ONLY' ? 'Morning' : child.schedule_type === 'EVENING_ONLY' ? 'Evening' : 'Both'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center px-4 py-4 bg-white border-b border-slate-200 shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Route Management</Text>
          <Text className="text-slate-500 text-sm">{formatToday()}</Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          className="p-2 bg-slate-100 rounded-xl"
          disabled={isFetching}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color="#334155" />
          ) : (
            <Ionicons name="refresh" size={20} color="#334155" />
          )}
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View className="flex-row mx-4 my-3 gap-3">
        {[
          { label: 'Present', count: present.length, bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
          { label: 'Absent', count: absent.length, bg: 'bg-red-50 border-red-100', text: 'text-red-700' },
          { label: 'No Info', count: noDeclaration.length, bg: 'bg-amber-50 border-amber-100', text: 'text-amber-700' },
        ].map(item => (
          <View key={item.label} className={`flex-1 rounded-xl border ${item.bg} p-3 items-center`}>
            <Text className={`text-2xl font-bold ${item.text}`}>{item.count}</Text>
            <Text className={`text-xs font-semibold ${item.text} mt-0.5`}>{item.label}</Text>
          </View>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[]} // We render sections manually in header
          keyExtractor={() => 'dummy'}
          renderItem={null}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#2563EB" />
          }
          ListHeaderComponent={() => (
            <>
              {/* Present Section */}
              {present.length > 0 && (
                <View className="mb-4">
                  <View className="flex-row items-center px-4 mb-2">
                    <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                    <Text className="text-sm font-bold text-emerald-700 ml-2 uppercase tracking-wider">
                      Present — {present.length}
                    </Text>
                  </View>
                  {present.map(c => renderChild(c, 'bg-emerald-500', '#10B981'))}
                </View>
              )}

              {/* Absent Section */}
              {absent.length > 0 && (
                <View className="mb-4">
                  <View className="flex-row items-center px-4 mb-2">
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                    <Text className="text-sm font-bold text-red-600 ml-2 uppercase tracking-wider">
                      Absent — {absent.length}
                    </Text>
                  </View>
                  {absent.map(c => renderChild(c, 'bg-red-400', '#EF4444'))}
                </View>
              )}

              {/* No Declaration Section */}
              {noDeclaration.length > 0 && (
                <View className="mb-8">
                  <View className="flex-row items-center px-4 mb-2">
                    <Ionicons name="help-circle" size={18} color="#F59E0B" />
                    <Text className="text-sm font-bold text-amber-600 ml-2 uppercase tracking-wider">
                      No Declaration — {noDeclaration.length}
                    </Text>
                  </View>
                  <View className="mx-4 mb-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex-row items-center">
                    <Ionicons name="information-circle" size={16} color="#D97706" />
                    <Text className="text-amber-700 text-xs ml-2 flex-1">
                      These children have not set attendance for today.
                    </Text>
                  </View>
                  {noDeclaration.map(c => renderChild(c, 'bg-amber-300', '#F59E0B'))}
                </View>
              )}

              {requests.length === 0 && (
                <View className="items-center mt-20 px-8">
                  <Ionicons name="bus-outline" size={56} color="#CBD5E1" />
                  <Text className="text-slate-500 mt-4 text-center text-base font-semibold">No Data Available</Text>
                  <Text className="text-slate-400 text-sm mt-1 text-center">
                    No children are registered for your route, or parents haven't set attendance yet.
                  </Text>
                </View>
              )}
            </>
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      {/* View Trip Data CTA */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-white border-t border-slate-200">
        <TouchableOpacity
          onPress={() => router.push('/route-today')}
          className="w-full bg-emerald-600 py-4 rounded-2xl items-center flex-row justify-center"
          activeOpacity={0.8}
        >
          <Ionicons name="navigate" size={20} color="white" />
          <Text className="text-white font-bold text-base ml-2">View Today's Trip Data</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
