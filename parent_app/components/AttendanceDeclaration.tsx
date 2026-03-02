import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMyChildren, useDeclareAttendance } from '../hooks/useApi';
import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

interface ChildDeclaration {
  child_id: string;
  child_name: string;
  morning_present: boolean;
  evening_present: boolean;
}

export default function AttendanceDeclaration() {
  const { data: children, isLoading: loadingChildren } = useMyChildren();
  const declareMutation = useDeclareAttendance();

  const [declarations, setDeclarations] = useState<ChildDeclaration[]>([]);
  const [loadingDeclarations, setLoadingDeclarations] = useState(false);
  const [updatingChild, setUpdatingChild] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch declarations when children data loads
  useEffect(() => {
    const fetchDeclarations = async () => {
      if (!children || children.length === 0) return;

      setLoadingDeclarations(true);
      try {
        const results = await Promise.all(
          children.map(async (child: any) => {
            try {
              const { data } = await apiClient.get(`${API_ENDPOINTS.GET_DECLARATION}/${child.id}`);
              return {
                child_id: child.id,
                child_name: child.child_name,
                morning_present: data.data?.morning_present ?? true,
                evening_present: data.data?.evening_present ?? true,
              };
            } catch {
              // If API fails (table doesn't exist yet), return defaults
              return {
                child_id: child.id,
                child_name: child.child_name,
                morning_present: true,
                evening_present: true,
              };
            }
          })
        );
        setDeclarations(results);
      } catch (error) {
        // Set default values for all children
        setDeclarations(
          children.map((child: any) => ({
            child_id: child.id,
            child_name: child.child_name,
            morning_present: true,
            evening_present: true,
          }))
        );
      } finally {
        setLoadingDeclarations(false);
      }
    };

    fetchDeclarations();
  }, [children]);

  const handleToggle = async (childId: string, field: 'morningPresent' | 'eveningPresent', currentValue: boolean) => {
    setUpdatingChild(childId);

    // Optimistically update UI
    setDeclarations(prev =>
      prev.map(d =>
        d.child_id === childId
          ? { ...d, [field === 'morningPresent' ? 'morning_present' : 'evening_present']: !currentValue }
          : d
      )
    );

    try {
      await declareMutation.mutateAsync({
        childId,
        [field]: !currentValue,
      });
    } catch {
      // Revert on error
      setDeclarations(prev =>
        prev.map(d =>
          d.child_id === childId
            ? { ...d, [field === 'morningPresent' ? 'morning_present' : 'evening_present']: currentValue }
            : d
        )
      );
    } finally {
      setUpdatingChild(null);
    }
  };

  // Submit all declarations at once
  const handleSubmitAll = async () => {
    if (declarations.length === 0) return;

    setIsSubmitting(true);
    try {
      await Promise.all(
        declarations.map(async (dec) => {
          await declareMutation.mutateAsync({
            childId: dec.child_id,
            morningPresent: dec.morning_present,
            eveningPresent: dec.evening_present,
          });
        })
      );

      // Show success message
      const { Alert } = await import('react-native');
      Alert.alert('Success', 'Attendance saved successfully!');
      setHasChanges(false);
    } catch (error) {
      const { Alert } = await import('react-native');
      Alert.alert('Error', 'Failed to save attendance. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const refetch = async () => {
    if (!children || children.length === 0) return;

    setLoadingDeclarations(true);
    try {
      const results = await Promise.all(
        children.map(async (child: any) => {
          try {
            const { data } = await apiClient.get(`${API_ENDPOINTS.GET_DECLARATION}/${child.id}`);
            return {
              child_id: child.id,
              child_name: child.child_name,
              morning_present: data.data?.morning_present ?? true,
              evening_present: data.data?.evening_present ?? true,
            };
          } catch {
            return {
              child_id: child.id,
              child_name: child.child_name,
              morning_present: true,
              evening_present: true,
            };
          }
        })
      );
      setDeclarations(results);
    } finally {
      setLoadingDeclarations(false);
    }
  };

  if (loadingChildren) {
    return (
      <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <View className="flex-row items-center justify-center">
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text className="text-slate-500 ml-2">Loading children...</Text>
        </View>
      </View>
    );
  }

  if (!children || children.length === 0) {
    return (
      <View className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <View className="flex-row items-center mb-2">
          <View className="bg-blue-100 p-2 rounded-lg mr-3">
            <Ionicons name="bus" size={20} color="#3B82F6" />
          </View>
          <View>
            <Text className="text-slate-700 font-semibold">Bus Attendance</Text>
            <Text className="text-slate-400 text-sm">No children registered yet</Text>
          </View>
        </View>
        <Text className="text-slate-400 text-xs mt-2">
          Register a child first to manage bus attendance.
        </Text>
      </View>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  // Use declarations if available, otherwise map children to defaults
  const childrenWithDeclarations = declarations.length > 0 ? declarations : children.map((child: any) => ({
    child_id: child.id,
    child_name: child.child_name,
    morning_present: true,
    evening_present: true,
  }));

  return (
    <View className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <View style={{ backgroundColor: '#3B82F6' }} className="p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} className="p-2 rounded-lg mr-3">
              <Ionicons name="bus" size={20} color="white" />
            </View>
            <View>
              <Text className="text-white font-bold text-base">Bus Attendance</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)' }} className="text-xs">{today}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={refetch}
            disabled={loadingDeclarations}
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            className="p-2 rounded-lg"
          >
            {loadingDeclarations ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="refresh" size={18} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Children List */}
      <View className="p-4">
        {childrenWithDeclarations.map((child: ChildDeclaration, index: number) => (
          <View
            key={child.child_id}
            className={`${index > 0 ? 'mt-4 pt-4 border-t border-slate-100' : ''}`}
          >
            {/* Child Name */}
            <View className="flex-row items-center mb-3">
              <View className="bg-purple-100 p-2 rounded-full mr-2">
                <Ionicons name="person" size={16} color="#9333EA" />
              </View>
              <Text className="text-slate-800 font-semibold flex-1">{child.child_name}</Text>
              {updatingChild === child.child_id && (
                <ActivityIndicator size="small" color="#3B82F6" />
              )}
            </View>

            {/* Toggle Switches */}
            <View className="flex-row" style={{ gap: 12 }}>
              {/* Morning Trip */}
              <View className="flex-1 bg-orange-50 p-3 rounded-xl border border-orange-100">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Ionicons name="sunny" size={16} color="#EA580C" />
                    <Text className="text-orange-700 font-medium text-xs ml-1">Morning</Text>
                  </View>
                  <Switch
                    value={child.morning_present}
                    onValueChange={() => handleToggle(child.child_id, 'morningPresent', child.morning_present)}
                    trackColor={{ false: '#FED7AA', true: '#86EFAC' }}
                    thumbColor={child.morning_present ? '#22C55E' : '#F97316'}
                    disabled={updatingChild === child.child_id}
                  />
                </View>
                <Text className={`text-xs mt-1 ${child.morning_present ? 'text-green-600' : 'text-orange-600'}`}>
                  {child.morning_present ? '✓ Taking bus to school' : '✗ Not taking bus'}
                </Text>
              </View>

              {/* Evening Trip */}
              <View className="flex-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Ionicons name="moon" size={16} color="#4F46E5" />
                    <Text className="text-indigo-700 font-medium text-xs ml-1">Evening</Text>
                  </View>
                  <Switch
                    value={child.evening_present}
                    onValueChange={() => handleToggle(child.child_id, 'eveningPresent', child.evening_present)}
                    trackColor={{ false: '#C7D2FE', true: '#86EFAC' }}
                    thumbColor={child.evening_present ? '#22C55E' : '#6366F1'}
                    disabled={updatingChild === child.child_id}
                  />
                </View>
                <Text className={`text-xs mt-1 ${child.evening_present ? 'text-green-600' : 'text-indigo-600'}`}>
                  {child.evening_present ? '✓ Taking bus home' : '✗ Not taking bus'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Submit Button */}
      <View className="p-4 border-t border-slate-100">
        <TouchableOpacity
          onPress={handleSubmitAll}
          disabled={isSubmitting}
          style={{ backgroundColor: isSubmitting ? '#94A3B8' : '#22C55E' }}
          className="p-4 rounded-xl flex-row items-center justify-center"
        >
          {isSubmitting ? (
            <>
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white font-bold ml-2">Saving...</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text className="text-white font-bold ml-2">Submit Attendance</Text>
            </>
          )}
        </TouchableOpacity>
        <Text className="text-slate-400 text-xs text-center mt-2">
          Confirm your child's bus attendance for today
        </Text>
      </View>
    </View>
  );
}
