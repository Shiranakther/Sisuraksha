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

import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Linking, Alert, ScrollView, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { useDriverAttendance, useAttendanceAlerts, useFaceVerify, FaceVerifyPayload } from '@/hooks/useApi';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function DriverAttendanceScreen() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'scan' | 'log'>('scan');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sessionFilter, setSessionFilter] = useState('ALL'); // ALL, MORNING_PICKUP, MORNING_DROP, EVENING_PICKUP, EVENING_DROP

  // --- Face Scan State ---
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const verifyMutation = useFaceVerify();

  // --- Data Fetching ---

  // 1. Logs (Existing)
  const dateString = selectedDate.toISOString().split('T')[0];
  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useDriverAttendance(dateString, searchQuery);

  // 2. Alerts (Fetches missing students for TODAY)
  const { data: missingStudents, isLoading: loadingAlerts, refetch: refetchAlerts } = useAttendanceAlerts();

  // --- Face Scan Handlers ---
  const handleOpenCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to scan faces.');
        return;
      }
    }
    // Get current GPS location for attendance record
    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
    if (locStatus === 'granted') {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCurrentLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        setCurrentLocation(null);
      }
    }
    setScanResult(null);
    setCapturedUri(null);
    setCameraOpen(true);
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      console.log('[FaceScan] 📸 Capturing photo...');
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false, exif: true });
      if (!photo?.uri) return;
      setCameraOpen(false);

      // Fix EXIF orientation — Android stores rotation in EXIF but doesn't
      // physically rotate pixels. Apply rotation before compressing.
      const orientation: number = (photo as any).exif?.Orientation ?? 1;
      const rotateActions: ImageManipulator.Action[] = [];
      if (orientation === 3) rotateActions.push({ rotate: 180 });
      else if (orientation === 6) rotateActions.push({ rotate: 90 });
      else if (orientation === 8) rotateActions.push({ rotate: -90 });
      console.log(`[FaceScan] EXIF orientation: ${orientation}`);

      // Compress + physically rotate if needed
      const compressed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [...rotateActions, { resize: { width: 640 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setCapturedUri(compressed.uri);
      console.log(`[FaceScan] 📦 Compressed image: ${compressed.width}x${compressed.height}, base64 length: ${compressed.base64?.length ?? 0} chars`);

      if (!compressed.base64) {
        Alert.alert('Error', 'Failed to process image.');
        return;
      }

      console.log(`[FaceScan] 📤 Sending base64 image to /api/face/verify (${Math.round((compressed.base64.length * 3) / 4 / 1024)}KB)`);
      const payload: FaceVerifyPayload = {
        image: compressed.base64,
        latitude: currentLocation?.latitude ?? null,
        longitude: currentLocation?.longitude ?? null,
      };
      verifyMutation.mutate(payload, {
        onSuccess: (data) => {
          console.log('[FaceScan] ✅ Verify response:', JSON.stringify(data));
          setScanResult(data);
        },
        onError: (err: any) => {
          const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Unknown error';
          console.error('[FaceScan] ❌ Verify error:', err.response?.status, msg);
          Alert.alert('Verification Failed', msg);
        },
      });
    } catch (e) {
      console.error('[FaceScan] ❌ Capture error:', e);
      Alert.alert('Error', 'Failed to capture photo.');
      setCameraOpen(false);
    }
  };

  const handleScanAgain = () => {
    setScanResult(null);
    setCapturedUri(null);
    verifyMutation.reset();
  };

  // --- Derived Data ---
  const stats = {
    morningPickups: logs?.filter((l: any) => l.morning_pickup_time).length || 0,
    morningDrops: logs?.filter((l: any) => l.morning_drop_time).length || 0,
    eveningPickups: logs?.filter((l: any) => l.evening_pickup_time).length || 0,
    eveningDrops: logs?.filter((l: any) => l.evening_drop_time).length || 0,
  };

  const displayedLogs = logs?.filter((log: any) => {
    if (sessionFilter === 'ALL') return true;
    if (sessionFilter === 'MORNING_PICKUP') return !!log.morning_pickup_time;
    if (sessionFilter === 'MORNING_DROP') return !!log.morning_drop_time;
    if (sessionFilter === 'EVENING_PICKUP') return !!log.evening_pickup_time;
    if (sessionFilter === 'EVENING_DROP') return !!log.evening_drop_time;
    return true;
  });

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

      {/* ---- Header ---- */}
      <View className="mb-4">
        <Text className="text-3xl font-bold text-slate-800">Attendance</Text>
        <Text className="text-slate-500">Scan faces or view attendance log</Text>
      </View>

      {/* ---- Tab Switcher ---- */}
      <View className="flex-row bg-slate-200 rounded-xl p-1 mb-4">
        <TouchableOpacity
          onPress={() => setActiveTab('scan')}
          className={`flex-1 py-2 rounded-lg items-center flex-row justify-center ${activeTab === 'scan' ? 'bg-white shadow-sm' : ''}`}
        >
          <Ionicons name="scan" size={16} color={activeTab === 'scan' ? '#4F46E5' : '#94a3b8'} />
          <Text className={`ml-1 font-bold text-sm ${activeTab === 'scan' ? 'text-indigo-600' : 'text-slate-400'}`}>Face Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('log')}
          className={`flex-1 py-2 rounded-lg items-center flex-row justify-center ${activeTab === 'log' ? 'bg-white shadow-sm' : ''}`}
        >
          <Ionicons name="list" size={16} color={activeTab === 'log' ? '#4F46E5' : '#94a3b8'} />
          <Text className={`ml-1 font-bold text-sm ${activeTab === 'log' ? 'text-indigo-600' : 'text-slate-400'}`}>Attendance Log</Text>
        </TouchableOpacity>
      </View>

      {/* ===== FACE SCAN TAB ===== */}
      {activeTab === 'scan' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* --- Camera Modal --- */}
          <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => setCameraOpen(false)}>
            <View className="flex-1 bg-black">
              <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front">
                {/* Overlay */}
                <View className="flex-1 items-center justify-center">
                  {/* Face guide */}
                  <View className="w-64 h-64 rounded-full border-4 border-white opacity-50" />
                  <Text className="text-white text-center mt-4 opacity-70">Position the student's face inside the circle</Text>
                </View>

                {/* Bottom bar */}
                <View className="pb-12 items-center">
                  <TouchableOpacity
                    onPress={handleCapture}
                    className="bg-white rounded-full w-20 h-20 items-center justify-center shadow-lg"
                  >
                    <Ionicons name="camera" size={36} color="#4F46E5" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCameraOpen(false)} className="mt-4">
                    <Text className="text-white opacity-70">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </CameraView>
            </View>
          </Modal>

          {/* --- Loading State --- */}
          {verifyMutation.isPending && (
            <View className="bg-white rounded-2xl p-8 items-center shadow-sm border border-slate-100 mb-4">
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text className="text-slate-600 mt-3 font-medium">Verifying face...</Text>
              {capturedUri && (
                <Image source={{ uri: capturedUri }} className="w-24 h-24 rounded-full mt-4 border-2 border-indigo-100" />
              )}
            </View>
          )}

          {/* --- Scan Result --- */}
          {scanResult && !verifyMutation.isPending && (
            <View className={`rounded-2xl p-5 mb-4 border shadow-sm ${scanResult.is_match ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <View className="flex-row items-center mb-3">
                <Ionicons
                  name={scanResult.is_match ? 'checkmark-circle' : 'close-circle'}
                  size={40}
                  color={scanResult.is_match ? '#16A34A' : '#DC2626'}
                />
                <View className="ml-3 flex-1">
                  <Text className={`text-xl font-bold ${scanResult.is_match ? 'text-green-800' : 'text-red-800'}`}>
                    {scanResult.is_match ? scanResult.child_name : 'Unknown Person'}
                  </Text>
                  <Text className={`text-sm ${scanResult.is_match ? 'text-green-600' : 'text-red-500'}`}>
                    {scanResult.is_match ? `${scanResult.confidence.toFixed(1)}% match confidence` : 'Face not recognized'}
                  </Text>
                </View>
              </View>

              {/* Captured photo */}
              {capturedUri && (
                <Image source={{ uri: capturedUri }} className="w-full h-48 rounded-xl mb-3" style={{ resizeMode: 'cover' }} />
              )}

              {/* Verified badge */}
              <View className={`px-3 py-2 rounded-xl items-center mb-2 ${scanResult.is_match ? 'bg-green-100' : 'bg-red-100'}`}>
                <Text className={`font-bold text-sm ${scanResult.is_match ? 'text-green-700' : 'text-red-700'}`}>
                  {scanResult.is_match ? '✓ Student Verified' : '✗ Not in system'}
                </Text>
              </View>

              {/* Attendance action badge */}
              {scanResult.is_match && scanResult.attendance && (
                <View className={`px-3 py-2 rounded-xl items-center ${
                  scanResult.attendance.action === 'COMPLETE' || scanResult.attendance.action === 'ERROR'
                    ? 'bg-slate-100' : 'bg-indigo-100'
                }`}>
                  <Text className={`font-bold text-sm ${
                    scanResult.attendance.action === 'COMPLETE' || scanResult.attendance.action === 'ERROR'
                      ? 'text-slate-600' : 'text-indigo-700'
                  }`}>
                    {scanResult.attendance.action === 'MORNING_PICKUP' && '🌅 '}
                    {scanResult.attendance.action === 'MORNING_DROP'   && '🏫 '}
                    {scanResult.attendance.action === 'EVENING_PICKUP' && '🌆 '}
                    {scanResult.attendance.action === 'EVENING_DROP'   && '🏠 '}
                    {scanResult.attendance.action === 'COMPLETE'       && '✓ '}
                    {scanResult.attendance.message}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* --- Default / Idle State --- */}
          {!verifyMutation.isPending && !scanResult && (
            <View className="bg-white rounded-2xl p-8 items-center shadow-sm border border-slate-100 mb-4">
              <View className="w-24 h-24 rounded-full bg-indigo-50 items-center justify-center mb-4">
                <Ionicons name="scan" size={48} color="#4F46E5" />
              </View>
              <Text className="text-xl font-bold text-slate-800 mb-1">Face Attendance</Text>
              <Text className="text-slate-500 text-center mb-2">Open the camera and point it at a student to verify their identity and mark attendance.</Text>
            </View>
          )}

          {/* --- Scan Button --- */}
          {!verifyMutation.isPending && (
            <TouchableOpacity
              onPress={scanResult ? handleScanAgain : handleOpenCamera}
              className="bg-indigo-600 rounded-2xl py-4 items-center flex-row justify-center shadow-sm"
            >
              <Ionicons name={scanResult ? 'refresh' : 'camera'} size={22} color="white" />
              <Text className="text-white font-bold text-lg ml-2">
                {scanResult ? 'Scan Another Student' : 'Open Camera'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ===== ATTENDANCE LOG TAB ===== */}
      {activeTab === 'log' && (
        <FlatList
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View className="mb-2" />

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

              {/* --- STATS CARDS --- */}
              <View className="flex-row flex-wrap justify-between mb-4">
                <View className="w-[48%] bg-white p-3 rounded-2xl shadow-sm border border-slate-100 mb-3">
                  <Text className="text-xs font-bold text-slate-400 uppercase">Morn Pickup</Text>
                  <Text className="text-2xl font-bold text-orange-600">{stats.morningPickups}</Text>
                </View>
                <View className="w-[48%] bg-white p-3 rounded-2xl shadow-sm border border-slate-100 mb-3">
                  <Text className="text-xs font-bold text-slate-400 uppercase">Morn Drop</Text>
                  <Text className="text-2xl font-bold text-emerald-600">{stats.morningDrops}</Text>
                </View>
                <View className="w-[48%] bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                  <Text className="text-xs font-bold text-slate-400 uppercase">Eve Pickup</Text>
                  <Text className="text-2xl font-bold text-indigo-600">{stats.eveningPickups}</Text>
                </View>
                <View className="w-[48%] bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                  <Text className="text-xs font-bold text-slate-400 uppercase">Eve Drop</Text>
                  <Text className="text-2xl font-bold text-purple-600">{stats.eveningDrops}</Text>
                </View>
              </View>

              {/* --- 2. Controls Section (Search, Filter, Date) --- */}
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

                {/* Filters (Scrollable Pills) */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                  {['ALL', 'MORNING_PICKUP', 'MORNING_DROP', 'EVENING_PICKUP', 'EVENING_DROP'].map((filter) => (
                    <TouchableOpacity
                      key={filter}
                      onPress={() => setSessionFilter(filter)}
                      className={`mr-2 px-3 py-1.5 rounded-full border ${sessionFilter === filter ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'}`}
                    >
                      <Text className={sessionFilter === filter ? 'text-white font-bold text-xs' : 'text-slate-600 text-xs'}>
                        {filter.replace('_', ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

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
            </>
          }
          data={loadingLogs ? [] : displayedLogs}
          keyExtractor={(item) => item.attendance_id || Math.random().toString()}
          renderItem={renderLogItem}
          refreshing={loadingLogs}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            loadingLogs ? (
              <ActivityIndicator size="large" color="#4F46E5" className="mt-10" />
            ) : (
              <View className="items-center mt-10">
                <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
                <Text className="text-slate-400 mt-2">No attendance records found.</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}