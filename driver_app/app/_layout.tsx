import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
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

    const publicRoutes = ['index', 'login'];
    const currentRoute = segments[0] || 'index';
    const isPublic = publicRoutes.includes(currentRoute);

    if (!user && !isPublic) {
      router.replace('/');
    } else if (user && isPublic) {
      router.replace('/(tabs)/home');
    }
  }, [user, segments, isLoading]);

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