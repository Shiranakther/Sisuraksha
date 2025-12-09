import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLogin } from '../hooks/useApi';
import { router } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();

  return (
    <View className="flex-1 justify-center bg-white p-6">
      <Text className="text-3xl font-bold text-center mb-8 text-slate-800">Welcome Back</Text>
      
      <TextInput 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4"
        autoCapitalize="none"
      />
      <TextInput 
        placeholder="Password" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry 
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6"
      />

      <TouchableOpacity 
        onPress={() => loginMutation.mutate({ email, password })} 
        className="bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-200"
      >
        {loginMutation.isPending ? <ActivityIndicator color="#fff"/> : (
          <Text className="text-white font-bold text-lg">Log In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/')} className="mt-6 items-center">
        <Text className="text-slate-500">Don't have an account? <Text className="text-blue-600 font-bold">Sign Up</Text></Text>
      </TouchableOpacity>
    </View>
  );
}