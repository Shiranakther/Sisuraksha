import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, RefreshControl, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useSchools, useRegisterChild, useMyChildren, useFaceStatus, useDeleteFace } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import FaceRegistration from '@/components/FaceRegistration';

// --- Face Status Badge ---
function FaceStatusBadge({ childId }: { childId: string }) {
  const { data, isLoading } = useFaceStatus(childId);
  if (isLoading) return <ActivityIndicator size="small" color="#94A3B8" />;
  return (
    <View className={`flex-row items-center px-2 py-1 rounded-lg ${data?.is_face_registered ? 'bg-green-100' : 'bg-amber-100'}`}>
      <Ionicons
        name={data?.is_face_registered ? 'scan' : 'scan-outline'}
        size={12}
        color={data?.is_face_registered ? '#16A34A' : '#D97706'}
      />
      <Text className={`text-xs font-bold ml-1 ${data?.is_face_registered ? 'text-green-700' : 'text-amber-700'}`}>
        {data?.is_face_registered ? `Face ✓` : 'No Face'}
      </Text>
    </View>
  );
}

export default function ParentDashboard() {
  const [childName, setChildName] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [showFaceModal, setShowFaceModal] = useState(false);

  const queryClient = useQueryClient();

  // --- API Hooks ---
  const { data: schools, isLoading: isLoadingSchools } = useSchools();
  const { data: myChildren, isLoading: isLoadingChildren, refetch } = useMyChildren();
  const registerChildMutation = useRegisterChild();
  const deleteFace = useDeleteFace();

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
        queryClient.invalidateQueries({ queryKey: ['myChildren'] });
      }
    });
  };

  const handleRegisterFace = (child: any) => {
    setSelectedChild(child);
    setShowFaceModal(true);
  };

  const handleFaceComplete = () => {
    setShowFaceModal(false);
    setSelectedChild(null);
    refetch();
  };

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 60 }}
      refreshControl={<RefreshControl refreshing={isLoadingChildren} onRefresh={refetch} />}
    >

      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-slate-800">Child Management</Text>
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
          <View className="gap-3">
            {myChildren.map((child: any) => (
              <ChildCardWithFace
                key={child.id}
                child={child}
                onRegisterFace={handleRegisterFace}
                deleteFace={deleteFace}
              />
            ))}
          </View>
        ) : (
          <Text className="text-slate-500 text-center py-4">
            You haven't registered any children yet.
          </Text>
        )}
      </View>

      {/* Face Registration Modal */}
      <Modal
        visible={showFaceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFaceModal(false)}
      >
        {selectedChild && (
          <FaceRegistration
            childId={selectedChild.id}
            childName={selectedChild.child_name}
            onComplete={handleFaceComplete}
            onCancel={() => setShowFaceModal(false)}
          />
        )}
      </Modal>

    </ScrollView>
  );
}

// --- Child Card with Face Registration ---
function ChildCardWithFace({ child, onRegisterFace, deleteFace }: { child: any; onRegisterFace: (c: any) => void; deleteFace: any }) {
  const { data: faceData } = useFaceStatus(child.id);

  return (
    <View className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      {/* Top Row: Name + Status Badges */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-800">{child.child_name}</Text>
          <Text className="text-slate-500 text-sm">
            <Ionicons name="school" size={14} /> {child.school_name || 'Unknown School'}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <FaceStatusBadge childId={child.id} />
          <View className={`px-2 py-1 rounded-lg ${child.card_id ? 'bg-green-100' : 'bg-orange-100'}`}>
            <Text className={`text-xs font-bold ${child.card_id ? 'text-green-700' : 'text-orange-700'}`}>
              {child.card_id ? 'Card ✓' : 'No Card'}
            </Text>
          </View>
        </View>
      </View>

      {/* Face Registration Action Buttons */}
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => onRegisterFace(child)}
          className="flex-1 bg-blue-500 rounded-xl py-3 flex-row items-center justify-center"
        >
          <Ionicons name="camera" size={16} color="white" />
          <Text className="text-white font-bold text-sm ml-2">
            {faceData?.is_face_registered ? 'Re-register Face' : ' Register Face'}
          </Text>
        </TouchableOpacity>

        {faceData?.is_face_registered && (
          <TouchableOpacity
            onPress={() => deleteFace.mutate(child.id)}
            disabled={deleteFace.isPending}
            className="bg-red-50 border border-red-200 rounded-xl px-3 items-center justify-center"
          >
            {deleteFace.isPending ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

