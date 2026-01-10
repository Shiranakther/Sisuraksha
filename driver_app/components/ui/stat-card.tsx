import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StatCardProps {
  value: string | number;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  accentColor?: string;
}

export function StatCard({ value, label, icon, iconColor = '#64748B', trend, accentColor }: StatCardProps) {
  return (
    <View className="flex-1 bg-white/80 backdrop-blur px-3 py-4 rounded-xl">
      <View className="flex-row items-center justify-between mb-1">
        {icon && (
          <Ionicons name={icon} size={16} color={iconColor} />
        )}
        {trend && (
          <Ionicons 
            name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove'} 
            size={14} 
            color={trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#64748B'} 
          />
        )}
      </View>
      <Text 
        className="text-3xl font-bold text-slate-800"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </Text>
      <Text className="text-xs text-slate-500 uppercase tracking-wider mt-1">
        {label}
      </Text>
    </View>
  );
}
