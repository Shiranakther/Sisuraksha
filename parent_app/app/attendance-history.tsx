import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyChildren, useGetAttendanceHistory, useGetHolidays } from '../hooks/useApi';

const ROUTE_LABEL: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  BOTH: { label: 'Both Ways', emoji: '☀️', bg: 'bg-blue-100', text: 'text-blue-700' },
  MORNING: { label: 'Morning', emoji: '🌅', bg: 'bg-amber-100', text: 'text-amber-700' },
  EVENING: { label: 'Evening', emoji: '🌇', bg: 'bg-purple-100', text: 'text-purple-700' },
};

type TabFilter = 'UPCOMING' | 'TODAY' | 'PAST';

const fmt = (d: Date) => d.toISOString().split('T')[0];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getCategory = (dateStr: string, today: string): TabFilter => {
  const d = dateStr?.split('T')[0];
  if (d === today) return 'TODAY';
  if (d < today) return 'PAST';
  return 'UPCOMING';
};

export default function AttendanceHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [selectedChild, setSelectedChild] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabFilter>('TODAY');

  const { data: children, isLoading: loadingChildren } = useMyChildren();
  const { data: history, isLoading: loadingHistory } = useGetAttendanceHistory(selectedChild);
  const { data: holidays } = useGetHolidays();

  const today = fmt(new Date());

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    ((holidays as any[]) || []).forEach((h: any) => m.set(h.holiday_date?.split('T')[0], h.holiday_name));
    return m;
  }, [holidays]);

  const records: any[] = (history as any[]) || [];

  // Group by tab
  const grouped = useMemo(() => {
    const past: any[] = [];
    const todayItems: any[] = [];
    const upcoming: any[] = [];
    records.forEach(r => {
      const cat = getCategory(r.schedule_date, today);
      if (cat === 'PAST') past.push(r);
      else if (cat === 'TODAY') todayItems.push(r);
      else upcoming.push(r);
    });
    return { PAST: past.reverse(), TODAY: todayItems, UPCOMING: upcoming };
  }, [records, today]);

  const activeItems = grouped[activeTab];

  const tabs: { key: TabFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'UPCOMING', label: 'Upcoming', icon: 'arrow-forward-circle' },
    { key: 'TODAY', label: 'Today', icon: 'today' },
    { key: 'PAST', label: 'Past', icon: 'time' },
  ];

  const renderCard = ({ item }: { item: any }) => {
    const dateStr = item.schedule_date?.split('T')[0];
    const d = new Date(dateStr + 'T00:00:00');
    const isPresent = !!item.scheduled_present;
    const routeInfo = ROUTE_LABEL[item.schedule_type] || ROUTE_LABEL.BOTH;
    const holName = holidayMap.get(dateStr);
    const cat = getCategory(item.schedule_date, today);

    return (
      <View className={`mx-4 mb-3 rounded-2xl border overflow-hidden ${
        cat === 'TODAY' ? 'border-blue-200 bg-blue-50/30' :
        cat === 'UPCOMING' ? 'border-amber-200 bg-amber-50/20' :
        'border-slate-100 bg-white'
      }`}>
        {/* Top Row: child + date + status */}
        <View className="flex-row items-center px-4 pt-3 pb-2">
          {/* Avatar */}
          <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
            isPresent ? 'bg-emerald-100' : 'bg-red-100'
          }`}>
            <Ionicons name="person" size={18} color={isPresent ? '#059669' : '#EF4444'} />
          </View>

          <View className="flex-1">
            <Text className="text-base font-bold text-slate-800">{item.child_name || 'Unknown'}</Text>
            <Text className="text-xs text-slate-400">
              {DAYS[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}
            </Text>
          </View>

          {/* Status badge */}
          <View className={`px-3 py-1 rounded-full ${isPresent ? 'bg-emerald-100' : 'bg-red-100'}`}>
            <Text className={`text-xs font-bold ${isPresent ? 'text-emerald-700' : 'text-red-700'}`}>
              {isPresent ? 'Present' : 'Absent'}
            </Text>
          </View>
        </View>

        {/* Info row */}
        <View className="flex-row items-center px-4 pb-2 gap-3 ml-13">
          {/* Route type */}
          {isPresent && item.schedule_type && (
            <View className={`flex-row items-center px-2 py-0.5 rounded-lg ${routeInfo.bg}`}>
              <Text className={`text-xs font-semibold ${routeInfo.text}`}>
                {routeInfo.emoji} {routeInfo.label}
              </Text>
            </View>
          )}

          {/* Holiday indicator */}
          {holName && (
            <View className="flex-row items-center">
              <Ionicons name="flag" size={12} color="#EF4444" />
              <Text className="text-xs text-red-500 ml-0.5">{holName}</Text>
            </View>
          )}

          {/* Actual attendance */}
          {item.actual_status && (
            <View className="flex-row items-center">
              <Ionicons name="checkmark-circle" size={13} color="#10B981" />
              <Text className="text-xs text-emerald-600 ml-0.5 font-medium">Verified</Text>
            </View>
          )}
        </View>

        {/* Times row */}
        {(item.morning_pickup_time || item.evening_pickup_time) && (
          <View className="flex-row items-center px-4 pb-2 gap-4 ml-13">
            {item.morning_pickup_time && (
              <View className="flex-row items-center">
                <Ionicons name="sunny-outline" size={12} color="#F59E0B" />
                <Text className="text-xs text-slate-500 ml-1">Morning: {item.morning_pickup_time}</Text>
              </View>
            )}
            {item.evening_pickup_time && (
              <View className="flex-row items-center">
                <Ionicons name="moon-outline" size={12} color="#8B5CF6" />
                <Text className="text-xs text-slate-500 ml-1">Evening: {item.evening_pickup_time}</Text>
              </View>
            )}
          </View>
        )}

        {/* Locations */}
        {(item.pickup_address || item.dropoff_address || item.notes) && (
          <View className="px-4 pb-3 ml-13 border-t border-slate-100/50 pt-2">
            {item.pickup_address && (
              <View className="flex-row items-center mb-0.5">
                <Ionicons name="location" size={12} color="#2563EB" />
                <Text className="text-xs text-slate-400 ml-1 flex-1" numberOfLines={1}>Pickup: {item.pickup_address}</Text>
              </View>
            )}
            {item.dropoff_address && (
              <View className="flex-row items-center mb-0.5">
                <Ionicons name="flag-outline" size={12} color="#DC2626" />
                <Text className="text-xs text-slate-400 ml-1 flex-1" numberOfLines={1}>Drop-off: {item.dropoff_address}</Text>
              </View>
            )}
            {item.notes && (
              <View className="flex-row items-center">
                <Ionicons name="chatbubble-outline" size={12} color="#94A3B8" />
                <Text className="text-xs text-slate-400 ml-1">{item.notes}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-slate-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-3 p-1">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Attendance History</Text>
          <Text className="text-slate-400 text-xs">Scheduled & verified attendance</Text>
        </View>
      </View>

      {/* Child filter */}
      <View className="bg-white border-b border-slate-200">
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, flexWrap: 'wrap', gap: 6 }}>
          <TouchableOpacity
            onPress={() => setSelectedChild(undefined)}
            style={{ height: 30, justifyContent: 'center' }}
            className={`px-3 rounded-lg border flex-row items-center ${!selectedChild ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}
          >
            <Ionicons name="people" size={13} color={!selectedChild ? 'white' : '#64748B'} style={{ marginRight: 4 }} />
            <Text className={`text-xs font-semibold ${!selectedChild ? 'text-white' : 'text-slate-600'}`}>All</Text>
          </TouchableOpacity>
          {!loadingChildren && ((children as any[]) || []).map((child: any) => (
            <TouchableOpacity
              key={child.id}
              onPress={() => setSelectedChild(child.id)}
              style={{ height: 30, justifyContent: 'center' }}
              className={`px-3 rounded-lg border flex-row items-center ${selectedChild === child.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}
            >
              <Ionicons name="person" size={12} color={selectedChild === child.id ? 'white' : '#64748B'} style={{ marginRight: 4 }} />
              <Text className={`text-xs font-semibold ${selectedChild === child.id ? 'text-white' : 'text-slate-600'}`}>
                {child.child_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tabs: Upcoming / Today / Past */}
      <View className="flex-row bg-white border-b border-slate-200 px-2 pt-1">
        {tabs.map(tab => {
          const count = grouped[tab.key].length;
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 items-center py-2.5 border-b-2 ${active ? 'border-blue-600' : 'border-transparent'}`}
            >
              <Ionicons name={tab.icon} size={16} color={active ? '#2563EB' : '#94A3B8'} />
              <Text className={`text-[11px] font-bold mt-0.5 ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                {tab.label}
              </Text>
              <View className={`px-2 py-0.5 rounded-full mt-0.5 ${active ? 'bg-blue-100' : 'bg-slate-100'}`}>
                <Text className={`text-[10px] font-bold ${active ? 'text-blue-700' : 'text-slate-500'}`}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary Stats */}
      <View className="flex-row mx-4 my-2.5 gap-2.5">
        {[
          { l: 'Present', c: records.filter(r => r.scheduled_present).length, bg: 'bg-emerald-50 border-emerald-100', t: 'text-emerald-700' },
          { l: 'Absent', c: records.filter(r => !r.scheduled_present).length, bg: 'bg-red-50 border-red-100', t: 'text-red-700' },
          { l: 'Total', c: records.length, bg: 'bg-blue-50 border-blue-100', t: 'text-blue-700' },
        ].map(s => (
          <View key={s.l} className={`flex-1 rounded-xl border ${s.bg} py-2 items-center`}>
            <Text className={`text-lg font-bold ${s.t}`}>{s.c}</Text>
            <Text className={`text-[10px] font-semibold ${s.t}`}>{s.l}</Text>
          </View>
        ))}
      </View>

      {/* List */}
      {loadingHistory || loadingChildren ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : activeItems.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons
            name={activeTab === 'UPCOMING' ? 'calendar-outline' : activeTab === 'TODAY' ? 'today-outline' : 'time-outline'}
            size={52} color="#CBD5E1"
          />
          <Text className="text-slate-500 mt-4 text-center text-base font-medium">
            {activeTab === 'UPCOMING' ? 'No upcoming schedules' :
             activeTab === 'TODAY' ? 'No schedule for today' :
             'No past records found'}
          </Text>
          {activeTab !== 'PAST' && (
            <TouchableOpacity
              onPress={() => router.push('/attendance-setup')}
              className="mt-5 bg-blue-600 px-6 py-3 rounded-xl flex-row items-center"
            >
              <Ionicons name="add-circle" size={18} color="white" style={{ marginRight: 6 }} />
              <Text className="text-white font-bold">Set Attendance</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={activeItems}
          keyExtractor={(item, idx) => `${item.child_id}-${item.schedule_date}-${idx}`}
          renderItem={renderCard}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
