import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DriverTermsScreen() {
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
        <Text className="text-xl font-bold text-slate-800">Terms & Conditions</Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <Text className="text-sm text-slate-500 mb-6">Last Updated: March 2026</Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">1. Acceptance of Terms</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            By accessing and using the Sisuraksha Driver application, you accept and agree to be bound by the terms and provision of this agreement. Wait to start any trip until you fully comply with local transit laws.
          </Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">2. Driver Responsibilities</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            As a registered driver, you are responsible for maintaining a safe environment for all student passengers. You must comply with all traffic regulations and utilize the built-in monitoring tools to report any safety anomalies immediately.
          </Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">3. Account Security</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            You are responsible for maintaining the confidentiality of your login credentials. Sisuraksha will never ask for your password via phone or email. Report any unauthorized access strictly through the administrative portal.
          </Text>

          <Text className="text-lg font-bold text-slate-800 mb-2">4. Privacy Policy Integration</Text>
          <Text className="text-slate-600 mb-6 leading-relaxed">
            Your use of the application is also governed by our Privacy Policy, which outlines how we collect, use, and protect your location and profile data during active transit hours.
          </Text>
          
          <Text className="text-lg font-bold text-slate-800 mb-2">5. Modifications</Text>
          <Text className="text-slate-600 leading-relaxed">
            We reserve the right to modify these terms from time to time at our sole discretion. Therefore, you should review these pages periodically.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
