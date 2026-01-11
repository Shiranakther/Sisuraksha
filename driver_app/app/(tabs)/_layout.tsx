import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#2563EB',
      tabBarStyle: { height: 65, paddingBottom: 10 }
    }}>
      {/* Visible Tabs */}
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} /> }} />
      <Tabs.Screen name="driver-monitor" options={{ title: 'Monitor', tabBarIcon: ({ color }) => <Ionicons name="eye" size={24} color={color} /> }} />
      <Tabs.Screen name="safety" options={{ title: 'Safety', tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark" size={24} color={color} /> }} />

      {/* Hidden Tabs (Still in Layout) */}
      <Tabs.Screen name="driver" options={{ href: null }} />
      <Tabs.Screen name="parent" options={{ href: null }} />
      <Tabs.Screen name="admin" options={{ href: null }} />

      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="passengers" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}