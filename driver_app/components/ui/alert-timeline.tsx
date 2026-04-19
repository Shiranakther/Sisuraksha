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
  /** Which IR steps were active when alert fired (null = not an IR event). */
  sensorSteps?: { s1: boolean; s2: boolean; s3: boolean } | null;
  /** Detection source for the badge. */
  detectionSource?: 'IR_ONLY' | 'AI_ONLY' | 'DUAL' | null;
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
  icon,
  sensorSteps,
  detectionSource,
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

            {/* IR step diagram — shown when sensor step data is available */}
            {sensorSteps && (
              <View className="mt-3 bg-slate-50 rounded-xl p-3">
                <Text className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                  IR Sensor Steps
                </Text>
                <View className="flex-row gap-2">
                  {[
                    { key: 's1', label: 'S1', desc: 'Entry',  active: sensorSteps.s1, danger: false },
                    { key: 's2', label: 'S2', desc: 'Mid',    active: sensorSteps.s2, danger: false },
                    { key: 's3', label: 'S3', desc: 'Bottom', active: sensorSteps.s3, danger: true  },
                  ].map(step => (
                    <View
                      key={step.key}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 10,
                        alignItems: 'center',
                        backgroundColor: step.active
                          ? (step.danger ? '#EF4444' : '#F59E0B')
                          : '#E2E8F0',
                      }}
                    >
                      <Ionicons
                        name={step.active ? 'person' : 'remove-circle-outline'}
                        size={14}
                        color={step.active ? 'white' : '#94A3B8'}
                      />
                      <Text style={{
                        fontSize: 11, fontWeight: '700', marginTop: 2,
                        color: step.active ? 'white' : '#94A3B8',
                      }}>
                        {step.label}
                      </Text>
                      <Text style={{
                        fontSize: 9, marginTop: 1,
                        color: step.active ? 'rgba(255,255,255,0.8)' : '#CBD5E1',
                      }}>
                        {step.active ? (step.danger ? 'DANGER' : 'BLOCKED') : step.desc.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Detection source badge */}
                {detectionSource && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Ionicons
                      name={detectionSource === 'IR_ONLY' ? 'hardware-chip-outline' : detectionSource === 'AI_ONLY' ? 'eye-outline' : 'shield-half-outline'}
                      size={12}
                      color={detectionSource === 'DUAL' ? '#7C3AED' : detectionSource === 'IR_ONLY' ? '#2563EB' : '#059669'}
                    />
                    <Text style={{
                      fontSize: 11, marginLeft: 4, fontWeight: '600',
                      color: detectionSource === 'DUAL' ? '#7C3AED' : detectionSource === 'IR_ONLY' ? '#2563EB' : '#059669',
                    }}>
                      {detectionSource === 'DUAL' ? 'AI + IR Sensors' : detectionSource === 'IR_ONLY' ? 'IR Sensor Only' : 'AI Vision Only'}
                    </Text>
                  </View>
                )}
              </View>
            )}

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
