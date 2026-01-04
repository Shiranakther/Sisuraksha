
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMyChildren, useMyLocation, useFindRoutes, useAssignDriver } from '@/hooks/useApi';
import { Picker } from '@react-native-picker/picker';

export default function AssignBusScreen() {
  // --- State 
  const [selectedChildId, setSelectedChildId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isReassigning, setIsReassigning] = useState(false); // New state to toggle views

  // --- Data Hooks ---
  const { data: myChildren, isLoading: isLoadingChildren } = useMyChildren();
  const { data: myLocation, isLoading: isLoadingLocation } = useMyLocation();
  
  const findRoutesMutation = useFindRoutes();
  const assignDriverMutation = useAssignDriver();

  // Helper: Get the full object of the selected child
  const selectedChild = myChildren?.find((c: any) => c.id === selectedChildId);

  // Reset search/reassign state when child changes
  useEffect(() => {
    setSearchResults([]);
    setIsReassigning(false);
  }, [selectedChildId]);

  // --- Handlers ---
  const handleSearch = () => {
    if (!selectedChildId) {
      Alert.alert('Select Child', 'Please select a child first.');
      return;
    }
    if (!myLocation?.latitude) {
      Alert.alert('Location Missing', 'Please update your location on the Home screen.');
      return;
    }
    if (!selectedChild?.school_id) {
      Alert.alert('Error', 'Child has no school linked.');
      return;
    }

    findRoutesMutation.mutate(
      {
        parentLat: parseFloat(myLocation.latitude),
        parentLon: parseFloat(myLocation.longitude),
        schoolId: selectedChild.school_id,
      },
      {
        onSuccess: (data) => {
          setSearchResults(data);
          if (data.length === 0) Alert.alert('No Routes', 'No drivers found near you.');
        },
      }
    );
  };

  const handleAssign = (driverId: string, vehicleNumber: string) => {
    Alert.alert('Confirm', `Assign bus ${vehicleNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Assign',
        onPress: () => {
          assignDriverMutation.mutate({ childId: selectedChildId, driverId }, {
            onSuccess: () => {
               // Reset UI to show "Current Driver" view
               setIsReassigning(false);
               setSearchResults([]);
            }
          });
        },
      },
    ]);
  };

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      
      <View className="mb-6">
        <Text className="text-3xl font-bold text-slate-800">Bus Assignment</Text>
        <Text className="text-base text-slate-500">Manage your child's transport</Text>
      </View>

      {/* --- 1. Select Child --- */}
      <View className="bg-white rounded-2xl p-5 shadow-sm shadow-slate-200 mb-6">
        <Text className="text-sm font-bold text-slate-400 uppercase mb-2">Select Child</Text>
        {isLoadingChildren ? (
          <ActivityIndicator color="#4F46E5" />
        ) : (
          <View className="bg-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            <Picker
              selectedValue={selectedChildId}
              onValueChange={setSelectedChildId}
            >
              <Picker.Item label="Select a child..." value="" color="#94a3b8" />
              {myChildren?.map((child: any) => (
                <Picker.Item 
                  key={child.id} 
                  label={`${child.child_name}`} 
                  value={child.id} 
                />
              ))}
            </Picker>
          </View>
        )}
      </View>

      {/* --- Logic: Show Current Driver OR Search --- */}
      {selectedChild && (
        <View>
          {/* A. If Child has a Driver AND we are not reassigning -> Show Status Card */}
          {selectedChild.assigned_driver_id && !isReassigning ? (
            <View className="bg-green-50 border border-green-200 p-6 rounded-2xl items-center mb-6">
              <View className="bg-green-100 p-4 rounded-full mb-3">
                <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
              </View>
              <Text className="text-lg font-bold text-slate-800 mb-1">Bus Assigned</Text>
              <Text className="text-slate-500 mb-4">
                Current Bus: <Text className="font-bold text-slate-800">{selectedChild.assigned_vehicle_number || 'Unknown'}</Text>
              </Text>
              
              <TouchableOpacity 
                onPress={() => setIsReassigning(true)}
                className="bg-white border border-slate-300 px-6 py-3 rounded-xl"
              >
                <Text className="font-bold text-slate-700">Change / Reassign</Text>
              </TouchableOpacity>
            </View>
          ) : (
            
            /* B. If No Driver OR Reassigning -> Show Search UI */
            <View>
              <TouchableOpacity
                onPress={handleSearch}
                disabled={findRoutesMutation.isPending}
                className="bg-indigo-600 p-4 rounded-xl items-center shadow-lg shadow-indigo-200 mb-8 flex-row justify-center"
              >
                {findRoutesMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={20} color="white" style={{ marginRight: 8 }} />
                    <Text className="text-white font-bold text-lg">
                      {isReassigning ? 'Find New Routes' : 'Find Nearest Drivers'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Cancel Button (Only if reassigning) */}
              {isReassigning && (
                <TouchableOpacity onPress={() => setIsReassigning(false)} className="items-center mb-6">
                  <Text className="text-slate-400">Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* --- 3. Search Results List --- */}
      {searchResults.length > 0 && (
        <View>
          <Text className="text-lg font-bold text-slate-800 mb-4">Available Drivers</Text>
          {searchResults.map((driver) => (
            <View 
              key={driver.id} 
              className="bg-white rounded-2xl p-4 mb-4 border border-slate-100 shadow-sm flex-row items-center justify-between"
            >
              <View className="flex-1">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="bus" size={20} color="#F59E0B" />
                  <Text className="text-lg font-bold text-slate-800 ml-2">{driver.vehicle_number}</Text>
                </View>
                <Text className="text-slate-500 text-sm">
                  Distance: <Text className="font-bold text-slate-700">{(driver.distance_from_home / 1000).toFixed(2)} km</Text>
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleAssign(driver.id, driver.vehicle_number)}
                disabled={assignDriverMutation.isPending}
                className="bg-slate-800 px-4 py-2 rounded-lg"
              >
                 <Text className="text-white font-bold text-sm">Select</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}