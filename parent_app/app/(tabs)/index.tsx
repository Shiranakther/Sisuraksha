

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, RefreshControl } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useSchools, useRegisterChild, useMyChildren } from '@/hooks/useApi'; // 👈 Import new hook
import { useQueryClient } from '@tanstack/react-query';

export default function ParentDashboard() {
  const [childName, setChildName] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('');
  
  const queryClient = useQueryClient();

  // --- API Hooks ---
  const { data: schools, isLoading: isLoadingSchools } = useSchools();
  
  //  1. Fetch Children Data
  const { data: myChildren, isLoading: isLoadingChildren, refetch } = useMyChildren();
  
  const registerChildMutation = useRegisterChild();

  const handleRegister = () => {
    if (!childName.trim() || !selectedSchool) {
      Alert.alert('Validation', 'Please fill in all fields.');
      return;
    }

    registerChildMutation.mutate({
      child_name: childName,
      school_id: selectedSchool,
    }, {
      onSuccess: () => {
        setChildName('');
        // 👇 2. Refresh the list immediately after adding
        queryClient.invalidateQueries({ queryKey: ['myChildren'] }); 
      }
    });
  };

  return (
    <ScrollView 
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 60 }}
      refreshControl={<RefreshControl refreshing={isLoadingChildren} onRefresh={refetch} />}
    >
      
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-slate-800">Parent Dashboard</Text>
        <Text className="text-base text-slate-500">Manage your children and bus rides</Text>
      </View>

      {/* --- Register Child Form --- */}
      <View className="bg-white rounded-2xl p-5 shadow-sm shadow-slate-200 mb-6">
        <View className="flex-row items-center mb-4 gap-3">
          <Ionicons name="person-add" size={24} color="#4F46E5" />
          <Text className="text-lg font-bold text-slate-800">Register a Child</Text>
        </View>

        <Text className="text-sm font-semibold text-slate-600 mb-2">Child's Full Name</Text>
        <TextInput
          placeholder="e.g. Nimal Perera"
          value={childName}
          onChangeText={setChildName}
          className="bg-slate-100 rounded-xl p-3.5 text-base mb-4 border border-slate-200"
        />

        <Text className="text-sm font-semibold text-slate-600 mb-2">Select School</Text>
        <View className="bg-slate-100 rounded-xl border border-slate-200 mb-6 overflow-hidden">
          {isLoadingSchools ? (
            <ActivityIndicator color="#4F46E5" className="p-3.5" />
          ) : (
            <Picker
              selectedValue={selectedSchool}
              onValueChange={(val) => setSelectedSchool(val)}
              style={{ width: '100%', height: 55 }}
            >
              <Picker.Item label="Select a school..." value="" color="#94a3b8" />
              {schools?.map((s: any) => (
                <Picker.Item key={s.id} label={s.school_name} value={s.id} />
              ))}
            </Picker>
          )}
        </View>

        <TouchableOpacity
          onPress={handleRegister}
          disabled={registerChildMutation.isPending}
          className="bg-indigo-600 p-4 rounded-xl items-center shadow-lg shadow-indigo-200"
        >
          {registerChildMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Register Child</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* --- My Children List --- */}
      <View className="bg-white rounded-2xl p-5 shadow-sm shadow-slate-200">
         <View className="flex-row items-center mb-4 gap-3 border-b border-slate-100 pb-4">
          <Ionicons name="people" size={24} color="#16A34A" />
          <Text className="text-lg font-bold text-slate-800">My Children ({myChildren?.length || 0})</Text>
        </View>

        {isLoadingChildren ? (
          <ActivityIndicator size="large" color="#16A34A" className="py-4" />
        ) : myChildren && myChildren.length > 0 ? (
          //  3. Map through the children list
          <View className="gap-3">
            {myChildren.map((child: any) => (
              <View key={child.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex-row justify-between items-center">
                <View>
                  <Text className="text-lg font-bold text-slate-800">{child.child_name}</Text>
                  <Text className="text-slate-500 text-sm">
                    <Ionicons name="school" size={14} /> {child.school_name || 'Unknown School'}
                  </Text>
                </View>
                
                {/* Status Indicator for Card ID */}
                <View className={`px-3 py-1 rounded-full ${child.card_id ? 'bg-green-100' : 'bg-orange-100'}`}>
                  <Text className={`text-xs font-bold ${child.card_id ? 'text-green-700' : 'text-orange-700'}`}>
                    {child.card_id ? 'Active' : 'No Card'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-slate-500 text-center py-4">
             You haven't registered any children yet.
          </Text>
        )}
      </View>

    </ScrollView>
  );
}