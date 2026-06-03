import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DriverPrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View 
        className="px-6 py-4 flex-row items-center border-b border-slate-200 bg-white"
      >
        <TouchableOpacity 
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-slate-100 items-center justify-center mr-4"
        >
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-800">Privacy Policy</Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <Text className="text-sm text-slate-500 mb-6">Last Updated: March 2026</Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">1. Data Collection</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            While using the Sisuraksha Driver App, we collect precise location data, trip duration, vehicle metrics, and driver monitoring analytics (including interior cabin status). This data is strictly used for ensuring passenger safety and operational efficiency.
          </Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">2. Usage of Information</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            The collected information is securely transmitted to authorized parents and school administrators in real-time. We use this data to calculate ETA, confirm student attendance, and monitor driver fatigue through AI systems.
          </Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">3. Data Retention</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            Driver analytics and specific trip logs are retained securely on our servers for compliance and auditing purposes according to regional transportation laws. 
          </Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">4. Third-Party Sharing</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            Sisuraksha does not sell your personal demographic or location data to third parties. Data is only accessible by verified roles associated directly with your deployed route.
          </Text>
          
          <Text className="text-lg font-bold text-slate-800 mb-2">5. Your Controls</Text>
          <Text className="text-slate-600 leading-relaxed">
            You may request an export of your driving analytics or request complete account deletion at any time via the Admin portal. Note that deleting the account instantly revokes access to assigned bus routes.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
