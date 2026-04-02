import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useLogin } from '../hooks/useApi';
import { router } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();

  return (
    <View className="flex-1 justify-center items-center bg-white p-6">
      <Image 
        source={require('../assets/images/sisuraksha_logo.png')} 
        style={{ width: 120, height: 120, marginBottom: 16 }}
        resizeMode="contain" 
      />
      <Text className="text-3xl font-bold text-center mb-8 text-slate-800">Welcome Back</Text>
      
      <View className="w-full">
      <TextInput 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4"
        autoCapitalize="none"
      />
      <TextInput 
        placeholder="Password" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry 
        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6"
      />

      <TouchableOpacity 
        onPress={() => loginMutation.mutate({ email, password })} 
        className="w-full bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-200"
      >
        {loginMutation.isPending ? <ActivityIndicator color="#fff"/> : (
          <Text className="text-white font-bold text-lg">Log In</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/')} className="mt-6 items-center w-full">
        <Text className="text-slate-500">Don't have an account? <Text className="text-blue-600 font-bold">Sign Up</Text></Text>
      </TouchableOpacity>
      </View>
    </View>
  );
}