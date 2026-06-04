// hooks/useApi.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/axios';
import { useAuth } from '../auth/useAuth';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { API_ENDPOINTS } from '@/api/endpoints';
import { UserRole } from '../utils/types';

interface RegisterPayload {
  email: string;
  password: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone_number?: string;
  address?: string;
  license_number?: string;
  trip_start_lat?: number;
  trip_start_lon?: number;
  trip_end_lat?: number;
  trip_end_lon?: number;
  school_ids?: string[];
}

// ==========================================
// 1. AUTHENTICATION HOOKS
// ==========================================

export const useLogin = () => {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: async (creds: { email: string, password: string }) => {
      const { data } = await apiClient.post(API_ENDPOINTS.LOGIN, creds);
      return data;
    },
    onSuccess: (data) => {
      signIn(data.token, data.data);
      router.replace('/(tabs)/home');
    },
    onError: (err: any) => Alert.alert('Login Failed', err.response?.data?.message || 'Invalid credentials')
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: async (creds: RegisterPayload) => {
      const { data } = await apiClient.post(API_ENDPOINTS.REGISTER, creds);
      return data;
    },
    onSuccess: () => {
      Alert.alert('Success', 'Account created. Please login.', [
        { text: 'OK', onPress: () => router.push('/login') }
      ]);
    },
    onError: (err: any) => Alert.alert('Registration Failed', err.response?.data?.message || 'Could not create account')
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
      router.replace('/login');
    }
  });
};

// ==========================================
// 2. SHARED DATA HOOKS
// ==========================================

export const useSchools = () => {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.SCHOOLS);
      return data.data; 
    },
  });
};

export const useDriverChildren = () => {
  return useQuery({
    queryKey: ['driverChildren'],
    queryFn: async () => {
      const { data } = await apiClient.get('/driver/my-children');
      return data.data;
    },
  });
};

export const useTriggerRegistration = () => {
  return useMutation({
    mutationFn: async (childId: string) => {
      const response = await apiClient.post('/attendance/register-trigger', { childId });
      return response.data;
    },
    onSuccess: () => {
      Alert.alert('Registration Mode Active', 'Success! The IoT device is now listening. Please tap the RFID card on the device now.');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to trigger registration');
    }
  });
};

export const useDriverAttendance = (date?: string, search?: string) => {
  return useQuery({
    queryKey: ['driverAttendance', date, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (date) params.append('date', date);
      if (search) params.append('search', search);

      const { data } = await apiClient.get(`${API_ENDPOINTS.DRIVER_ATTENDANCE}?${params.toString()}`);
      return data.data;
    },
  });
};

export const useAttendanceAlerts = () => {
  return useQuery({
    queryKey: ['attendanceAlerts'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.ALERTS);
      return data.data; 
    },
    refetchInterval: 30000,
  });
};

// ==========================================
// 3. DRIVER PROFILE HOOKS
// ==========================================

export const useDriverProfile = () => {
  return useQuery({
    queryKey: ['driverProfile'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.DRIVER_PROFILE_GET);
      return data.data;
    },
  });
};

export const useUpdateDriverProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData: { first_name: string; last_name: string; address?: string; license_number?: string }) => {
      const { data } = await apiClient.put(API_ENDPOINTS.DRIVER_PROFILE_UPDATE, profileData);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverProfile'] });
      Alert.alert('Success', 'Profile updated successfully!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update profile');
    },
  });
};

export const useDeleteDriverProfile = () => {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete(API_ENDPOINTS.DRIVER_PROFILE_DELETE);
      return data;
    },
    onSuccess: () => {
      signOut();
      queryClient.clear();
      router.replace('/'); 
      Alert.alert('Success', 'Your account has been deleted.');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to delete account');
    },
  });
};

// ==========================================
// 4. VEHICLE MANAGEMENT HOOKS
// ==========================================

export const useDriverVehicle = () => {
  return useQuery({
    queryKey: ['driverVehicle'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.VEHICLE_GET);
      return data.data; 
    },
  });
};

export const useCreateVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicleData: { vehicle_number: string; capacity?: number }) => {
      const { data } = await apiClient.post(API_ENDPOINTS.VEHICLE_CREATE, vehicleData);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverVehicle'] });
      Alert.alert('Success', 'Vehicle registered successfully!');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Failed to register vehicle')
  });
};

export const useUpdateVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicleData: { vehicle_number: string; capacity?: number }) => {
      const { data } = await apiClient.put(API_ENDPOINTS.VEHICLE_UPDATE, vehicleData);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverVehicle'] });
      Alert.alert('Success', 'Vehicle updated successfully!');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Failed to update vehicle')
  });
};

export const useDeleteVehicle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.delete(API_ENDPOINTS.VEHICLE_DELETE);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverVehicle'] });
      Alert.alert('Success', 'Vehicle removed successfully.');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Failed to delete vehicle')
  });
};

// ==========================================
// 5. FACE RECOGNITION HOOKS
// ==========================================

export interface FaceVerifyResult {
  child_id: string | null;
  child_name: string;
  confidence: number;
  is_match: boolean;
  sample_base64?: string;
  attendance?: {
    action: string;
    message: string;
  };
}

export interface FaceVerifyPayload {
  image: string;
  latitude?: number | null;
  longitude?: number | null;
}

export const useFaceVerify = () => {
  return useMutation({
    mutationFn: async (payload: FaceVerifyPayload): Promise<FaceVerifyResult> => {
      const { data } = await apiClient.post(API_ENDPOINTS.FACE_VERIFY, payload, {
        timeout: 15000,
      });
      return data;
    },
  });
};

// ==========================================
// 6. TRIP MANAGEMENT & GEOFENCE HOOKS
// ==========================================

export const useStartTrip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { type: string, start_lat: number, start_lon: number }) => {
      const { data } = await apiClient.post(API_ENDPOINTS.TRIP_START, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTrip'] });
      Alert.alert('Success', 'Trip started successfully');
    },
  });
};

export const useEndTrip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { trip_id: string, end_lat: number, end_lon: number }) => {
      const { data } = await apiClient.post(API_ENDPOINTS.TRIP_END, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTrip'] });
      Alert.alert('Success', 'Trip ended successfully');
    },
  });
};

export const useActiveTrip = () => {
  return useQuery({
    queryKey: ['activeTrip'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.TRIP_ACTIVE);
      return data.data;
    },
  });
};

export const useTripHistory = () => {
  return useQuery({
    queryKey: ['tripHistory'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.TRIP_HISTORY);
      return data.data;
    },
  });
};

export const usePendingDropoffs = (isTripActive: boolean) => {
  return useQuery({
    queryKey: ['pendingDropoffs'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.PENDING_DROPOFFS);
      return data.data; 
    },
    enabled: isTripActive,
    refetchInterval: isTripActive ? 15000 : false,
  });
};
