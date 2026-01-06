// import React, { useState } from 'react';
// import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
// import { Picker } from '@react-native-picker/picker';
// import { Ionicons } from '@expo/vector-icons';
// import DateTimePicker from '@react-native-community/datetimepicker';
// import { useRouter } from 'expo-router';
// import { useParentAttendance, useMyChildren } from '@/hooks/useApi';

// export default function ParentAttendanceScreen() {
//   const router = useRouter();

//   // --- State for Filters ---
//   const [selectedChildId, setSelectedChildId] = useState(''); // Empty = All Children
//   const [selectedDate, setSelectedDate] = useState(new Date());
//   const [showDatePicker, setShowDatePicker] = useState(false);

//   // Format date for API (YYYY-MM-DD)
//   const dateString = selectedDate.toISOString().split('T')[0];

//   // --- Data Fetching ---
//   // 1. Get list of children for the dropdown
//   const { data: myChildren } = useMyChildren();

//   // 2. Get attendance logs based on filters
//   const { 
//     data: logs, 
//     isLoading, 
//     refetch 
//   } = useParentAttendance({ 
//     childId: selectedChildId, 
//     date: dateString 
//   });

//   // --- Render Single Log Card ---
//   const renderAttendanceCard = ({ item }: { item: any }) => (
//     <View className="bg-white p-4 mb-4 rounded-2xl border border-slate-100 shadow-sm">
      
//       {/* Header: Child Name & Status */}
//       <View className="flex-row justify-between items-center mb-3">
//         <View className="flex-row items-center gap-2">
//           <View className="bg-indigo-100 p-2 rounded-full">
//             <Ionicons name="person" size={16} color="#4F46E5" />
//           </View>
//           <View>
//             <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
//             <Text className="text-xs text-slate-400">{item.school_name}</Text>
//           </View>
//         </View>

//         {/* Status Badge */}
//         <View className={`px-2 py-1 rounded-lg ${item.is_present ? 'bg-green-100' : 'bg-red-100'}`}>
//           <Text className={`text-xs font-bold ${item.is_present ? 'text-green-700' : 'text-red-700'}`}>
//             {item.is_present ? 'Present' : 'Absent'}
//           </Text>
//         </View>
//       </View>

//       {/* Grid: Morning & Evening Times */}
//       <View className="flex-row gap-3">
        
//         {/* Morning Block */}
//         <View className="flex-1 bg-orange-50 p-3 rounded-xl border border-orange-100">
//           <View className="flex-row items-center mb-2">
//             <Ionicons name="sunny" size={14} color="#EA580C" />
//             <Text className="text-xs font-bold text-orange-700 ml-1">MORNING</Text>
//           </View>
//           <View className="flex-row justify-between">
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Pickup</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.morning_pickup_time || '--:--'}</Text>
//             </View>
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Drop</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.morning_drop_time || '--:--'}</Text>
//             </View>
//           </View>
//         </View>

//         {/* Evening Block */}
//         <View className="flex-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
//           <View className="flex-row items-center mb-2">
//             <Ionicons name="moon" size={14} color="#4F46E5" />
//             <Text className="text-xs font-bold text-indigo-700 ml-1">EVENING</Text>
//           </View>
//           <View className="flex-row justify-between">
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Pickup</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.evening_pickup_time || '--:--'}</Text>
//             </View>
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Drop</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.evening_drop_time || '--:--'}</Text>
//             </View>
//           </View>
//         </View>

//       </View>

//       {/* Footer: Date */}
//       <View className="mt-3 pt-3 border-t border-slate-100 flex-row justify-between items-center">
//         <Text className="text-xs text-slate-400">Date Logged:</Text>
//         <Text className="text-xs font-bold text-slate-600">
//           {new Date(item.date).toDateString()}
//         </Text>
//       </View>
//     </View>
//   );

//   return (
//     <View className="flex-1 bg-slate-50">
      
//       {/* --- Top Header --- */}
//       <View className="pt-14 px-5 pb-4 bg-white shadow-sm z-10">
//         <View className="flex-row items-center mb-4">
//           <TouchableOpacity onPress={() => router.back()} className="mr-3">
//             <Ionicons name="arrow-back" size={24} color="#333" />
//           </TouchableOpacity>
//           <Text className="text-2xl font-bold text-slate-800">Attendance History</Text>
//         </View>

//         {/* Filters Container */}
//         <View className="flex-row gap-3">
          
