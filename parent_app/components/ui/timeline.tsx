import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TimelineEvent {
  id: string;
  time: string;
  type: 'pickup' | 'dropoff';
  location: string;
  verified: boolean;
  confidence?: number;
}

interface TimelineItemProps {
  event: TimelineEvent;
  isLast: boolean;
}

export function TimelineItem({ event, isLast }: TimelineItemProps) {
  const getEventIcon = (): keyof typeof Ionicons.glyphMap => {
    if (event.type === 'pickup') return 'arrow-up-circle';
    return 'arrow-down-circle';
  };

  const getEventColor = (): string => {
    if (!event.verified) return '#94A3B8'; // Gray for pending
    return event.type === 'pickup' ? '#22C55E' : '#3B82F6';
  };

  return (
    <View className="flex-row">
      {/* Timeline Line & Dot */}
      <View className="items-center mr-3">
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: `${getEventColor()}20` }}
        >
          <Ionicons name={getEventIcon()} size={20} color={getEventColor()} />
        </View>
        {!isLast && (
          <View className="w-0.5 flex-1 bg-slate-200 my-1" style={{ minHeight: 30 }} />
        )}
      </View>

      {/* Content */}
      <View className="flex-1 pb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-lg font-bold text-slate-800">{event.time}</Text>
          {event.verified ? (
            <View className="flex-row items-center bg-green-100 px-2 py-1 rounded-full">
              <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
              <Text className="text-green-700 text-xs font-bold ml-1">Verified</Text>
            </View>
          ) : (
            <View className="flex-row items-center bg-slate-100 px-2 py-1 rounded-full">
              <Ionicons name="time" size={14} color="#94A3B8" />
              <Text className="text-slate-500 text-xs font-bold ml-1">Pending</Text>
            </View>
          )}
        </View>

        <Text className="text-slate-600 text-sm">
          {event.type === 'pickup' ? '🏠 → 🚌 Picked Up' : '🚌 → 🏫 Dropped Off'}
        </Text>

        <View className="flex-row items-center mt-1">
          <Ionicons name="location" size={12} color="#94A3B8" />
          <Text className="text-slate-400 text-xs ml-1">{event.location}</Text>
        </View>

        {event.verified && event.confidence && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="scan" size={12} color="#22C55E" />
            <Text className="text-green-600 text-xs ml-1">
              Face Match: {event.confidence}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface AttendanceTimelineProps {
  childName: string;
  date: string;
  events: TimelineEvent[];
}

export function AttendanceTimeline({ childName, date, events }: AttendanceTimelineProps) {
  return (
    <View className="bg-white rounded-2xl p-4 shadow-sm">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-slate-100">
        <View className="flex-row items-center">
          <View className="bg-blue-100 p-2 rounded-full mr-3">
            <Ionicons name="person" size={20} color="#3B82F6" />
          </View>
          <View>
            <Text className="text-lg font-bold text-slate-800">{childName}</Text>
            <Text className="text-xs text-slate-400">{date}</Text>
          </View>
        </View>
        <View className="bg-blue-50 px-3 py-1.5 rounded-lg">
          <Text className="text-blue-600 text-xs font-bold">
            {events.filter(e => e.verified).length}/{events.length} Verified
          </Text>
        </View>
      </View>

      {/* Timeline */}
      {events.length === 0 ? (
        <View className="py-6 items-center">
          <Ionicons name="calendar-outline" size={40} color="#CBD5E1" />
          <Text className="text-slate-400 mt-2">No events today</Text>
        </View>
      ) : (
        events.map((event, index) => (
          <TimelineItem
            key={event.id}
            event={event}
            isLast={index === events.length - 1}
          />
        ))
      )}
    </View>
  );
}
