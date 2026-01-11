import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenService } from './storage';
import { router } from 'expo-router';
import { API_ENDPOINTS } from './endpoints';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}


const BASE_URL = 'http://192.168.51.84:5000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await tokenService.getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    // Don't retry if:
    // 1. Already retried
    // 2. No original request
    // 3. Not a 401 error
    // 4. It's the refresh endpoint itself (prevents infinite loop)
    const isRefreshEndpoint = originalRequest?.url?.includes('/auth/refresh');

    if (
      originalRequest &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isRefreshEndpoint
    ) {
      originalRequest._retry = true;
      try {
        const response = await axios.post<{ token: string }>(
          `${BASE_URL}${API_ENDPOINTS.REFRESH}`,
          {},
          { withCredentials: true }
        );

        const newToken = response.data.token;
        await tokenService.setAccessToken(newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - clear token and redirect to login
        await tokenService.clearToken();
        router.replace('/');
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;