//           {/* Child Selector Dropdown */}
//           <View className="flex-1 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden h-12 justify-center">
//             <Picker
//               selectedValue={selectedChildId}
//               onValueChange={(val) => setSelectedChildId(val)}
//               style={{ width: '100%', marginLeft: -5 }} 
//               mode="dropdown"
//             >
//               <Picker.Item label="All Children" value="" color="#64748b" style={{ fontSize: 14 }} />
//               {myChildren?.map((child: any) => (
//                 <Picker.Item 
//                   key={child.id} 
//                   label={child.child_name.split(' ')[0]} // Show first name for space
//                   value={child.id} 
//                   style={{ fontSize: 14 }}
//                 />
//               ))}
//             </Picker>
//           </View>

//           {/* Date Picker Button */}
//           <TouchableOpacity 
//             onPress={() => setShowDatePicker(true)}
//             className="flex-1 bg-slate-100 rounded-xl border border-slate-200 h-12 flex-row items-center justify-center px-2"
//           >
//             <Ionicons name="calendar-outline" size={18} color="#475569" />
//             <Text className="ml-2 text-slate-700 font-semibold text-xs">
//               {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
//             </Text>
//           </TouchableOpacity>
//         </View>
//       </View>

//       {/* Date Picker Modal */}
//       {showDatePicker && (
//         <DateTimePicker
//           value={selectedDate}
//           mode="date"
//           display="default"
//           onChange={(event, date) => {
//             setShowDatePicker(false);
//             if (date) setSelectedDate(date);
//           }}
//         />
//       )}

//       {/* --- List Section --- */}
//       {isLoading ? (
//         <View className="flex-1 justify-center items-center">
//           <ActivityIndicator size="large" color="#4F46E5" />
//           <Text className="text-slate-400 mt-4">Loading records...</Text>
//         </View>
//       ) : (
//         <FlatList
//           data={logs}
//           keyExtractor={(item) => item.attendance_id}
//           renderItem={renderAttendanceCard}
//           contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
//           refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
//           ListEmptyComponent={
//             <View className="items-center mt-20 opacity-50">
//               <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
//               <Text className="text-slate-500 mt-4 text-center px-10">
//                 No attendance records found for this date.
//               </Text>
//             </View>
//           }
//         />
//       )}
//     </View>
//   );
// }

// import React, { useState } from 'react';
// import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Linking, Alert } from 'react-native';
// import { Picker } from '@react-native-picker/picker';
// import { Ionicons } from '@expo/vector-icons';
// import DateTimePicker from '@react-native-community/datetimepicker';
// import { useRouter } from 'expo-router';
// import { useParentAttendance, useMyChildren } from '@/hooks/useApi';

// export default function ParentAttendanceScreen() {
//   const router = useRouter();

//   // --- State for Filters ---
//   const [selectedChildId, setSelectedChildId] = useState(''); 
//   const [selectedDate, setSelectedDate] = useState(new Date());
//   const [showDatePicker, setShowDatePicker] = useState(false);

// const offsetMs = (5 * 60 + 30) * 60 * 1000; // 5h 30m in milliseconds
// const localDate = new Date(selectedDate.getTime() + offsetMs);
// const dateString = localDate.toISOString().split('T')[0];


//   // --- Data Fetching ---
//   const { data: myChildren } = useMyChildren();
//   const { data: logs, isLoading, refetch } = useParentAttendance({ 
//     childId: selectedChildId, 
//     date: dateString 
//   });

//   // --- 🗺️ Helper: Open Map (FIXED URL) ---
//   const openMap = (lat: number, lon: number) => {
//     if (!lat || !lon) {
//       Alert.alert("Location Missing", "GPS coordinates were not recorded for this event.");
//       return;
//     }
//     // ✅ Use this standard Google Maps query format
//     const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    
//     Linking.openURL(url).catch(err => {
//         console.error("Couldn't open map", err);
//         Alert.alert("Error", "Could not open map application.");
//     });
//   };

//   // --- Render Single Log Card ---
//   const renderAttendanceCard = ({ item }: { item: any }) => (
//     <View className="bg-white p-4 mb-4 rounded-2xl border border-slate-100 shadow-sm">
      
//       {/* Header: Child Name & Status */}
//       <View className="flex-row justify-between items-center mb-3">
//         <View className="flex-row items-center gap-2">
//           <View className="bg-indigo-100 p-2 rounded-full">
//             <Ionicons name="person" size={16} color="#4F46E5" />
//           </View>
//           <View>
//             <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
//             <Text className="text-xs text-slate-400">{item.school_name}</Text>
//           </View>
//         </View>

