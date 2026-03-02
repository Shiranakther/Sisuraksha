import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, SafeAreaView } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { useProfile, useUpdateProfile, useDeleteProfile } from '../../hooks/useApi';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateMutation = useUpdateProfile();
  const deleteMutation = useDeleteProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    address: ''
  });

  // Populate form when profile data loads
  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        address: profile.address || ''
      });
    }
  }, [profile]);

  const handleSave = () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      Alert.alert('Validation Error', 'First name and last name are required.');
      return;
    }

    updateMutation.mutate(formData, {
      onSuccess: () => setIsEditing(false)
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Account',
      'Are you absolutely sure you want to delete your account? This action is irreversible and all your data will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Permanently', 
          style: 'destructive',
          onPress: () => deleteMutation.mutate() 
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      
      {/* Header */}
      <View className="px-6 pt-6 pb-4 flex-row items-center border-b border-slate-100 bg-white">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2 bg-slate-50 rounded-full">
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-800">My Profile</Text>
      </View>

      <ScrollView className="flex-1 p-6" contentContainerStyle={{ paddingBottom: 60 }}>
        
        {/* Profile Avatar Area */}
        <View className="items-center mb-8 mt-4">
          <View className="w-24 h-24 bg-blue-100 rounded-full items-center justify-center mb-4 border-4 border-white shadow-sm">
            <Text className="text-4xl font-bold text-blue-600">
              {profile?.first_name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text className="text-2xl font-bold text-slate-800">
            {profile?.first_name} {profile?.last_name}
          </Text>
          <Text className="text-slate-500 mt-1">{user?.email}</Text>
          <View className="bg-slate-200 px-3 py-1 rounded-full mt-3">
             <Text className="text-xs font-bold text-slate-600 uppercase tracking-widest">{profile?.role}</Text>
          </View>
        </View>

        {/* Profile Details Form Card */}
        <View className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-8">
          <View className="flex-row justify-between items-center mb-6 border-b border-slate-100 pb-4">
             <Text className="text-lg font-bold text-slate-800">Personal Details</Text>
             <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
               <Text className="text-blue-600 font-bold">{isEditing ? 'Cancel' : 'Edit'}</Text>
             </TouchableOpacity>
          </View>

          {/* First Name */}
          <View className="mb-4">
            <Text className="text-xs font-bold text-slate-400 uppercase mb-2 ml-1">First Name</Text>
            {isEditing ? (
              <TextInput 
                value={formData.first_name}
                onChangeText={(val) => setFormData({...formData, first_name: val})}
                className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-800 font-medium"
              />
            ) : (
              <Text className="text-base text-slate-800 ml-1 font-medium">{profile?.first_name}</Text>
            )}
          </View>

          {/* Last Name */}
          <View className="mb-4">
            <Text className="text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Last Name</Text>
            {isEditing ? (
              <TextInput 
                value={formData.last_name}
                onChangeText={(val) => setFormData({...formData, last_name: val})}
                className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-800 font-medium"
              />
            ) : (
              <Text className="text-base text-slate-800 ml-1 font-medium">{profile?.last_name}</Text>
            )}
          </View>

          {/* Address */}
          <View className="mb-2">
            <Text className="text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Home Address</Text>
            {isEditing ? (
              <TextInput 
                value={formData.address}
                onChangeText={(val) => setFormData({...formData, address: val})}
                placeholder="Enter address"
                className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-800 font-medium"
              />
            ) : (
              <Text className="text-base text-slate-800 ml-1 font-medium">{profile?.address || 'No address provided'}</Text>
            )}
          </View>

          {/* Save Button (Only when editing) */}
          {isEditing && (
            <TouchableOpacity 
              onPress={handleSave}
              disabled={updateMutation.isPending}
              className="bg-blue-600 p-4 rounded-xl items-center mt-6 shadow-sm shadow-blue-200 flex-row justify-center"
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="white" style={{ marginRight: 8 }} />
                  <Text className="text-white font-bold text-base">Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Danger Zone */}
        <View className="mt-4 mb-8">
           <Text className="text-xs font-bold text-red-500 uppercase mb-3 ml-2 tracking-widest">Danger Zone</Text>
           <TouchableOpacity 
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-red-50 p-5 rounded-2xl border border-red-200 flex-row items-center justify-center"
           >
             {deleteMutation.isPending ? (
               <ActivityIndicator color="#EF4444" />
             ) : (
               <>
                 <Ionicons name="trash-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                 <Text className="text-red-600 font-bold text-base">Delete Account Permanently</Text>
               </>
             )}
           </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
