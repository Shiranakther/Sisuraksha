// import React, { useState } from 'react';
// import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import { useDriverAttendance } from '@/hooks/useApi';
// import DateTimePicker from '@react-native-community/datetimepicker'; // npx expo install @react-native-community/datetimepicker

// export default function DriverAttendanceScreen() {
//   // State
//   const [searchQuery, setSearchQuery] = useState('');
//   const [selectedDate, setSelectedDate] = useState(new Date());
//   const [showDatePicker, setShowDatePicker] = useState(false);

//   // Format date for API (YYYY-MM-DD)
//   const dateString = selectedDate.toISOString().split('T')[0];

//   // Fetch Data
//   const { data: logs, isLoading, refetch } = useDriverAttendance(dateString, searchQuery);

//   const renderLogItem = ({ item }: { item: any }) => (
//     <View className="bg-white p-4 mb-3 rounded-2xl border border-slate-100 shadow-sm">
//       <View className="flex-row justify-between items-center mb-2">
//         <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
//         <View className={`px-2 py-1 rounded-md ${item.is_present ? 'bg-green-100' : 'bg-red-100'}`}>
//           <Text className={`text-xs font-bold ${item.is_present ? 'text-green-700' : 'text-red-700'}`}>
//             {item.is_present ? 'Present' : 'Absent'}
//           </Text>
//         </View>
//       </View>
      
//       <Text className="text-slate-400 text-xs uppercase font-bold mb-2">School: {item.school_name}</Text>

//       {/* Times Grid */}
//       <View className="flex-row bg-slate-50 p-2 rounded-lg">
//         <View className="flex-1 items-center border-r border-slate-200">
//           <Text className="text-xs text-slate-400">Morning Pickup</Text>
//           <Text className="font-bold text-slate-700">{item.morning_pickup_time || '--:--'}</Text>
//         </View>
//         <View className="flex-1 items-center">
//           <Text className="text-xs text-slate-400">Morning Drop</Text>
//           <Text className="font-bold text-slate-700">{item.morning_drop_time || '--:--'}</Text>
//         </View>
//       </View>
//       <View className="flex-row bg-slate-50 p-2 rounded-lg">
//         <View className="flex-1 items-center border-r border-slate-200">
//           <Text className="text-xs text-slate-400">Evening Pickup</Text>
//           <Text className="font-bold text-slate-700">{item.evening_pickup_time || '--:--'}</Text>
//         </View>
//         <View className="flex-1 items-center">
//           <Text className="text-xs text-slate-400">Evening Drop</Text>
//           <Text className="font-bold text-slate-700">{item.evening_drop_time || '--:--'}</Text>
//         </View>
//       </View>
//     </View>
//   );

//   return (
//     <View className="flex-1 bg-slate-50 pt-16 px-5">
//       <View className="mb-4">
//         <Text className="text-3xl font-bold text-slate-800">Attendance Log</Text>
//         <Text className="text-slate-500">Track student activity on your bus</Text>
//       </View>

//       {/* --- Controls Section --- */}
//       <View className="bg-white p-3 rounded-2xl shadow-sm mb-4">
        
//         {/* Search Bar */}
//         <View className="flex-row items-center bg-slate-100 rounded-xl px-3 py-2 mb-3">
//           <Ionicons name="search" size={20} color="#94a3b8" />
//           <TextInput 
//             className="flex-1 ml-2 text-slate-700"
//             placeholder="Search student name..."
//             value={searchQuery}
//             onChangeText={setSearchQuery}
//           />
//         </View>

//         {/* Date Picker Button */}
//         <TouchableOpacity 
//           onPress={() => setShowDatePicker(true)}
//           className="flex-row items-center justify-between bg-indigo-50 px-3 py-3 rounded-xl border border-indigo-100"
//         >
//           <View className="flex-row items-center">
//             <Ionicons name="calendar" size={20} color="#4F46E5" />
//             <Text className="ml-2 font-bold text-indigo-700">
//               Date: {selectedDate.toDateString()}
//             </Text>
//           </View>
//           <Ionicons name="chevron-down" size={16} color="#4F46E5" />
//         </TouchableOpacity>

//         {showDatePicker && (
//           <DateTimePicker
//             value={selectedDate}
//             mode="date"
//             display="default"
//             onChange={(event, date) => {
//               setShowDatePicker(false);
//               if (date) setSelectedDate(date);
//             }}
//           />
//         )}
//       </View>

//       {/* --- Results List --- */}
//       {isLoading ? (
//         <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
//       ) : (
//         <FlatList
//           data={logs}
//           keyExtractor={(item) => item.attendance_id || Math.random().toString()}
//           renderItem={renderLogItem}
//           refreshing={isLoading}
//           onRefresh={refetch}
//           contentContainerStyle={{ paddingBottom: 100 }}
//           ListEmptyComponent={
//             <View className="items-center mt-10">
//               <Text className="text-slate-400">No attendance records found.</Text>
//             </View>
//           }
//         />
//       )}
//     </View>
//   );
// }

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDriverAttendance, useAttendanceAlerts } from '@/hooks/useApi'; // 👈 Added useAttendanceAlerts
import DateTimePicker from '@react-native-community/datetimepicker'; 

