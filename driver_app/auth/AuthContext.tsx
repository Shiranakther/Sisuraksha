import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { tokenService } from '../api/storage';
import { jwtDecode } from 'jwt-decode';
import { AuthContextType, User } from '../utils/types';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface DecodedToken extends User { exp: number; }

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
            setUser({ userId: decoded.userId, role: decoded.role, email: decoded.email });
          } else {
             await tokenService.clearToken();
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