//         <View className={`px-2 py-1 rounded-lg ${item.is_present ? 'bg-green-100' : 'bg-red-100'}`}>
//           <Text className={`text-xs font-bold ${item.is_present ? 'text-green-700' : 'text-red-700'}`}>
//             {item.is_present ? 'Present' : 'Absent'}
//           </Text>
//         </View>
//       </View>

//       {/* Grid: Morning & Evening Times */}
//       <View className="flex-row gap-3">
        
//         {/* --- MORNING BLOCK --- */}
//         <View className="flex-1 bg-orange-50 p-3 rounded-xl border border-orange-100">
//           <View className="flex-row items-center mb-2">
//             <Ionicons name="sunny" size={14} color="#EA580C" />
//             <Text className="text-xs font-bold text-orange-700 ml-1">MORNING</Text>
//           </View>
          
//           {/* 1. Morning Pickup */}
//           <View className="flex-row justify-between mb-2">
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Pickup</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.morning_pickup_time || '--:--'}</Text>
//             </View>
//             {item.morning_pickup_lat && (
//               <TouchableOpacity onPress={() => openMap(item.morning_pickup_lat, item.morning_pickup_lon)}>
//                  <Ionicons name="location-sharp" size={20} color="#EA580C" />
//               </TouchableOpacity>
//             )}
//           </View>

//           {/* 2. Morning Drop */}
//           <View className="flex-row justify-between">
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Drop</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.morning_drop_time || '--:--'}</Text>
//             </View>
//             {item.morning_drop_lat && (
//               <TouchableOpacity onPress={() => openMap(item.morning_drop_lat, item.morning_drop_lon)}>
//                  <Ionicons name="location-sharp" size={20} color="#EA580C" />
//               </TouchableOpacity>
//             )}
//           </View>
//         </View>

//         {/* --- EVENING BLOCK --- */}
//         <View className="flex-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
//           <View className="flex-row items-center mb-2">
//             <Ionicons name="moon" size={14} color="#4F46E5" />
//             <Text className="text-xs font-bold text-indigo-700 ml-1">EVENING</Text>
//           </View>

//           {/* 3. Evening Pickup */}
//           <View className="flex-row justify-between mb-2">
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Pickup</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.evening_pickup_time || '--:--'}</Text>
//             </View>
//              {item.evening_pickup_lat && (
//               <TouchableOpacity onPress={() => openMap(item.evening_pickup_lat, item.evening_pickup_lon)}>
//                  <Ionicons name="location-sharp" size={20} color="#4F46E5" />
//               </TouchableOpacity>
//             )}
//           </View>

//           {/* 4. Evening Drop */}
//           <View className="flex-row justify-between">
//             <View>
//               <Text className="text-[10px] text-slate-400 uppercase">Drop</Text>
//               <Text className="text-sm font-bold text-slate-700">{item.evening_drop_time || '--:--'}</Text>
//             </View>
//             {item.evening_drop_lat && (
//               <TouchableOpacity onPress={() => openMap(item.evening_drop_lat, item.evening_drop_lon)}>
//                  <Ionicons name="location-sharp" size={20} color="#4F46E5" />
//               </TouchableOpacity>
//             )}
//           </View>
//         </View>

//       </View>

//       {/* Footer: Date */}
//       <View className="mt-3 pt-3 border-t border-slate-100 flex-row justify-between items-center">
//         <Text className="text-xs text-slate-400">Date Logged:</Text>
//         <Text className="text-xs font-bold text-slate-600">
//           {new Date(item.date).toDateString()}
//         </Text>
//       </View>
//     </View>
//   );

//   return (
//     <View className="flex-1 bg-slate-50">
      
//       {/* --- Top Header --- */}
//       <View className="pt-14 px-5 pb-4 bg-white shadow-sm z-10">
//         <View className="flex-row items-center mb-4">
//           <TouchableOpacity onPress={() => router.back()} className="mr-3">
//             <Ionicons name="arrow-back" size={24} color="#333" />
//           </TouchableOpacity>
//           <Text className="text-2xl font-bold text-slate-800">Attendance History</Text>
//         </View>

//         {/* Filters Container */}
//         <View className="flex-row gap-3">
          
