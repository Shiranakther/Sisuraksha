// app/index.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRegister } from '../hooks/useApi';
import { router } from 'expo-router';
import { UserRole } from '../utils/types';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Parent');
  const registerMutation = useRegister();

  const handleRegister = () => registerMutation.mutate({ email, password, role });

  return (
    <View className="flex-1 justify-center bg-white p-6">
      <Text className="text-3xl font-bold text-center mb-2 text-slate-800">Create Account</Text>
      <Text className="text-slate-500 text-center mb-8">Join the Smart School Bus Network</Text>

      {/* FIX: Use standard styles for the toggle to prevent NativeWind crash */}
      <View style={styles.roleContainer}>
        {['Parent', 'Driver'].map((r) => {
          const isActive = role === r;
          return (
            <TouchableOpacity 
              key={r} 
              onPress={() => setRole(r as UserRole)}
              style={[styles.roleButton, isActive && styles.roleButtonActive]}
            >
              <Text style={[styles.roleText, isActive && styles.roleTextActive]}>
                {r}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-base"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput 
        placeholder="Password" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry 
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-base"
      />

      <TouchableOpacity 
        onPress={handleRegister} 
        className="bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-200"
      >
        {registerMutation.isPending ? <ActivityIndicator color="#fff"/> : (
          <Text className="text-white font-bold text-lg">Sign Up as {role}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')} className="mt-6 items-center">
        <Text className="text-slate-500">Already have an account? <Text className="text-blue-600 font-bold">Log In</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

// Add these standard styles at the bottom
const styles = StyleSheet.create({
  roleContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 4, marginBottom: 24 },
  roleButton: { flex: 1, padding: 12, borderRadius: 6, alignItems: 'center' },
  roleButtonActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  roleText: { color: '#64748b', fontWeight: '500' },
  roleTextActive: { color: '#2563EB', fontWeight: '700' },
});