import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLogout } from '../../hooks/useApi';

export default function SettingsScreen() {
  const logoutMutation = useLogout();

  return (
    <View className="flex-1 bg-slate-50 p-6 pt-16">
      <Text className="text-3xl font-bold text-slate-800 mb-8">Settings</Text>
      
      <View className="bg-white rounded-xl overflow-hidden mb-6">
        {['Notifications', 'Privacy', 'Help'].map((item) => (
          <TouchableOpacity key={item} className="p-4 border-b border-slate-50 flex-row justify-between">
            <Text className="text-base text-slate-700">{item}</Text>
            <Text className="text-slate-300">›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity 
        onPress={() => logoutMutation.mutate()} 
        className="bg-red-50 p-4 rounded-xl items-center"
      >
        <Text className="text-red-600 font-bold text-lg">Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}