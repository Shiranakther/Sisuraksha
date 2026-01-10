import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AlertTimelineItemProps {
  time: string;
  title: string;
  message: string;
  severity: 'DANGER' | 'WARNING' | 'SAFE' | 'CRITICAL' | string;
  confidence?: number;
  isLast?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

const severityConfig = {
  DANGER: { color: '#EF4444', bg: 'bg-red-50', dot: 'bg-red-500' },
  CRITICAL: { color: '#DC2626', bg: 'bg-red-50', dot: 'bg-red-600' },
  WARNING: { color: '#F59E0B', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  SAFE: { color: '#10B981', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  default: { color: '#64748B', bg: 'bg-slate-50', dot: 'bg-slate-400' },
};

export function AlertTimelineItem({ 
  time, 
  title, 
  message, 
  severity, 
  confidence, 
  isLast = false,
  icon 
}: AlertTimelineItemProps) {
  const [expanded, setExpanded] = useState(false);
  const config = severityConfig[severity as keyof typeof severityConfig] || severityConfig.default;

  return (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => setExpanded(!expanded)}
      className="flex-row"
    >
      {/* Timeline line + dot */}
      <View className="items-center mr-3" style={{ width: 20 }}>
        <View className={`w-3 h-3 rounded-full ${config.dot} z-10`} />
        {!isLast && (
          <View className="w-0.5 flex-1 bg-slate-200 -mt-0.5" style={{ minHeight: 40 }} />
        )}
      </View>

      {/* Content */}
      <View className={`flex-1 mb-3 pb-3 ${!isLast ? 'border-b border-slate-100' : ''}`}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            {icon && (
              <Ionicons name={icon} size={14} color={config.color} style={{ marginRight: 6 }} />
            )}
            <Text className="text-sm font-semibold text-slate-800" numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Text className="text-xs text-slate-400 ml-2">{time}</Text>
        </View>
        
        {expanded && (
          <View className="mt-2">
            <Text className="text-sm text-slate-600 leading-5">{message}</Text>
            {confidence !== undefined && (
              <View className="flex-row items-center mt-2">
                <View className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <View 
                    className="h-full rounded-full"
                    style={{ width: `${confidence * 100}%`, backgroundColor: config.color }}
                  />
                </View>
                <Text className="text-xs text-slate-500 ml-2 w-10">
                  {(confidence * 100).toFixed(0)}%
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface TimelineGroupProps {
  title: string;
  children: React.ReactNode;
}

export function TimelineGroup({ title, children }: TimelineGroupProps) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 ml-8">
        {title}
      </Text>
      {children}
    </View>
  );
}
