import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../auth/useAuth';
import { 
  useDriverProfile, 
  useUpdateDriverProfile, 
  useDeleteDriverProfile 
} from '../../hooks/useApi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DriverProfileScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: profile, isLoading, isError, refetch } = useDriverProfile();
  const updateMutation = useUpdateDriverProfile();
  const deleteMutation = useDeleteDriverProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    address: '',
    license_number: '',
  });

  // Sync form data when profile is pulled
  useEffect(() => {
    if (profile && !isEditing) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        address: profile.address || '',
        license_number: profile.license_number || '',
      });
    }
  }, [profile, isEditing]);

  const handleSave = () => {
    if (!formData.first_name || !formData.last_name) {
      Alert.alert("Validation Error", "First and last name are required.");
      return;
    }
    updateMutation.mutate(formData, {
      onSuccess: () => setIsEditing(false)
    });
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Profile",
      "Are you sure you want to permanently delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: () => deleteMutation.mutate() 
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (isError || !profile) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 p-6">
        <Text className="text-red-500 mb-4 text-center">Failed to load profile data.</Text>
        <TouchableOpacity onPress={() => refetch()} className="bg-orange-600 px-6 py-3 rounded-lg">
          <Text className="text-white font-bold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      
      {/* Header */}
      <View 
        className="px-6 pb-4 bg-white shadow-sm border-b border-slate-100 flex-row items-center justify-between"
        style={{ paddingTop: Math.max(insets.top, 20) + 16 }}
      >
        <TouchableOpacity 
           onPress={() => router.back()}
           className="w-10 h-10 items-center justify-center -ml-2"
        >
          <Ionicons name="arrow-back" size={24} color="#334155" />
        </TouchableOpacity>
        
        <Text className="text-xl font-bold text-slate-800">My Profile</Text>
        
        <TouchableOpacity 
          onPress={() => {
            if (isEditing) handleSave();
            else setIsEditing(true);
          }}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#EA580C" />
          ) : (
            <Text className={`font-bold text-base ${isEditing ? 'text-green-600' : 'text-orange-600'}`}>
              {isEditing ? 'Save' : 'Edit'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 pt-6 pb-12">
        
        {/* Profile Avatar Header */}
        <View className="items-center mb-8">
          <View className="w-24 h-24 bg-orange-100 rounded-full items-center justify-center border-4 border-white shadow-sm mb-4">
            <Ionicons name="person" size={48} color="#EA580C" />
          </View>
          <Text className="text-2xl font-bold text-slate-800">
            {profile.first_name} {profile.last_name}
          </Text>
          <Text className="text-slate-500 font-medium tracking-wide uppercase text-xs mt-1">
             {profile.role}
          </Text>
        </View>

        {/* Info Card */}
        <View className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6">
          <Text className="text-lg font-bold text-slate-800 mb-4">Personal Details</Text>
          
          <View className="space-y-4">
            {/* Email (Read Only always) */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Email (Read Only)</Text>
              <Text className="text-base text-slate-800">{profile.email}</Text>
            </View>

            {/* Name Fields */}
            {isEditing ? (
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">First Name</Text>
                  <TextInput
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800"
                    value={formData.first_name}
                    onChangeText={(t) => setFormData({...formData, first_name: t})}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Last Name</Text>
                  <TextInput
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800"
                    value={formData.last_name}
                    onChangeText={(t) => setFormData({...formData, last_name: t})}
                  />
                </View>
              </View>
            ) : null}

            {/* Address */}
            <View className="mb-4">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Home Address</Text>
              {isEditing ? (
                <TextInput
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800"
                  value={formData.address}
                  onChangeText={(t) => setFormData({...formData, address: t})}
                />
              ) : (
                <Text className="text-base text-slate-800">{profile.address || 'Not provided'}</Text>
              )}
            </View>

            {/* License Number */}
            <View className="mb-2">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">License Number</Text>
              {isEditing ? (
                <TextInput
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800"
                  value={formData.license_number}
                  onChangeText={(t) => setFormData({...formData, license_number: t})}
                />
              ) : (
                <Text className="text-base text-slate-800">{profile.license_number || 'Not provided'}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Assigned Vehicle Card (Read Only) */}
        {!isEditing && (
          <View className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-8">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned Vehicle</Text>
                <Text className="text-lg font-bold text-slate-800">
                  {profile.vehicle_number || "No Vehicle Assigned"}
                </Text>
              </View>
              <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center">
                <Ionicons name="bus" size={24} color="#EA580C" />
              </View>
            </View>
          </View>
        )}

        {/* Danger Zone */}
        {isEditing && (
          <View className="bg-red-50 rounded-2xl p-5 border border-red-100 mb-8">
            <Text className="text-red-800 font-bold mb-2">Danger Zone</Text>
            <Text className="text-red-500 text-sm mb-4">
              Deleting your account will permanently remove all your data and associations.
            </Text>
            <TouchableOpacity 
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-white border border-red-200 py-3 rounded-xl items-center flex-row justify-center"
            >
              {deleteMutation.isPending ? (
                 <ActivityIndicator color="#EF4444" />
              ) : (
                 <>
                   <Ionicons name="trash-outline" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                   <Text className="text-red-600 font-bold text-base">Delete Account</Text>
                 </>
              )}
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}