//           {/* Child Selector */}
//           <View className="flex-1 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden h-12 justify-center">
//             <Picker
//               selectedValue={selectedChildId}
//               onValueChange={(val) => setSelectedChildId(val)}
//               style={{ width: '100%', marginLeft: -5 }} 
//               mode="dropdown"
//             >
//               <Picker.Item label="All Children" value="" color="#64748b" style={{ fontSize: 14 }} />
//               {myChildren?.map((child: any) => (
//                 <Picker.Item 
//                   key={child.id} 
//                   label={child.child_name.split(' ')[0]} 
//                   value={child.id} 
//                   style={{ fontSize: 14 }}
//                 />
//               ))}
//             </Picker>
//           </View>

//           {/* Date Picker Button */}
//           <TouchableOpacity 
//             onPress={() => setShowDatePicker(true)}
//             className="flex-1 bg-slate-100 rounded-xl border border-slate-200 h-12 flex-row items-center justify-center px-2"
//           >
//             <Ionicons name="calendar-outline" size={18} color="#475569" />
//             <Text className="ml-2 text-slate-700 font-semibold text-xs">
//               {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
//             </Text>
//           </TouchableOpacity>
//         </View>
//       </View>

//       {/* Date Picker Modal */}
//       {showDatePicker && (
//         <DateTimePicker
//           value={selectedDate}
//           mode="date"
//           display="default"
//           onChange={(event, date) => {
//             setShowDatePicker(false);
//             if (date) setSelectedDate(date);
//           }}
//         />
//       )}

//       {/* --- List Section --- */}
//       {isLoading ? (
//         <View className="flex-1 justify-center items-center">
//           <ActivityIndicator size="large" color="#4F46E5" />
//           <Text className="text-slate-400 mt-4">Loading records...</Text>
//         </View>
//       ) : (
//         <FlatList
//           data={logs}
//           keyExtractor={(item) => item.attendance_id || Math.random().toString()}
//           renderItem={renderAttendanceCard}
//           contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
//           refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
//           ListEmptyComponent={
//             <View className="items-center mt-20 opacity-50">
//               <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
//               <Text className="text-slate-500 mt-4 text-center px-10">
//                 No attendance records found for this date.
//               </Text>
//             </View>
//           }
//         />
//       )}
//     </View>
//   );
// }

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Linking, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useParentAttendance, useMyChildren } from '@/hooks/useApi';