export default function DriverAttendanceScreen() {
  // --- State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- Data Fetching ---
  
  // 1. Logs (Existing)
  const dateString = selectedDate.toISOString().split('T')[0];
  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useDriverAttendance(dateString, searchQuery);

  // 2. Alerts (New - Fetches missing students for TODAY)
  const { data: missingStudents, isLoading: loadingAlerts, refetch: refetchAlerts } = useAttendanceAlerts();

  // --- Handlers ---

  const handleRefresh = () => {
    refetchLogs();
    refetchAlerts();
  };

  const handleCall = (phone: string) => {
    if (!phone) return Alert.alert("No Phone", "Parent number not available");
    Linking.openURL(`tel:${phone}`);
  };

  // --- Render Item for Attendance Log ---
  const renderLogItem = ({ item }: { item: any }) => (
    <View className="bg-white p-4 mb-3 rounded-2xl border border-slate-100 shadow-sm">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-lg font-bold text-slate-800">{item.child_name}</Text>
        <View className={`px-2 py-1 rounded-md ${item.is_present ? 'bg-green-100' : 'bg-red-100'}`}>
          <Text className={`text-xs font-bold ${item.is_present ? 'text-green-700' : 'text-red-700'}`}>
            {item.is_present ? 'Present' : 'Absent'}
          </Text>
        </View>
      </View>
      
      <Text className="text-slate-400 text-xs uppercase font-bold mb-3">School: {item.school_name}</Text>

      {/* Times Grid - Morning */}
      <View className="flex-row bg-slate-50 p-2 rounded-t-lg border-b border-slate-200">
        <View className="flex-1 items-center border-r border-slate-200">
          <Text className="text-xs text-slate-400">Morning Pickup</Text>
          <Text className="font-bold text-slate-700">{item.morning_pickup_time || '--:--'}</Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="text-xs text-slate-400">Morning Drop</Text>
          <Text className="font-bold text-slate-700">{item.morning_drop_time || '--:--'}</Text>
        </View>
      </View>

      {/* Times Grid - Evening */}
      <View className="flex-row bg-slate-50 p-2 rounded-b-lg">
        <View className="flex-1 items-center border-r border-slate-200">
          <Text className="text-xs text-slate-400">Evening Pickup</Text>
          <Text className="font-bold text-slate-700">{item.evening_pickup_time || '--:--'}</Text>
        </View>
        <View className="flex-1 items-center">
          <Text className="text-xs text-slate-400">Evening Drop</Text>
          <Text className="font-bold text-slate-700">{item.evening_drop_time || '--:--'}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 pt-16 px-5">
      <View className="mb-4">
        <Text className="text-3xl font-bold text-slate-800">Attendance Log</Text>
        <Text className="text-slate-500">Track student activity</Text>
      </View>

      {/* 🚨 1. MISSING STUDENTS ALERT SECTION 🚨 */}
      {/* Only show if viewing TODAY's date */}
      {dateString === new Date().toISOString().split('T')[0] && (
        <View className="mb-6">
          {loadingAlerts ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : missingStudents && missingStudents.length > 0 ? (
            <View className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <View className="flex-row items-center mb-2">
                <Ionicons name="warning" size={24} color="#DC2626" />
                <Text className="text-red-700 font-bold text-lg ml-2">
                  {missingStudents.length} Students Missing
                </Text>
              </View>
              <Text className="text-red-600 text-xs mb-3">
                Students assigned to you who haven't scanned in today:
              </Text>
              
              {/* List of Missing Kids */}
              {missingStudents.map((student: any) => (
                <View key={student.child_id} className="bg-white p-3 rounded-xl mb-2 flex-row justify-between items-center border border-red-100 shadow-sm">
                  <View>
                    <Text className="font-bold text-slate-700">{student.child_name}</Text>
                    <Text className="text-xs text-slate-400">{student.school_name}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleCall(student.parent_phone)}
                    className="bg-red-100 p-2 rounded-full"
                  >
                    <Ionicons name="call" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            // Success State (All present)
            <View className="bg-green-100 border border-green-200 rounded-2xl p-4 flex-row items-center">
              <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
              <Text className="text-green-800 font-bold ml-2">All Assigned Students Present</Text>
            </View>
          )}
        </View>
      )}

      {/* --- 2. Controls Section (Search & Date) --- */}
      <View className="bg-white p-3 rounded-2xl shadow-sm mb-4">
        
        {/* Search Bar */}
        <View className="flex-row items-center bg-slate-100 rounded-xl px-3 py-2 mb-3">
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput 
            className="flex-1 ml-2 text-slate-700"
            placeholder="Search student name..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Date Picker Button */}
        <TouchableOpacity 
          onPress={() => setShowDatePicker(true)}
          className="flex-row items-center justify-between bg-indigo-50 px-3 py-3 rounded-xl border border-indigo-100"
        >
          <View className="flex-row items-center">
            <Ionicons name="calendar" size={20} color="#4F46E5" />
            <Text className="ml-2 font-bold text-indigo-700">
              Date: {selectedDate.toDateString()}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color="#4F46E5" />
        </TouchableOpacity>

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
      </View>

      {/* --- 3. Results List --- */}
      {loadingLogs ? (
        <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.attendance_id || Math.random().toString()}
          renderItem={renderLogItem}
          refreshing={loadingLogs}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View className="items-center mt-10">
              <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
              <Text className="text-slate-400 mt-2">No attendance records found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}