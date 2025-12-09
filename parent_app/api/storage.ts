import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'auth_access_token';

export const tokenService = {
  setAccessToken: async (token: string) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },
  getAccessToken: async () => {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  clearToken: async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  },
};