// import React from 'react';
// import { View, Text, TouchableOpacity } from 'react-native';
// import { useAuth } from '../../auth/useAuth';
// import { router } from 'expo-router';
// import { Ionicons } from '@expo/vector-icons';

// export default function HomeScreen() {
//   const { user } = useAuth();

//   return (
//     <View className="flex-1 bg-slate-50 p-6 pt-16">
//       <Text className="text-2xl font-bold text-slate-800">Hello, {user?.role}</Text>
//       <Text className="text-slate-500 mb-8">{user?.email}</Text>

//       <View className="flex-row flex-wrap gap-4">
//         {user?.role === 'Driver' && (
//           <TouchableOpacity 
//             onPress={() => router.push('/(tabs)/driver')}
//             className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center"
//           >
//             <View className="bg-orange-100 p-4 rounded-full mr-4">
//               <Ionicons name="bus" size={32} color="#F97316" />
//             </View>
//             <View>
//               <Text className="text-lg font-bold text-slate-800">Driver Console</Text>
//               <Text className="text-slate-500">Manage trips & passengers</Text>
//             </View>
//           </TouchableOpacity>
//         )}

//         {user?.role === 'Parent' && (
//           <TouchableOpacity 
//             onPress={() => router.push('/(tabs)/parent')}
//             className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center"
//           >
//             <View className="bg-green-100 p-4 rounded-full mr-4">
//               <Ionicons name="people" size={32} color="#16A34A" />
//             </View>
//             <View>
//               <Text className="text-lg font-bold text-slate-800">Parent Dashboard</Text>
//               <Text className="text-slate-500">Track your children</Text>
//             </View>
//           </TouchableOpacity>
//         )}
//       </View>
//     </View>
//   );
// }

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useAuth } from '../../auth/useAuth';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <ScrollView className="flex-1 bg-slate-50 p-6 pt-16">
      <Text className="text-2xl font-bold text-slate-800">Hello, {user?.role}</Text>
      <Text className="text-slate-500 mb-8">{user?.email}</Text>

      <View className="flex-col gap-4">
        
        {/* --- DRIVER SECTION --- */}
        {user?.role === 'Driver' && (
          <>
            {/* 1. Driver Console */}
            <TouchableOpacity 
              onPress={() => router.push('/')} // Adjust this route if needed
              className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center"
            >
              <View className="bg-orange-100 p-4 rounded-full mr-4">
                <Ionicons name="bus" size={32} color="#F97316" />
              </View>
              <View>
                <Text className="text-lg font-bold text-slate-800">Driver Console</Text>
                <Text className="text-slate-500">Manage trips & passengers</Text>
              </View>
            </TouchableOpacity>

            {/* 2. My Passengers */}
            <TouchableOpacity 
              onPress={() => router.push('./passengers')} 
              className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center"
            >
              <View className="bg-indigo-100 p-4 rounded-full mr-4">
                <Ionicons name="people" size={32} color="#4F46E5" />
              </View>
              <View>
                <Text className="text-lg font-bold text-slate-800">My Passengers</Text>
                <Text className="text-slate-500">View assigned students</Text>
              </View>
            </TouchableOpacity>

            {/* 3. Attendance Logs (NEW BUTTON) */}
            <TouchableOpacity 
              onPress={() => router.push('./attendance')} 
              className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center"
            >
              <View className="bg-teal-100 p-4 rounded-full mr-4">
                <Ionicons name="calendar" size={32} color="#0D9488" />
              </View>
              <View>
                <Text className="text-lg font-bold text-slate-800">Attendance</Text>
                <Text className="text-slate-500">Check daily logs</Text>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* --- PARENT SECTION --- */}
        {user?.role === 'Parent' && (
          <TouchableOpacity 
            onPress={() => router.push('/(tabs)/parent')}
            className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-row items-center"
          >
            <View className="bg-green-100 p-4 rounded-full mr-4">
              <Ionicons name="people" size={32} color="#16A34A" />
            </View>
            <View>
              <Text className="text-lg font-bold text-slate-800">Parent Dashboard</Text>
              <Text className="text-slate-500">Track your children</Text>
            </View>
          </TouchableOpacity>
        )}

      </View>
    </ScrollView>
  );
}