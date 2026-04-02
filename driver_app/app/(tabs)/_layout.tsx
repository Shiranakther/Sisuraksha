import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Ensure we add at least 20px padding on Android, or the device's bottom inset
  const bottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 20) : insets.bottom;
  const tabHeight = 65 + bottomPadding;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#2563EB',
      tabBarInactiveTintColor: '#64748B',
      tabBarStyle: { 
        height: tabHeight,
        paddingBottom: bottomPadding,
        paddingTop: 10,
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 4
      }
    }}>
      {/* Visible Tabs */}
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={26} color={color} /> }} />
      <Tabs.Screen name="driver-monitor" options={{ title: 'Monitor', tabBarIcon: ({ color }) => <Ionicons name="eye" size={26} color={color} /> }} />
      <Tabs.Screen name="safety" options={{ title: 'Safety', tabBarIcon: ({ color }) => <Ionicons name="shield-checkmark" size={26} color={color} /> }} />
      <Tabs.Screen name="maps" options={{ title: 'Maps', tabBarIcon: ({ color }) => <Ionicons name="map" size={26} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings" size={26} color={color} /> }} />

      {/* Hidden Tabs (Still in Layout) */}
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="passengers" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="parent" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Hidden from bottom bar
          title: 'My Profile',
        }}
      />
      <Tabs.Screen
        name="terms"
        options={{
          href: null, // Hidden from bottom bar
          title: 'Terms & Conditions',
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          href: null, // Hidden from bottom bar
          title: 'Privacy Policy',
        }}
      />
    </Tabs>
  );
}