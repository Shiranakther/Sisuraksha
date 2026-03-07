import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('adminToken') || null);
  const [loading, setLoading] = useState(true);

  // Configure axios to always send token if available
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('adminToken', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('adminToken');
    }
  }, [token]);

  useEffect(() => {
    // Check if user is logged in
    const checkLogin = () => {
      try {
        if (token) {
          // You could optionally verify the token with the backend here
          // For now, we trust the token in local storage until a request fails
          setUser({ email: 'superadmin@sisuraksha.com', role: 'SuperAdmin' });
        }
      } catch (error) {
        console.error("Auth init error:", error);
        logout();
      } finally {
        setLoading(false);
      }
    };
    checkLogin();
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', { email, password });
      
      const { data, token: newToken } = response.data;
      if (data.role !== 'SuperAdmin') {
        throw new Error('Access denied. Super Admin privileges required.');
      }
      
      setToken(newToken);
      setUser(data);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      throw error.response?.data?.message || error.message || 'Error occurred during login';
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    login,
    logout,
    loading
  };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};
