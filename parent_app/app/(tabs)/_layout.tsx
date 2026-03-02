import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  
  // Ensure we have enough padding at the bottom so Android navigation bar doesn't overlap tabs
  const bottomPadding = Platform.OS === 'android' ? Math.max(15, insets.bottom) : insets.bottom;
  const tabHeight = Platform.OS === 'android' ? 60 + bottomPadding : 60 + bottomPadding;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#2563EB',
      tabBarInactiveTintColor: '#64748B',
      tabBarStyle: { 
        height: tabHeight, 
        paddingBottom: bottomPadding, 
        paddingTop: 10,
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600',
        paddingBottom: Platform.OS === 'android' ? 5 : 0,
      }
    }}>
      {/* Visible Tabs */}
      <Tabs.Screen 
        name="home" 
        options={{ 
          title: 'Home', 
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Child', 
          tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="attendance" 
        options={{ 
          title: 'Attendance', 
          tabBarIcon: ({ color }) => <Ionicons name="calendar" size={24} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="tracking" 
        options={{ 
          title: 'Tracking', 
          tabBarIcon: ({ color }) => <Ionicons name="location" size={24} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings', 
          tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} /> 
        }} 
      />

      {/* Hidden Tabs (Still in Layout) */}
      <Tabs.Screen name="assign_bus" options={{ href: null }} />
      <Tabs.Screen name="driver" options={{ href: null }} />
      <Tabs.Screen name="parent" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}