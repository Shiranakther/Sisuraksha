import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyChildren, useGetAttendanceHistory } from '../hooks/useApi';

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  no_declaration: 'bg-amber-400',
};

const SCHEDULE_LABEL: Record<string, string> = {
  BOTH: 'Both Ways',
  MORNING_ONLY: 'Morning Only',
  EVENING_ONLY: 'Evening Only',
  ABSENT: 'Absent',
};

type TabFilter = 'ALL' | 'PAST' | 'TODAY' | 'UPCOMING';

const getDateCategory = (dateStr: string): TabFilter => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'TODAY';
  if (d < today) return 'PAST';
  return 'UPCOMING';
};

const formatDisplayDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function AttendanceHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [selectedChild, setSelectedChild] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabFilter>('ALL');

  const { data: children, isLoading: loadingChildren } = useMyChildren();
  const { data: history, isLoading: loadingHistory } = useGetAttendanceHistory(selectedChild);

  const records: any[] = history || [];

  const filtered = records.filter(r => {
    if (activeTab === 'ALL') return true;
    return getDateCategory(r.schedule_date) === activeTab;
  });

  const renderRecord = ({ item }: { item: any }) => {
    const category = getDateCategory(item.schedule_date);
    const isPresent = item.is_present;
    const source = item.source || 'schedule';
    return (
      <View className="bg-white rounded-2xl border border-slate-100 shadow-sm mx-4 mb-3 overflow-hidden">
        <View className={`w-1.5 absolute left-0 top-0 bottom-0 rounded-l-2xl ${isPresent ? 'bg-emerald-500' : 'bg-red-400'}`} />
        <View className="pl-5 pr-4 py-3">
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className="font-bold text-slate-800 text-base">{formatDisplayDate(item.schedule_date)}</Text>
              {item.child_name && (
                <Text className="text-slate-500 text-sm mt-0.5">{item.child_name}</Text>
              )}
            </View>
            <View className="flex-row items-center gap-2">
              {/* Category badge */}
              <View className={`px-2 py-0.5 rounded-full ${
                category === 'TODAY' ? 'bg-blue-100' : category === 'PAST' ? 'bg-slate-100' : 'bg-amber-100'
              }`}>
                <Text className={`text-xs font-semibold ${
                  category === 'TODAY' ? 'text-blue-700' : category === 'PAST' ? 'text-slate-600' : 'text-amber-700'
                }`}>
                  {category === 'TODAY' ? 'Today' : category === 'PAST' ? 'Past' : 'Upcoming'}
                </Text>
              </View>
              {/* Present/Absent badge */}
              <View className={`px-2 py-0.5 rounded-full ${isPresent ? 'bg-emerald-100' : 'bg-red-100'}`}>
                <Text className={`text-xs font-semibold ${isPresent ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isPresent ? 'Present' : 'Absent'}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-row items-center mt-2 gap-4">
            {item.schedule_type && (
              <View className="flex-row items-center">
                <Ionicons name="calendar-outline" size={14} color="#94A3B8" />
                <Text className="text-xs text-slate-500 ml-1">{SCHEDULE_LABEL[item.schedule_type] || item.schedule_type}</Text>
              </View>
            )}
            <View className="flex-row items-center">
              <Ionicons name={source === 'actual' ? 'checkmark-circle' : 'create-outline'} size={14} color={source === 'actual' ? '#10B981' : '#94A3B8'} />
              <Text className="text-xs text-slate-500 ml-1">{source === 'actual' ? 'RFID Verified' : 'Scheduled'}</Text>
            </View>
          </View>

          {(item.pickup_address || item.dropoff_address) && (
            <View className="mt-2 pt-2 border-t border-slate-100">
              {item.pickup_address && (
                <View className="flex-row items-center mb-1">
                  <Ionicons name="location" size={13} color="#2563EB" />
                  <Text className="text-xs text-slate-500 ml-1 flex-1" numberOfLines={1}>Pickup: {item.pickup_address}</Text>
                </View>
              )}
              {item.dropoff_address && (
                <View className="flex-row items-center">
                  <Ionicons name="flag" size={13} color="#DC2626" />
                  <Text className="text-xs text-slate-500 ml-1 flex-1" numberOfLines={1}>Drop-off: {item.dropoff_address}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  const tabCounts = {
    ALL: records.length,
    PAST: records.filter(r => getDateCategory(r.schedule_date) === 'PAST').length,
    TODAY: records.filter(r => getDateCategory(r.schedule_date) === 'TODAY').length,
    UPCOMING: records.filter(r => getDateCategory(r.schedule_date) === 'UPCOMING').length,
  };

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center px-4 py-4 bg-white border-b border-slate-200 shadow-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Attendance History</Text>
          <Text className="text-slate-500 text-sm">Scheduled & actual attendance records</Text>
        </View>
      </View>

      {/* Child filter chips */}
      <View className="bg-white border-b border-slate-200 pb-3 pt-3">
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 12,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => setSelectedChild(undefined)}
            className={`py-1.5 px-3 rounded-full border ${!selectedChild ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}
          >
            <Text className={`text-sm font-semibold ${!selectedChild ? 'text-white' : 'text-slate-600'}`}>
              All Children
            </Text>
          </TouchableOpacity>
          {!loadingChildren && (children as any[] || []).map((child: any) => (
            <TouchableOpacity
              key={child.id}
              onPress={() => setSelectedChild(child.id)}
              className={`py-1.5 px-3 rounded-full border ${selectedChild === child.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}
            >
              <Text className={`text-sm font-semibold ${selectedChild === child.id ? 'text-white' : 'text-slate-600'}`}>
                {child.child_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab filter */}
      <View className="flex-row bg-white border-b border-slate-200 px-1">
        {(['ALL', 'TODAY', 'UPCOMING', 'PAST'] as TabFilter[]).map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 items-center border-b-2 ${activeTab === tab ? 'border-blue-600' : 'border-transparent'}`}
          >
            <Text className={`text-xs font-bold ${activeTab === tab ? 'text-blue-600' : 'text-slate-500'}`}>
              {tab}
            </Text>
            <View className={`px-1.5 py-0.5 rounded-full mt-0.5 ${activeTab === tab ? 'bg-blue-100' : 'bg-slate-100'}`}>
              <Text className={`text-xs font-semibold ${activeTab === tab ? 'text-blue-700' : 'text-slate-500'}`}>
                {tabCounts[tab]}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary row */}
      <View className="flex-row mx-4 my-3 gap-3">
        {[
          { label: 'Present', count: records.filter(r => r.is_present).length, color: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700' },
          { label: 'Absent', count: records.filter(r => !r.is_present).length, color: 'bg-red-50 border-red-100', text: 'text-red-700' },
          { label: 'Total', count: records.length, color: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
        ].map(item => (
          <View key={item.label} className={`flex-1 rounded-xl border ${item.color} p-3 items-center`}>
            <Text className={`text-xl font-bold ${item.text}`}>{item.count}</Text>
            <Text className={`text-xs font-semibold ${item.text} mt-0.5`}>{item.label}</Text>
          </View>
        ))}
      </View>

      {loadingHistory || loadingChildren ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Ionicons name="calendar-outline" size={56} color="#CBD5E1" />
          <Text className="text-slate-500 mt-4 text-center text-base">No records found</Text>
          <Text className="text-slate-400 text-sm mt-1 text-center px-8">
            Set attendance for upcoming days using the "Set Daily Attendance" option.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/attendance-setup')}
            className="mt-6 bg-blue-600 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-bold">Set Attendance</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `${item.child_id}-${item.schedule_date}-${idx}`}
          renderItem={renderRecord}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
