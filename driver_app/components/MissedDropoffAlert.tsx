import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface MissedDropoffAlertProps {
  visible: boolean;
  missedChildren: any[];
  onDismiss: () => void;
}

export default function MissedDropoffAlert({ visible, missedChildren, onDismiss }: MissedDropoffAlertProps) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <View className="bg-white w-full rounded-3xl p-6 shadow-xl">
          <View className="items-center mb-4">
            <View className="bg-red-100 p-4 rounded-full mb-2">
              <Ionicons name="warning" size={32} color="#DC2626" />
            </View>
            <Text className="text-xl font-bold text-slate-800 text-center">
              Missed Drop-off Alert!
            </Text>
            <Text className="text-slate-500 text-center mt-2">
              You are near the drop-off location for the following students, but they are still on board.
            </Text>
          </View>
          
          <ScrollView className="max-h-48 mb-6">
            {missedChildren.map((child, idx) => (
              <View key={idx} className="flex-row items-center py-3 border-b border-slate-100 last:border-b-0">
                <View className="w-10 h-10 bg-slate-100 rounded-full items-center justify-center mr-3">
                  <Ionicons name="person" size={20} color="#64748B" />
                </View>
                <Text className="text-base font-bold text-slate-800">
                  {child.child_name}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View className="flex-row gap-3">
            <TouchableOpacity 
              onPress={onDismiss}
              className="flex-1 bg-slate-100 p-4 rounded-xl items-center"
            >
              <Text className="text-slate-700 font-bold">Dismiss</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => {
                onDismiss();
                router.push('/(tabs)/attendance');
              }}
              className="flex-1 bg-indigo-600 p-4 rounded-xl items-center"
            >
              <Text className="text-white font-bold">Open Attendance</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