export default function ParentAttendanceScreen() {
  const router = useRouter();

  // --- State for Filters ---
  const [selectedChildId, setSelectedChildId] = useState(''); 
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dateString = selectedDate.toISOString().split('T')[0];

  // --- Data Fetching ---
  const { data: myChildren } = useMyChildren();
  const { data: logs, isLoading, refetch } = useParentAttendance({ 
    childId: selectedChildId, 
    date: dateString 
  });

  // --- 🗺️ Helper: Open Map (FIXED URL) ---
  const openMap = (lat: number, lon: number) => {
    if (!lat || !lon) {
      Alert.alert("Location Missing", "GPS coordinates were not recorded for this event.");
      return;
    }
    // ✅ Use this standard Google Maps query format
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    
    Linking.openURL(url).catch(err => {
        console.error("Couldn't open map", err);
        Alert.alert("Error", "Could not open map application.");
    });
  };

  // --- Render Single Log Card ---
  const renderAttendanceCard = ({ item }: { item: any }) => (
    <View className="bg-white p-4 mb-4 rounded-2xl border border-slate-100 shadow-sm">
      
      {/* Header: Child Name & Status */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2">
          <View className="bg-indigo-100 p-2 rounded-full">
            <Ionicons name="person" size={16} color="#4F46E5" />
          </View>
          <View>
            <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
            <Text className="text-xs text-slate-400">{item.school_name}</Text>
          </View>
        </View>

        <View className={`px-2 py-1 rounded-lg ${item.is_present ? 'bg-green-100' : 'bg-red-100'}`}>
          <Text className={`text-xs font-bold ${item.is_present ? 'text-green-700' : 'text-red-700'}`}>
            {item.is_present ? 'Present' : 'Absent'}
          </Text>
        </View>
      </View>

      {/* Grid: Morning & Evening Times */}
      <View className="flex-row gap-3">
        
        {/* --- MORNING BLOCK --- */}
        <View className="flex-1 bg-orange-50 p-3 rounded-xl border border-orange-100">
          <View className="flex-row items-center mb-2">
            <Ionicons name="sunny" size={14} color="#EA580C" />
            <Text className="text-xs font-bold text-orange-700 ml-1">MORNING</Text>
          </View>
          
          {/* 1. Morning Pickup */}
          <View className="flex-row justify-between mb-2">
            <View>
              <Text className="text-[10px] text-slate-400 uppercase">Pickup</Text>
              <Text className="text-sm font-bold text-slate-700">{item.morning_pickup_time || '--:--'}</Text>
            </View>
            {item.morning_pickup_lat && (
              <TouchableOpacity onPress={() => openMap(item.morning_pickup_lat, item.morning_pickup_lon)}>
                 <Ionicons name="location-sharp" size={20} color="#EA580C" />
              </TouchableOpacity>
            )}
          </View>

          {/* 2. Morning Drop */}
          <View className="flex-row justify-between">
            <View>
              <Text className="text-[10px] text-slate-400 uppercase">Drop</Text>
              <Text className="text-sm font-bold text-slate-700">{item.morning_drop_time || '--:--'}</Text>
            </View>
            {item.morning_drop_lat && (
              <TouchableOpacity onPress={() => openMap(item.morning_drop_lat, item.morning_drop_lon)}>
                 <Ionicons name="location-sharp" size={20} color="#EA580C" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* --- EVENING BLOCK --- */}
        <View className="flex-1 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
          <View className="flex-row items-center mb-2">
            <Ionicons name="moon" size={14} color="#4F46E5" />
            <Text className="text-xs font-bold text-indigo-700 ml-1">EVENING</Text>
          </View>

          {/* 3. Evening Pickup */}
          <View className="flex-row justify-between mb-2">
            <View>
              <Text className="text-[10px] text-slate-400 uppercase">Pickup</Text>
              <Text className="text-sm font-bold text-slate-700">{item.evening_pickup_time || '--:--'}</Text>
            </View>
             {item.evening_pickup_lat && (
              <TouchableOpacity onPress={() => openMap(item.evening_pickup_lat, item.evening_pickup_lon)}>
                 <Ionicons name="location-sharp" size={20} color="#4F46E5" />
              </TouchableOpacity>
            )}
          </View>

          {/* 4. Evening Drop */}
          <View className="flex-row justify-between">
            <View>
              <Text className="text-[10px] text-slate-400 uppercase">Drop</Text>
              <Text className="text-sm font-bold text-slate-700">{item.evening_drop_time || '--:--'}</Text>
            </View>
            {item.evening_drop_lat && (
              <TouchableOpacity onPress={() => openMap(item.evening_drop_lat, item.evening_drop_lon)}>
                 <Ionicons name="location-sharp" size={20} color="#4F46E5" />
              </TouchableOpacity>
            )}
          </View>
        </View>

      </View>

      {/* Footer: Date */}
      <View className="mt-3 pt-3 border-t border-slate-100 flex-row justify-between items-center">
        <Text className="text-xs text-slate-400">Date Logged:</Text>
        <Text className="text-xs font-bold text-slate-600">
          {new Date(item.date).toDateString()}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      
      {/* --- Top Header --- */}
      <View className="pt-14 px-5 pb-4 bg-white shadow-sm z-10">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-slate-800">Attendance History</Text>
        </View>

        {/* Filters Container */}
        <View className="flex-row gap-3">
          
          {/* Child Selector */}
          <View className="flex-1 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden h-12 justify-center">
            <Picker
              selectedValue={selectedChildId}
              onValueChange={(val) => setSelectedChildId(val)}
              style={{ width: '100%', marginLeft: -5 }} 
              mode="dropdown"
            >
              <Picker.Item label="All Children" value="" color="#64748b" style={{ fontSize: 14 }} />
              {myChildren?.map((child: any) => (
                <Picker.Item 
                  key={child.id} 
                  label={child.child_name.split(' ')[0]} 
                  value={child.id} 
                  style={{ fontSize: 14 }}
                />
              ))}
            </Picker>
          </View>

          {/* Date Picker Button */}
          <TouchableOpacity 
            onPress={() => setShowDatePicker(true)}
            className="flex-1 bg-slate-100 rounded-xl border border-slate-200 h-12 flex-row items-center justify-center px-2"
          >
            <Ionicons name="calendar-outline" size={18} color="#475569" />
            <Text className="ml-2 text-slate-700 font-semibold text-xs">
              {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {/* --- List Section --- */}
      {isLoading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text className="text-slate-400 mt-4">Loading records...</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.attendance_id || Math.random().toString()}
          renderItem={renderAttendanceCard}
          contentContainerStyle={{ padding: 20, paddingBottom: 50 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
          ListEmptyComponent={
            <View className="items-center mt-20 opacity-50">
              <Ionicons name="document-text-outline" size={64} color="#cbd5e1" />
              <Text className="text-slate-500 mt-4 text-center px-10">
                No attendance records found for this date.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}