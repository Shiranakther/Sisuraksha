import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenService } from './storage';
import { router } from 'expo-router';
import { API_ENDPOINTS } from './endpoints';
import { API_BASE_URL } from './networkConfig';
export { API_BASE_URL, API_ORIGIN_URL, WS_ORIGIN_URL } from './networkConfig';

interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}


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
  baseURL: API_BASE_URL,
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

    const isRefreshEndpoint = originalRequest?.url?.includes(API_ENDPOINTS.REFRESH);

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isRefreshEndpoint
    ) {
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
        
        if (!currentRefreshToken) {
          throw new Error('No refresh token stored');
        }

        const response = await axios.post<{ token: string; refreshToken: string }>(
          `${API_BASE_URL}${API_ENDPOINTS.REFRESH}`,
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
