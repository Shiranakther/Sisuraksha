import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/axios';
import { useAuth } from '../auth/useAuth';
import { router } from 'expo-router';
import { AuthResponse, UserRole } from '../utils/types';
import { Alert } from 'react-native';
import { API_ENDPOINTS } from '../api/endpoints';

export const useLogin = () => {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: async (creds: {email:string, password:string}) => {
      const { data } = await apiClient.post<AuthResponse>(API_ENDPOINTS.LOGIN, creds);
      return data;
    },
    onSuccess: (data) => {
      signIn(data.token, data.data);
      router.replace('/(tabs)/home'); // 👈 Directs to TABS
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Login failed')
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: async (creds: {email:string, password:string, role:UserRole}) => {
      const { data } = await apiClient.post<AuthResponse>(API_ENDPOINTS.REGISTER, creds);
      return data;
    },
    onSuccess: () => {
      Alert.alert('Success', 'Account created. Please login.', [
        { text: 'OK', onPress: () => router.push('/login') }
      ]);
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Registration failed')
  });
};

export const useLogout = () => {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post(API_ENDPOINTS.LOGOUT),
    onSettled: () => {
      signOut();
      queryClient.clear();
      router.replace('/');
    }
  });
};