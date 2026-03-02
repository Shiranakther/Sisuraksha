// hooks/useApi.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/axios'; // Ensure this path is correct
import { useAuth } from '../auth/useAuth';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { API_ENDPOINTS } from '@/api/endpoints';
// --- Types ---
import { UserRole } from '../utils/types';



// export const useLogin = () => {
//   const { signIn } = useAuth();
//   return useMutation({
//     mutationFn: async (creds: {email:string, password:string}) => {
//       const { data } = await apiClient.post<AuthResponse>(API_ENDPOINTS.LOGIN, creds);
//       return data;
//     },
//     onSuccess: (data) => {
//       signIn(data.token, data.data);
//       router.replace('/(tabs)/home'); // 👈 Directs to TABS
//     },
//     onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Login failed')
//   });
// };

// export const useRegister = () => {
//   return useMutation({
//     mutationFn: async (creds: {email:string, password:string, role:UserRole}) => {
//       const { data } = await apiClient.post<AuthResponse>(API_ENDPOINTS.REGISTER, creds);
//       return data;
//     },
//     onSuccess: () => {
//       Alert.alert('Success', 'Account created. Please login.', [
//         { text: 'OK', onPress: () => router.push('/login') }
//       ]);
//     },
//     onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Registration failed')
//   });
// };

// export const useLogout = () => {
//   const { signOut } = useAuth();
//   const queryClient = useQueryClient();
//   return useMutation({
//     mutationFn: async () => apiClient.post(API_ENDPOINTS.LOGOUT),
//     onSettled: () => {
//       signOut();
//       queryClient.clear();
//       router.replace('/');
//     }
//   });
// };


interface RegisterPayload {
  email: string;
  password: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  address?: string;
  // Driver specific
  license_number?: string;
  trip_start_lat?: number;
  trip_start_lon?: number;
  trip_end_lat?: number;
  trip_end_lon?: number;
  school_ids?: string[];
}

interface LocationPayload {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
}

// ==========================================
// 1. AUTHENTICATION HOOKS
// ==========================================

export const useLogin = () => {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: async (creds: {email:string, password:string}) => {
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
// 2. SHARED DATA HOOKS (Schools)
// ==========================================

export const useSchools = () => {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.SCHOOLS);
      return data.data; // Expecting array: [{id, school_name, latitude, longitude}, ...]
    },
  });
};



export const useDriverChildren = () => {
  return useQuery({
    queryKey: ['driverChildren'],
    queryFn: async () => {
      // Ensure this matches the route you just created
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
      Alert.alert(
        'Registration Mode Active', 
        'Success! The IoT device is now listening. Please tap the RFID card on the device now.'
      );
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
      return data.data; // Returns array of missing students
    },
    // Refresh every 30 seconds to keep driver updated
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
      router.replace('/'); // In Driver app, login is often at '/'
      Alert.alert('Success', 'Your account has been deleted.');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to delete account');
    },
  });
};