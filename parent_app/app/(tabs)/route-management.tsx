import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, Switch, RefreshControl, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useMyChildren,
  useMyLocation,
  useSetAttendanceSchedule,
  useGetAttendanceSchedule,
  useGetAttendanceHistory,
  useGetHolidays,
} from '../../hooks/useApi';

// ── helpers ──────────────────────────────────────
const fmt = (d: Date) => d.toISOString().split('T')[0];
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function getWeekDates(offset: number) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

type ScreenMode = 'home' | 'schedule' | 'history';

export default function RouteManagementTab() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ScreenMode>('home');

  return (
    <View className="flex-1 bg-slate-50" style={{ paddingTop: insets.top }}>
      {mode === 'home' && <HomeView onNavigate={setMode} />}
      {mode === 'schedule' && <ScheduleView onBack={() => setMode('home')} />}
      {mode === 'history' && <HistoryView onBack={() => setMode('home')} />}
    </View>
  );
}

// ══════════════════════════════════════════════════════
// HOME VIEW
// ══════════════════════════════════════════════════════
function HomeView({ onNavigate }: { onNavigate: (m: ScreenMode) => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="bg-blue-100 w-20 h-20 rounded-full items-center justify-center mb-4">
        <Ionicons name="map-outline" size={40} color="#2563EB" />
      </View>
      <Text className="text-2xl font-bold text-slate-800">Route Management</Text>
      <Text className="text-slate-400 text-sm mt-2 text-center mb-8">
        Set daily attendance and pickup schedules for your children.
      </Text>

      <TouchableOpacity
        onPress={() => onNavigate('schedule')}
        className="w-full bg-blue-600 px-6 py-4 rounded-2xl flex-row items-center mb-4"
      >
        <View className="bg-white/20 p-3 rounded-full mr-4">
          <Ionicons name="calendar-number" size={24} color="white" />
        </View>
        <View className="flex-1">
          <Text className="text-white font-bold text-lg">Set Daily Attendance</Text>
          <Text className="text-blue-200 text-sm">Present / absent & route type for each day</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onNavigate('history')}
        className="w-full bg-white px-6 py-4 rounded-2xl flex-row items-center border border-slate-200"
      >
        <View className="bg-slate-100 p-3 rounded-full mr-4">
          <Ionicons name="time" size={24} color="#475569" />
        </View>
        <View className="flex-1">
          <Text className="text-slate-800 font-bold text-lg">View History</Text>
          <Text className="text-slate-400 text-sm">Past, today & future schedules</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
      </TouchableOpacity>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// SCHEDULE VIEW — child selector + weekly calendar + route type
// ══════════════════════════════════════════════════════
type ScheduleType = 'BOTH' | 'MORNING' | 'EVENING';
interface DayEntry { isPresent: boolean; type: ScheduleType }

function ScheduleView({ onBack }: { onBack: () => void }) {
  const { data: children, isLoading: loadingChildren } = useMyChildren();
  const { data: location } = useMyLocation();
  const { data: holidays } = useGetHolidays();
  const scheduleMutation = useSetAttendanceSchedule();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [scheduleMap, setScheduleMap] = useState<Record<string, DayEntry>>({});
  const [notes, setNotes] = useState('');

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekStart = fmt(weekDates[0]);
  const weekEnd = fmt(weekDates[6]);

  const activeChildId = selectedChild || ((children as any[])?.[0]?.id ?? null);
  const activeChildName = (children as any[])?.find((c: any) => c.id === activeChildId)?.child_name ?? '';

  const { data: existingSchedules, refetch: refetchSchedules } = useGetAttendanceSchedule(
    activeChildId, weekStart, weekEnd
  );

  // Merge existing into local state
  React.useEffect(() => {
    if (existingSchedules && (existingSchedules as any[]).length > 0) {
      const map: Record<string, DayEntry> = {};
      (existingSchedules as any[]).forEach((s: any) => {
        map[s.schedule_date?.split('T')[0]] = {
          isPresent: s.is_present,
          type: s.schedule_type || 'BOTH',
        };
      });
      setScheduleMap(map);
    } else {
      setScheduleMap({});
    }
  }, [existingSchedules]);

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    (holidays as any[])?.forEach((h: any) => m.set(h.holiday_date?.split('T')[0], h.holiday_name));
    return m;
  }, [holidays]);

  const toggleDay = (dateStr: string) => {
    setScheduleMap(prev => {
      const cur = prev[dateStr];
      if (!cur) return { ...prev, [dateStr]: { isPresent: false, type: 'BOTH' } };
      return { ...prev, [dateStr]: { ...cur, isPresent: !cur.isPresent } };
    });
  };

  const setDayType = (dateStr: string, type: ScheduleType) => {
    setScheduleMap(prev => {
      const cur = prev[dateStr] || { isPresent: true, type: 'BOTH' };
      return { ...prev, [dateStr]: { ...cur, type } };
    });
  };

  const handleSave = () => {
    if (!activeChildId) {
      Alert.alert('Error', 'Please select a child first.');
      return;
    }

    const schedules = weekDates
      .filter(d => {
        const day = d.getDay();
        const ds = fmt(d);
        return day !== 0 && day !== 6 && !holidayMap.has(ds);
      })
      .map(d => {
        const ds = fmt(d);
        const entry = scheduleMap[ds];
        return {
          date: ds,
          isPresent: entry ? entry.isPresent : true,
          scheduleType: entry?.type || 'BOTH',
          pickupLat: location?.latitude || null,
          pickupLon: location?.longitude || null,
          pickupAddress: location?.address || null,
          notes: notes || null,
        };
      });

    scheduleMutation.mutate(
      { childId: activeChildId, schedules },
      {
        onSuccess: () => {
          Alert.alert('Saved', 'Attendance schedule saved successfully!');
          refetchSchedules();
        },
      }
    );
  };

  const today = fmt(new Date());

  if (loadingChildren) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Header */}
      <View className="bg-white px-5 py-4 border-b border-slate-100 flex-row items-center">
        <TouchableOpacity onPress={onBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-800">Set Attendance</Text>
          <Text className="text-xs text-slate-400">Must be set before the day</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ── Child Selector ── */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Child</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(children as any[])?.map((child: any) => (
              <TouchableOpacity
                key={child.id}
                onPress={() => setSelectedChild(child.id)}
                className={`mr-3 px-5 py-3 rounded-2xl border flex-row items-center ${
                  activeChildId === child.id
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-slate-200'
                }`}
              >
                <View className={`w-8 h-8 rounded-full items-center justify-center mr-2 ${
                  activeChildId === child.id ? 'bg-white/20' : 'bg-slate-100'
                }`}>
                  <Ionicons name="person" size={16} color={activeChildId === child.id ? 'white' : '#64748B'} />
                </View>
                <Text className={activeChildId === child.id ? 'text-white font-bold' : 'text-slate-700 font-medium'}>
                  {child.child_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Active Child Banner ── */}
        {activeChildName ? (
          <View className="mx-5 mt-2 mb-1 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 flex-row items-center">
            <Ionicons name="person-circle" size={20} color="#2563EB" />
            <Text className="text-blue-700 font-semibold ml-2">Setting schedule for: {activeChildName}</Text>
          </View>
        ) : null}

        {/* ── Week Navigation ── */}
        <View className="flex-row items-center justify-between px-5 py-3 mt-2">
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} className="bg-white p-2 rounded-full border border-slate-200">
            <Ionicons name="chevron-back" size={22} color="#475569" />
          </TouchableOpacity>
          <View className="items-center">
            <Text className="text-base font-bold text-slate-700">
              {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
            <Text className="text-xs text-slate-400">{weekDates[0].getFullYear()}</Text>
          </View>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} className="bg-white p-2 rounded-full border border-slate-200">
            <Ionicons name="chevron-forward" size={22} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* ── Legend ── */}
        <View className="flex-row px-5 mb-3 gap-4">
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-orange-300 rounded-full mr-1" />
            <Text className="text-xs text-slate-500">Weekend</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-red-400 rounded-full mr-1" />
            <Text className="text-xs text-slate-500">Holiday</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-3 h-3 bg-blue-500 rounded-full mr-1" />
            <Text className="text-xs text-slate-500">Today</Text>
          </View>
        </View>

        {/* ── Day Cards ── */}
        <View className="px-5">
          {weekDates.map((d) => {
            const dateStr = fmt(d);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const holidayName = holidayMap.get(dateStr);
            const isHoliday = !!holidayName;
            const isToday = dateStr === today;
            const isPast = dateStr < today;
            const entry = scheduleMap[dateStr];
            const isPresent = entry ? entry.isPresent : true;
            const routeType: ScheduleType = entry?.type || 'BOTH';
            const isDisabled = isWeekend || isHoliday;

            return (
              <View
                key={dateStr}
                className={`mb-3 rounded-2xl border overflow-hidden ${
                  isToday ? 'border-blue-300 bg-blue-50/50' :
                  isHoliday ? 'border-red-200 bg-red-50/50' :
                  isWeekend ? 'border-orange-200 bg-orange-50/50' :
                  isPast ? 'border-slate-100 bg-slate-50' :
                  'border-slate-200 bg-white'
                }`}
              >
                {/* Day Header */}
                <View className="flex-row items-center justify-between px-4 py-3">
                  <View className="flex-1">
                    <View className="flex-row items-center">
                      <Text className={`text-base font-bold ${isDisabled ? 'text-slate-400' : 'text-slate-800'}`}>
                        {fullDayNames[d.getDay()]}
                      </Text>
                      {isToday && (
                        <View className="ml-2 bg-blue-600 px-2.5 py-0.5 rounded-full">
                          <Text className="text-white text-[10px] font-bold">TODAY</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-sm text-slate-400">
                      {d.getDate()} {monthNames[d.getMonth()]}
                    </Text>
                    {isHoliday && (
                      <View className="flex-row items-center mt-1">
                        <Ionicons name="flag" size={12} color="#EF4444" />
                        <Text className="text-red-500 text-xs ml-1 font-medium">{holidayName}</Text>
                      </View>
                    )}
                    {isWeekend && !isHoliday && (
                      <Text className="text-orange-400 text-xs mt-0.5">Weekend — No school</Text>
                    )}
                  </View>

                  {!isDisabled && (
                    <View className="items-center">
                      <Switch
                        value={isPresent}
                        onValueChange={() => toggleDay(dateStr)}
                        trackColor={{ false: '#FCA5A5', true: '#86EFAC' }}
                        thumbColor={isPresent ? '#16A34A' : '#EF4444'}
                      />
                      <Text className={`text-xs font-bold mt-0.5 ${isPresent ? 'text-green-600' : 'text-red-500'}`}>
                        {isPresent ? 'Present' : 'Absent'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Route Type Selector — only for present, non-disabled days */}
                {!isDisabled && isPresent && (
                  <View className="px-4 pb-3 pt-1 border-t border-slate-100">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Route</Text>
                    <View className="flex-row gap-2">
                      {([
                        { key: 'MORNING' as ScheduleType, label: '🌅 Morning', color: 'amber' },
                        { key: 'EVENING' as ScheduleType, label: '🌇 Evening', color: 'purple' },
                        { key: 'BOTH' as ScheduleType, label: '☀️ Both', color: 'blue' },
                      ]).map(opt => {
                        const active = routeType === opt.key;
                        return (
                          <TouchableOpacity
                            key={opt.key}
                            onPress={() => setDayType(dateStr, opt.key)}
                            className={`flex-1 py-2 rounded-xl items-center border ${
                              active
                                ? 'bg-blue-600 border-blue-600'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Notes ── */}
        <View className="px-5 mt-2">
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notes (optional)</Text>
          <TextInput
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-700"
            placeholder="e.g., Child sick this week..."
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* ── Save Button ── */}
        <View className="px-5 mt-6">
          <TouchableOpacity
            onPress={handleSave}
            disabled={scheduleMutation.isPending}
            className={`py-4 rounded-2xl items-center flex-row justify-center ${
              scheduleMutation.isPending ? 'bg-blue-300' : 'bg-blue-600'
            }`}
          >
            {scheduleMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="white" style={{ marginRight: 8 }} />
                <Text className="text-white font-bold text-lg">Save Schedule</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// HISTORY VIEW — tabs (Future / Today / Past) + child filter + calendar
// ══════════════════════════════════════════════════════
type HistoryTab = 'FUTURE' | 'TODAY' | 'PAST';

function HistoryView({ onBack }: { onBack: () => void }) {
  const { data: children, isLoading: loadingChildren } = useMyChildren();
  const { data: holidays } = useGetHolidays();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryTab>('TODAY');
  const activeChildId = selectedChild || ((children as any[])?.[0]?.id ?? null);

  const { data: history, isLoading, refetch } = useGetAttendanceHistory(activeChildId);

  const today = fmt(new Date());

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    (holidays as any[])?.forEach((h: any) => m.set(h.holiday_date?.split('T')[0], h.holiday_name));
    return m;
  }, [holidays]);

  const grouped = useMemo(() => {
    if (!history) return { past: [], today: [], future: [] };
    const past: any[] = [];
    const todayItems: any[] = [];
    const future: any[] = [];
    (history as any[]).forEach((h: any) => {
      const d = h.schedule_date?.split('T')[0];
      if (d < today) past.push(h);
      else if (d === today) todayItems.push(h);
      else future.push(h);
    });
    return { past: past.reverse(), today: todayItems, future };
  }, [history, today]);

  const activeItems = activeTab === 'FUTURE' ? grouped.future
    : activeTab === 'TODAY' ? grouped.today
    : grouped.past;

  // Calendar month (next 30 days)
  const calendarDates = useMemo(() => {
    const dates: Date[] = [];
    const start = new Date();
    start.setDate(start.getDate() - 7);
    for (let i = 0; i < 45; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  // Build set of scheduled dates for calendar dots
  const scheduledDates = useMemo(() => {
    const m = new Map<string, boolean>();
    (history as any[])?.forEach((h: any) => {
      m.set(h.schedule_date?.split('T')[0], !!h.scheduled_present);
    });
    return m;
  }, [history]);

  if (loadingChildren) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  return (
    <View className="flex-1">
      {/* Header */}
      <View className="bg-white px-5 py-4 border-b border-slate-100 flex-row items-center">
        <TouchableOpacity onPress={onBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-800 flex-1">Attendance History</Text>
      </View>

      {/* Child Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 pt-4 pb-2">
        <TouchableOpacity
          onPress={() => setSelectedChild(null)}
          className={`mr-3 px-5 py-2.5 rounded-2xl border flex-row items-center ${
            !selectedChild ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'
          }`}
        >
          <Ionicons name="people" size={16} color={!selectedChild ? 'white' : '#64748B'} style={{ marginRight: 6 }} />
          <Text className={!selectedChild ? 'text-white font-bold' : 'text-slate-700 font-medium'}>All</Text>
        </TouchableOpacity>
        {(children as any[])?.map((child: any) => (
          <TouchableOpacity
            key={child.id}
            onPress={() => setSelectedChild(child.id)}
            className={`mr-3 px-5 py-2.5 rounded-2xl border flex-row items-center ${
              activeChildId === child.id && selectedChild
                ? 'bg-blue-600 border-blue-600'
                : 'bg-white border-slate-200'
            }`}
          >
            <Text className={activeChildId === child.id && selectedChild ? 'text-white font-bold' : 'text-slate-700 font-medium'}>
              {child.child_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Mini Calendar Strip */}
      <View className="bg-white border-b border-slate-100 pb-2 pt-1">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4">
          {calendarDates.map(d => {
            const ds = fmt(d);
            const isT = ds === today;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const hol = holidayMap.get(ds);
            const sched = scheduledDates.get(ds);

            return (
              <View key={ds} className="mx-0.5 w-10 items-center py-1">
                <Text className={`text-[9px] font-semibold ${isT ? 'text-blue-600' : isWeekend ? 'text-orange-400' : 'text-slate-400'}`}>
                  {dayNames[d.getDay()]}
                </Text>
                <View className={`w-8 h-8 rounded-full items-center justify-center mt-0.5 ${
                  isT ? 'bg-blue-600' : hol ? 'bg-red-100' : isWeekend ? 'bg-orange-50' : 'bg-transparent'
                }`}>
                  <Text className={`text-sm font-bold ${isT ? 'text-white' : hol ? 'text-red-500' : 'text-slate-700'}`}>
                    {d.getDate()}
                  </Text>
                </View>
                {/* Dot indicator */}
                {sched !== undefined && (
                  <View className={`w-1.5 h-1.5 rounded-full mt-0.5 ${sched ? 'bg-green-500' : 'bg-red-400'}`} />
                )}
                {hol && sched === undefined && (
                  <View className="w-1.5 h-1.5 rounded-full mt-0.5 bg-red-300" />
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Tabs: Future / Today / Past */}
      <View className="flex-row px-5 py-3 bg-white border-b border-slate-100">
        {([
          { key: 'FUTURE' as HistoryTab, label: 'Upcoming', icon: 'arrow-forward' as const, count: grouped.future.length, color: 'blue' },
          { key: 'TODAY' as HistoryTab, label: 'Today', icon: 'today' as const, count: grouped.today.length, color: 'green' },
          { key: 'PAST' as HistoryTab, label: 'Past', icon: 'time' as const, count: grouped.past.length, color: 'slate' },
        ]).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-xl items-center mx-1 ${
                isActive ? 'bg-blue-600' : 'bg-slate-50'
              }`}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? 'white' : '#94A3B8'} />
              <Text className={`text-xs font-bold mt-0.5 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                {tab.label} ({tab.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* History Items */}
      <ScrollView
        className="flex-1 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      >
        {isLoading && (
          <View className="py-10 items-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        )}

        {!isLoading && activeItems.length === 0 && (
          <View className="items-center py-16">
            <Ionicons
              name={activeTab === 'FUTURE' ? 'calendar-outline' : activeTab === 'TODAY' ? 'today-outline' : 'time-outline'}
              size={48} color="#CBD5E1"
            />
            <Text className="text-slate-400 mt-4 text-center">
              {activeTab === 'FUTURE' ? 'No upcoming schedules' :
               activeTab === 'TODAY' ? 'No schedule set for today' :
               'No past schedule records'}
            </Text>
          </View>
        )}

        {activeItems.map((item: any, i: number) => {
          const dateStr = item.schedule_date?.split('T')[0];
          const d = new Date(dateStr + 'T00:00:00');
          const variant = activeTab === 'TODAY' ? 'today' : activeTab === 'FUTURE' ? 'future' : 'past';
          const borderColor = variant === 'today' ? 'border-green-200' : variant === 'future' ? 'border-blue-200' : 'border-slate-100';
          const bgColor = variant === 'today' ? 'bg-green-50' : variant === 'future' ? 'bg-blue-50' : 'bg-white';

          return (
            <View key={`${item.child_id}-${dateStr}-${i}`} className={`mb-3 rounded-2xl border ${borderColor} ${bgColor} overflow-hidden`}>
              {/* Card Header */}
              <View className="flex-row items-center justify-between px-4 py-3">
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <View className="w-7 h-7 bg-slate-100 rounded-full items-center justify-center mr-2">
                      <Ionicons name="person" size={14} color="#475569" />
                    </View>
                    <Text className="text-base font-bold text-slate-800">{item.child_name}</Text>
                  </View>
                  <Text className="text-sm text-slate-400 mt-0.5 ml-9">
                    {fullDayNames[d.getDay()]}, {d.getDate()} {monthNames[d.getMonth()]} {d.getFullYear()}
                  </Text>
                </View>
                <View className={`px-3 py-1.5 rounded-full ${item.scheduled_present ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Text className={`text-xs font-bold ${item.scheduled_present ? 'text-green-700' : 'text-red-700'}`}>
                    {item.scheduled_present ? 'Present' : 'Absent'}
                  </Text>
                </View>
              </View>

              {/* Route Type */}
              {item.schedule_type && item.scheduled_present && (
                <View className="px-4 pb-2 flex-row items-center ml-9">
                  <View className={`px-2.5 py-1 rounded-lg mr-2 ${
                    item.schedule_type === 'MORNING' ? 'bg-amber-100' :
                    item.schedule_type === 'EVENING' ? 'bg-purple-100' : 'bg-blue-100'
                  }`}>
                    <Text className={`text-xs font-semibold ${
                      item.schedule_type === 'MORNING' ? 'text-amber-700' :
                      item.schedule_type === 'EVENING' ? 'text-purple-700' : 'text-blue-700'
                    }`}>
                      {item.schedule_type === 'MORNING' ? '🌅 Morning Only' :
                       item.schedule_type === 'EVENING' ? '🌇 Evening Only' : '☀️ Both Ways'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Actual attendance status */}
              {item.actual_status && (
                <View className="flex-row items-center px-4 pb-2 ml-9">
                  <Ionicons name="checkmark-circle" size={15} color="#16A34A" />
                  <Text className="text-xs text-green-600 ml-1 font-medium">
                    Attendance recorded — {item.last_action || 'done'}
                  </Text>
                </View>
              )}

              {/* Pickup/Dropoff Info */}
              {(item.pickup_address || item.dropoff_address || item.notes) && (
                <View className="px-4 pb-3 ml-9 border-t border-slate-100/50 pt-2">
                  {item.pickup_address && (
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="location" size={13} color="#94A3B8" />
                      <Text className="text-xs text-slate-400 ml-1">Pickup: {item.pickup_address}</Text>
                    </View>
                  )}
                  {item.dropoff_address && (
                    <View className="flex-row items-center mb-1">
                      <Ionicons name="flag" size={13} color="#94A3B8" />
                      <Text className="text-xs text-slate-400 ml-1">Drop-off: {item.dropoff_address}</Text>
                    </View>
                  )}
                  {item.notes && (
                    <View className="flex-row items-center">
                      <Ionicons name="chatbubble-outline" size={13} color="#94A3B8" />
                      <Text className="text-xs text-slate-400 ml-1">{item.notes}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
