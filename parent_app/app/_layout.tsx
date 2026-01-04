import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native'; //  1. Import these
import { AuthProvider } from '../auth/AuthContext';
import { useAuth } from '../auth/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import "../global.css";

const queryClient = new QueryClient();

const ProtectedRoute = () => {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inTabsGroup = segments[0] === '(tabs)';

    // 1. If NOT logged in, and trying to access Tabs -> Go to Login
    if (!user && inTabsGroup) {
      router.replace('/login'); //  Changed from '/' to '/login' for clarity
    } 
    // 2. If LOGGED IN, and trying to access Login -> Go to Home
    else if (user && segments[0] === 'login') {
      router.replace('/(tabs)/home');
    }
  }, [user, segments, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return <Slot />;
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProtectedRoute />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}