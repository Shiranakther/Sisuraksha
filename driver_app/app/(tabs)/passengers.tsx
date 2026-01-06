// import React from 'react';
// import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, Linking, Alert, Platform } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import { useDriverChildren } from '@/hooks/useApi';

// export default function DriverPassengersScreen() {
//   const { data: children, isLoading, refetch } = useDriverChildren();

//   // 1. Open Phone Dialer
//   const handleCall = (phoneNumber: string | null) => {
//     if (!phoneNumber) {
//       Alert.alert('No Number', 'Parent has not added a phone number.');
//       return;
//     }
//     Linking.openURL(`tel:${phoneNumber}`);
//   };

//   // 2. Open Maps (Google Maps / Apple Maps)
//   const handleOpenMap = (lat: number, lon: number, label: string) => {
//     if (!lat || !lon) {
//       Alert.alert('No Location', 'Parent has not set a pickup location.');
//       return;
//     }
//     const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
//     const latLng = `${lat},${lon}`;
//     const url = Platform.select({
//       ios: `${scheme}${label}@${latLng}`,
//       android: `${scheme}${latLng}(${label})`
//     });
//     Linking.openURL(url!);
//   };

//   const renderChildCard = ({ item }: { item: any }) => (
//     <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-100 shadow-sm">
      
//       {/* Header: Name & School */}
//       <View className="flex-row justify-between items-start mb-3">
//         <View>
//           <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
//           <View className="flex-row items-center mt-1">
//             <Ionicons name="school" size={14} color="#64748b" />
//             <Text className="text-slate-500 text-sm ml-1">{item.school_name}</Text>
//           </View>
//         </View>
//         <View className={`px-2 py-1 rounded-lg ${item.card_id ? 'bg-green-100' : 'bg-red-100'}`}>
//            <Text className={`text-xs font-bold ${item.card_id ? 'text-green-700' : 'text-red-700'}`}>
//              {item.card_id ? 'Card Linked' : 'No Card'}
//            </Text>
//         </View>
//       </View>

//       <View className="h-[1px] bg-slate-100 mb-3" />

//       {/* Parent & Address Info */}
//       <View className="mb-4">
//         <Text className="text-xs text-slate-400 font-bold uppercase mb-1">Parent Info</Text>
//         <Text className="text-slate-700">{item.parent_first_name} {item.parent_last_name}</Text>
//         <Text className="text-slate-500 text-sm mt-1" numberOfLines={1}>
//            <Ionicons name="location-sharp" size={12} /> {item.pickup_address || "No address set"}
//         </Text>
//       </View>

//       {/* Action Buttons */}
//       <View className="flex-row gap-3">
//         <TouchableOpacity 
//           onPress={() => handleCall(item.parent_phone)}
//           className="flex-1 bg-slate-100 p-3 rounded-xl flex-row justify-center items-center"
//         >
//           <Ionicons name="call" size={18} color="#1e293b" />
//           <Text className="ml-2 font-bold text-slate-700">Call</Text>
//         </TouchableOpacity>

//         <TouchableOpacity 
//           onPress={() => handleOpenMap(item.pickup_lat, item.pickup_lon, item.pickup_address)}
//           className="flex-1 bg-indigo-50 p-3 rounded-xl flex-row justify-center items-center border border-indigo-100"
//         >
//           <Ionicons name="navigate" size={18} color="#4F46E5" />
//           <Text className="ml-2 font-bold text-indigo-700">Map</Text>
//         </TouchableOpacity>
//       </View>
//     </View>
//   );

//   return (
//     <View className="flex-1 bg-slate-50 pt-16 px-5">
//       <View className="mb-6">
//         <Text className="text-3xl font-bold text-slate-800">My Passengers</Text>
//         <Text className="text-slate-500">
//            {children?.length || 0} students assigned to your bus
//         </Text>
//       </View>

//       {isLoading ? (
//         <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
//       ) : (
//         <FlatList
//           data={children}
//           keyExtractor={(item) => item.child_id}
//           renderItem={renderChildCard}
//           refreshing={isLoading}
//           onRefresh={refetch}
//           ListEmptyComponent={
//             <View className="items-center justify-center mt-10">
//               <Ionicons name="people-outline" size={64} color="#cbd5e1" />
//               <Text className="text-slate-400 mt-4 text-center">No students assigned to you yet.</Text>
//             </View>
//           }
//           contentContainerStyle={{ paddingBottom: 100 }}
//           showsVerticalScrollIndicator={false}
//         />
//       )}
//     </View>
//   );
// }

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, Linking, Alert, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDriverChildren, useTriggerRegistration } from '@/hooks/useApi';

