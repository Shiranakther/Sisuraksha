import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenService } from './storage';
import { router } from 'expo-router';
import { API_ENDPOINTS } from './endpoints';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}


const BASE_URL = 'http://192.168.1.96:5000/api';

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

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

    // Only attempt refresh on 401 errors for non-auth requests
    if (error.response?.status === 401 && !originalRequest._retry) {
      
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const currentRefreshToken = await tokenService.getRefreshToken();
        
        // GUARD: If we don't even have a refresh token, don't bother the server
        if (!currentRefreshToken) {
          throw new Error('No refresh token stored');
        }

        console.log('[Auth] Attempting token refresh...');
        const response = await axios.post<{ token: string; refreshToken: string }>(
          `${BASE_URL}${API_ENDPOINTS.REFRESH}`,
          { refreshToken: currentRefreshToken },
          { withCredentials: true }
        );

        const newToken = response.data.token;
        const newRefreshToken = response.data.refreshToken;

        await tokenService.setAccessToken(newToken);
        if (newRefreshToken) await tokenService.setRefreshToken(newRefreshToken);

        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        processQueue(null, newToken);
        return apiClient(originalRequest);

      } catch (refreshError) {
        console.error('[Auth] Refresh failed, logging out');
        processQueue(refreshError, null);
        await tokenService.clearToken();
        router.replace('/');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;