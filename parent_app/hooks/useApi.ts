import { useMutation, useQueryClient,useQuery } from '@tanstack/react-query';
import apiClient from '../api/axios';
import { useAuth } from '../auth/useAuth';
import { router } from 'expo-router';
import { AuthResponse, UserRole } from '../utils/types';
import { Alert } from 'react-native';
import { API_ENDPOINTS } from '../api/endpoints';
import { Picker } from '@react-native-picker/picker';

export const useLogin = () => {
  const { signIn } = useAuth();
  return useMutation({
    mutationFn: async (creds: {email:string, password:string}) => {
      const { data } = await apiClient.post<AuthResponse>(API_ENDPOINTS.LOGIN, creds);
      return data;
    },
    onSuccess: (data) => {
      signIn(data.token, data.data);
      router.replace('/(tabs)/home'); 
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.message || 'Login failed')
  });
};


export const useRegister = () => {
  return useMutation({
    mutationFn: async (creds: { 
      email: string; 
      password: string; 
      role: UserRole; 
      first_name: string; 
      last_name: string 
    }) => {
      const { data } = await apiClient.post(API_ENDPOINTS.REGISTER, creds);
      return data;
    },

    onSuccess: () => {
      // The backend already created the parent profile.
      Alert.alert(
        'Success', 
        'Account created! Please log in.', 
        [{ text: 'OK', onPress: () => router.push('/login') }]
      );
    },

    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Registration failed');
    },
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


type LocationData = {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
};

// 1. Hook to GET saved location
export const useMyLocation = () => {
  return useQuery({
    queryKey: ['myLocation'],
    queryFn: async () => {
      const { data } = await apiClient.get(API_ENDPOINTS.LOCATION); // Make sure this matches your route prefix (e.g. /api/profile/location)
      return data.data;
    },
  });
};

// 2. Hook to UPSERT (Update) location
export const useUpdateLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (locData: LocationData) => {
      const { data } = await apiClient.post(API_ENDPOINTS.LOCATION, locData);
      return data;
    },
    onSuccess: () => {
      // Refresh the 'myLocation' query so the UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['myLocation'] });
      Alert.alert("Success", "Location updated successfully!");
    },
    onError: (err: any) => {
      Alert.alert("Error", err.response?.data?.message || "Failed to update location");
    }
  });
};



export const useSchools = () => {
  return useQuery({
    queryKey: ['schools'],
    queryFn: async () => {
      
      const { data } = await apiClient.get(API_ENDPOINTS.SCHOOLS); 
      return data.data; 
    },
  });
};

//  Hook to Register Child 
export const useRegisterChild = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { child_name: string; school_id: string }) => {
      const response = await apiClient.post(API_ENDPOINTS.REGISTER_CHILD, data);
      return response.data;
    },
    onSuccess: () => {
      Alert.alert('Success', 'Child registered successfully!');
      // If you have a query that lists children, invalidate it here to refresh the list
      // queryClient.invalidateQueries({ queryKey: ['myChildren'] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Failed to register child');
    },
  });
};


// --- 3. Hook to Get My Registered Children ---
export const useMyChildren = () => {
  return useQuery({
    queryKey: ['myChildren'],
    queryFn: async () => {
      // Adjust route based on your router (e.g., /api/children/my_children)
      const { data } = await apiClient.get(API_ENDPOINTS.GET_MY_CHILD); 
      return data.data; 
    },
  });
};



// --- 4. Hook to Find Nearest Drivers ---
export const useFindRoutes = () => {
  return useMutation({
    mutationFn: async (data: { parentLat: number; parentLon: number; schoolId: string }) => {
      // Adjust route prefix to match your backend (e.g., /api/assign/nearest-routes)
      const response = await apiClient.post(API_ENDPOINTS.SHOW_ROUTES, data);
      return response.data; // Expecting array of drivers
    },
  });
};

// --- 5. Hook to Assign Driver ---
export const useAssignDriver = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { childId: string; driverId: string }) => {
      const response = await apiClient.post(API_ENDPOINTS.ASSIGN_DRIVER, data);
      return response.data;
    },
    onSuccess: () => {
      // Refresh the children list to show the updated assignment status
      queryClient.invalidateQueries({ queryKey: ['myChildren'] });
      Alert.alert('Success', 'Driver assigned successfully!');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.message || 'Assignment failed');
    },
  });
};