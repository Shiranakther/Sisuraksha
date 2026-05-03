import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { tokenService } from '../api/storage';
import { jwtDecode } from 'jwt-decode';
import { AuthContextType, User } from '../utils/types';
import axios from 'axios';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface DecodedToken extends User { exp: number; }

const BASE_URL = 'http://192.168.1.96:5000/api';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const token = await tokenService.getAccessToken();
      if (token) {
        try {
          const decoded = jwtDecode<DecodedToken>(token);
          if (decoded.exp * 1000 > Date.now()) {
            // Token is still valid
            setUser({ userId: decoded.userId, role: decoded.role, email: decoded.email });
          } else {
            // Token expired — attempt silent refresh before logging out
            try {
              const refreshToken = await tokenService.getRefreshToken();
              if (!refreshToken) throw new Error('No refresh token');

              const response = await axios.post<{ token: string; refreshToken: string; data: User }>(
                `${BASE_URL}/auth/refresh`,
                { refreshToken },
                { withCredentials: true }
              );
              const newToken = response.data.token;
              const newRefreshToken = response.data.refreshToken;
              await tokenService.setAccessToken(newToken);
              if (newRefreshToken) await tokenService.setRefreshToken(newRefreshToken);

              const newDecoded = jwtDecode<DecodedToken>(newToken);
              setUser({ userId: newDecoded.userId, role: newDecoded.role, email: newDecoded.email });
            } catch {
              // Refresh failed — clear session and let the router redirect to login
              await tokenService.clearToken();
            }
          }
        } catch {
          await tokenService.clearToken();
        }
      }
      setIsLoading(false);
    };
    loadUser();
  }, []);

  const signIn = async (token: string, userData: User) => {
    await tokenService.setAccessToken(token);
    setUser(userData);
  };

  const signOut = async () => {
    await tokenService.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};