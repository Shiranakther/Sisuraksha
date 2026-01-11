import React from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FaceRecognitionToggleProps {
  isEnabled: boolean;
  isScanning: boolean;
  onToggle: (value: boolean) => void;
  lastScanResult?: {
    name: string;
    verified: boolean;
    confidence: number;
    time: string;
  } | null;
}

export function FaceRecognitionToggle({
  isEnabled,
  isScanning,
  onToggle,
  lastScanResult,
}: FaceRecognitionToggleProps) {
  return (
    <View className="bg-white rounded-2xl p-4 shadow-sm mb-4">
      {/* Toggle Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className={`p-3 rounded-xl mr-3 ${isEnabled ? 'bg-blue-100' : 'bg-slate-100'}`}>
            {isScanning ? (
              <ActivityIndicator size={24} color="#3B82F6" />
            ) : (
              <Ionicons
                name={isEnabled ? 'scan' : 'scan-outline'}
                size={24}
                color={isEnabled ? '#3B82F6' : '#94A3B8'}
              />
            )}
          </View>
          <View>
            <Text className="text-base font-bold text-slate-800">Face Recognition</Text>
            <Text className="text-xs text-slate-400">
              {isScanning ? 'Scanning...' : isEnabled ? 'Active' : 'Disabled'}
            </Text>
          </View>
        </View>

        <Switch
          value={isEnabled}
          onValueChange={onToggle}
          trackColor={{ false: '#E2E8F0', true: '#93C5FD' }}
          thumbColor={isEnabled ? '#3B82F6' : '#94A3B8'}
          disabled={isScanning}
        />
      </View>

      {/* Last Scan Result */}
      {lastScanResult && (
        <View className={`mt-3 p-3 rounded-xl ${lastScanResult.verified ? 'bg-green-50' : 'bg-red-50'}`}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Ionicons
                name={lastScanResult.verified ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={lastScanResult.verified ? '#22C55E' : '#EF4444'}
              />
              <View className="ml-2">
                <Text className={`font-semibold ${lastScanResult.verified ? 'text-green-700' : 'text-red-700'}`}>
                  {lastScanResult.name}
                </Text>
                <Text className="text-xs text-slate-400">{lastScanResult.time}</Text>
              </View>
            </View>
            <View className={`px-2 py-1 rounded-lg ${lastScanResult.verified ? 'bg-green-100' : 'bg-red-100'}`}>
              <Text className={`text-xs font-bold ${lastScanResult.verified ? 'text-green-700' : 'text-red-700'}`}>
                {lastScanResult.confidence.toFixed(1)}%
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Status Indicator */}
      {isEnabled && !lastScanResult && (
        <View className="mt-3 p-3 rounded-xl bg-blue-50 flex-row items-center">
          <Ionicons name="information-circle" size={18} color="#3B82F6" />
          <Text className="text-blue-700 text-xs ml-2">
            Ready to scan. Present student's face to camera.
          </Text>
        </View>
      )}
    </View>
  );
}
