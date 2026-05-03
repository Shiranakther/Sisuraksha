import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export const tokenService = {
  setAccessToken: async (token: string) => {
    if (!token || typeof token !== 'string') {
      console.warn('[Storage] Invalid access token');
      return;
    }
    if (Platform.OS === 'web') {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    }
  },
  getAccessToken: async () => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  setRefreshToken: async (token: string) => {
    if (!token || typeof token !== 'string') {
      console.warn('[Storage] Invalid refresh token');
      return;
    }
    if (Platform.OS === 'web') {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    }
  },
  getRefreshToken: async () => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  onTokenClear: [] as (() => void)[],
  subscribeToClear: (callback: () => void) => {
    tokenService.onTokenClear.push(callback);
  },
  clearToken: async () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
    // Broadcast to listeners
    tokenService.onTokenClear.forEach(cb => cb());
  },
};