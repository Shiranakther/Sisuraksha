import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyChildren, useFaceStatus, useDeleteFace } from '../../hooks/useApi';
import FaceRegistration from '../../components/FaceRegistration';

// ── Per-child face status badge ──────────────────────────────────────────────
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
        {data?.is_face_registered ? `Face (${data.embedding_count})` : 'No Face'}
      </Text>
    </View>
  );
}

// ── Child Card ───────────────────────────────────────────────────────────────
function ChildCard({
  child,
  onRegisterFace,
}: {
  child: any;
  onRegisterFace: (child: any) => void;
}) {
  const { data: faceData } = useFaceStatus(child.id);
  const deleteFace = useDeleteFace();

  return (
    <View className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-4">
      {/* Top Row */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <View className="w-12 h-12 bg-purple-100 rounded-full items-center justify-center mr-3">
            <Text className="text-xl">👶</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-800">{child.child_name}</Text>
            <Text className="text-xs text-slate-400 mt-0.5">
              {child.school_name || 'No school assigned'}
            </Text>
          </View>
        </View>
        <FaceStatusBadge childId={child.id} />
      </View>

      {/* Info Row */}
      <View className="flex-row gap-2 mb-3">
        {child.assigned_vehicle_number ? (
          <View className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-lg">
            <Ionicons name="bus" size={13} color="#2563EB" />
            <Text className="text-xs font-semibold text-blue-700 ml-1">{child.assigned_vehicle_number}</Text>
          </View>
        ) : (
          <View className="flex-row items-center bg-slate-100 px-3 py-1.5 rounded-lg">
            <Ionicons name="bus-outline" size={13} color="#94A3B8" />
            <Text className="text-xs text-slate-400 ml-1">No bus assigned</Text>
          </View>
        )}
        {child.card_id ? (
          <View className="flex-row items-center bg-green-50 px-3 py-1.5 rounded-lg">
            <Ionicons name="card" size={13} color="#16A34A" />
            <Text className="text-xs font-semibold text-green-700 ml-1">Card Linked</Text>
          </View>
        ) : (
          <View className="flex-row items-center bg-red-50 px-3 py-1.5 rounded-lg">
            <Ionicons name="card-outline" size={13} color="#EF4444" />
            <Text className="text-xs text-red-500 ml-1">No Card</Text>
          </View>
        )}
      </View>

      {/* Face Registration Actions */}
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={() => onRegisterFace(child)}
          className="flex-1 bg-blue-500 rounded-xl py-3 flex-row items-center justify-center"
        >
          <Ionicons name="camera" size={16} color="white" />
          <Text className="text-white font-bold text-sm ml-2">
            {faceData?.is_face_registered ? 'Re-register Face' : 'Register Face'}
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

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function ParentScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { data: children, isLoading, refetch, isRefetching } = useMyChildren();
  const [selectedChild, setSelectedChild] = useState<any>(null);
  const [showFaceModal, setShowFaceModal] = useState(false);

  if (user?.role !== 'Parent') return <Redirect href="/(tabs)/home" />;

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
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View
        className="px-6 pb-4 bg-white shadow-sm border-b border-slate-100"
        style={{ paddingTop: Math.max(insets.top, 20) + 16 }}
      >
        <Text className="text-sm font-bold text-slate-400 tracking-wider uppercase mb-1">Parent</Text>
        <Text className="text-2xl font-bold text-slate-800">My Children</Text>
      </View>

      {/* List */}
      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#3B82F6" className="mt-16" />
        ) : !children || children.length === 0 ? (
          <View className="items-center justify-center mt-16">
            <Ionicons name="people-outline" size={64} color="#CBD5E1" />
            <Text className="text-slate-400 mt-4 text-base font-medium">No children registered yet.</Text>
          </View>
        ) : (
          <>
            <Text className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-4">
              {children.length} {children.length === 1 ? 'child' : 'children'} registered
            </Text>
            {children.map((child: any) => (
              <ChildCard key={child.id} child={child} onRegisterFace={handleRegisterFace} />
            ))}
          </>
        )}
      </ScrollView>

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
    </View>
  );
}