export default function DriverPassengersScreen() {
  const { data: children, isLoading, refetch } = useDriverChildren();
  const triggerMutation = useTriggerRegistration();
  
  // State for filtering
  const [showNoCardOnly, setShowNoCardOnly] = useState(false);

  // Filter Logic
  const displayedChildren = showNoCardOnly 
    ? children?.filter((c: any) => !c.card_id) 
    : children;

  const handleCall = (phoneNumber: string | null) => {
    if (!phoneNumber) return Alert.alert('No Number', 'Parent has not added a phone number.');
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleRegisterCard = (childId: string, childName: string) => {
    Alert.alert(
      'Register Card',
      `Activate IoT device to pair a card for ${childName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Activate', 
          onPress: () => triggerMutation.mutate(childId) 
        }
      ]
    );
  };

  const renderChildCard = ({ item }: { item: any }) => (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-100 shadow-sm">
      
      {/* Header */}
      <View className="flex-row justify-between items-start mb-3">
        <View>
          <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
          <View className="flex-row items-center mt-1">
            <Ionicons name="school" size={14} color="#64748b" />
            <Text className="text-slate-500 text-sm ml-1">{item.school_name}</Text>
          </View>
        </View>
        <View className={`px-2 py-1 rounded-lg ${item.card_id ? 'bg-green-100' : 'bg-red-100'}`}>
           <Text className={`text-xs font-bold ${item.card_id ? 'text-green-700' : 'text-red-700'}`}>
             {item.card_id ? 'Card Linked' : 'No Card'}
           </Text>
        </View>
      </View>

      {/* Parent Info */}
      <View className="mb-4 bg-slate-50 p-3 rounded-xl">
        <Text className="text-xs text-slate-400 font-bold uppercase mb-1">Parent Contact</Text>
        <Text className="text-slate-700 font-medium">{item.parent_first_name} {item.parent_last_name}</Text>
        <Text className="text-slate-500 text-xs mt-1">{item.pickup_address || "No address"}</Text>
      </View>

      {/* Action Buttons */}
      <View className="flex-row gap-3">
        {/* Call Button */}
        <TouchableOpacity 
          onPress={() => handleCall(item.parent_phone)}
          className="flex-1 bg-slate-100 p-3 rounded-xl flex-row justify-center items-center"
        >
          <Ionicons name="call" size={18} color="#1e293b" />
          <Text className="ml-2 font-bold text-slate-700">Call</Text>
        </TouchableOpacity>

        {/* Dynamic Action Button */}
        {!item.card_id ? (
          // IF NO CARD: Show Register Button
          <TouchableOpacity 
            onPress={() => handleRegisterCard(item.child_id, item.child_name)}
            disabled={triggerMutation.isPending}
            className="flex-[2] bg-orange-500 p-3 rounded-xl flex-row justify-center items-center shadow-sm shadow-orange-200"
          >
            {triggerMutation.isPending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Ionicons name="radio" size={18} color="white" />
                <Text className="ml-2 font-bold text-white">Link RFID Card</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          // IF CARD EXISTS: Show Map Button
          <TouchableOpacity 
            className="flex-1 bg-indigo-50 p-3 rounded-xl flex-row justify-center items-center border border-indigo-100"
          >
            <Ionicons name="checkmark-circle" size={18} color="#4F46E5" />
            <Text className="ml-2 font-bold text-indigo-700">Linked</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 pt-16 px-5">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-slate-800">My Passengers</Text>
        <Text className="text-slate-500 mb-4">Manage student cards & pickup</Text>

        {/* Filter Toggle */}
        <View className="flex-row items-center justify-between bg-white p-3 rounded-xl border border-slate-100">
          <Text className="font-bold text-slate-700">Show Missing Cards Only</Text>
          <Switch 
            value={showNoCardOnly} 
            onValueChange={setShowNoCardOnly}
            trackColor={{ false: "#cbd5e1", true: "#F97316" }}
          />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
          data={displayedChildren}
          keyExtractor={(item) => item.child_id}
          renderItem={renderChildCard}
          refreshing={isLoading}
          onRefresh={refetch}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <Text className="text-center text-slate-400 mt-10">No students found.</Text>
          }
        />
      )}
    </View>
  );
}