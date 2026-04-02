import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/useAuth';

export default function DriverExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      
      {/* Header with Logo */}
      <View className="px-6 py-6 items-center border-b border-slate-200 bg-white shadow-sm z-10">
         <Image 
            source={require('../../assets/images/sisuraksha_logo.png')}
            style={{ width: 140, height: 40, resizeMode: 'contain' }}
        />
      </View>

      <ScrollView className="flex-1 pt-6 px-6" contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        
        {/* Welcome Block */}
        <View className="mb-8">
            <Text className="text-3xl font-bold text-slate-800 mb-2">Driver Portal</Text>
            <Text className="text-base text-slate-500 leading-relaxed">
              Welcome to the Sisuraksha Driver network. Your role is critical in ensuring the safe transit of our students every day.
            </Text>
        </View>

        {/* Driver Guidelines Section */}
        <Text className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wider">Operational Guidelines</Text>
        
        <View className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-4 flex-row">
            <View className="bg-blue-100 w-12 h-12 rounded-full items-center justify-center mr-4">
               <Ionicons name="shield-checkmark" size={24} color="#2563EB" />
            </View>
            <View className="flex-1 justify-center">
                <Text className="text-base font-bold text-slate-800 mb-1">Safety First</Text>
                <Text className="text-sm text-slate-500 leading-relaxed">Always maintain speed limits and utilize the live AI monitoring feeds during trips.</Text>
            </View>
        </View>

        <View className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-4 flex-row">
            <View className="bg-emerald-100 w-12 h-12 rounded-full items-center justify-center mr-4">
               <Ionicons name="calendar" size={24} color="#059669" />
            </View>
            <View className="flex-1 justify-center">
                <Text className="text-base font-bold text-slate-800 mb-1">Attendance Logging</Text>
                <Text className="text-sm text-slate-500 leading-relaxed">Verify students visually as they board and ensure the automated attendance scanner captures them.</Text>
            </View>
        </View>

        <View className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-8 flex-row">
            <View className="bg-purple-100 w-12 h-12 rounded-full items-center justify-center mr-4">
               <Ionicons name="chatbubbles" size={24} color="#9333EA" />
            </View>
            <View className="flex-1 justify-center">
                <Text className="text-base font-bold text-slate-800 mb-1">Parent Communication</Text>
                <Text className="text-sm text-slate-500 leading-relaxed">Broadcast delays directly through the active trip interface to notify all attached parents instantly.</Text>
            </View>
        </View>

        {/* Resources & Legal */}
        <Text className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-wider">Resources & Legal</Text>
        
        <View className="bg-slate-100 rounded-2xl overflow-hidden mb-8 border border-slate-200">
            <TouchableOpacity 
                onPress={() => router.push('/(tabs)/terms')}
                className="bg-white p-4 flex-row items-center justify-between border-b border-slate-100"
            >
                <View className="flex-row items-center">
                    <Ionicons name="document-text-outline" size={20} color="#64748B" className="mr-3"/>
                    <Text className="text-base text-slate-700 ml-3 font-medium">Terms & Conditions</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => router.push('/(tabs)/privacy')}
                className="bg-white p-4 flex-row items-center justify-between"
            >
                <View className="flex-row items-center">
                    <Ionicons name="lock-closed-outline" size={20} color="#64748B" className="mr-3"/>
                    <Text className="text-base text-slate-700 ml-3 font-medium">Privacy Policy</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
            </TouchableOpacity>
        </View>

        {/* Login Button (For users exploring before auth) */}
        {!user && (
          <TouchableOpacity 
             onPress={() => router.replace('/login')}
             className="bg-orange-500 w-full py-4 rounded-xl items-center shadow-sm mb-4"
          >
            <Text className="text-white font-bold text-lg">Proceed to Login</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}
