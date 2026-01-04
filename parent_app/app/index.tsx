


import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useRegister } from '../hooks/useApi';
import { router } from 'expo-router';
import { UserRole } from '../utils/types';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  //  New State Variables for required backend fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');


  const role: UserRole = 'Parent';

  const registerMutation = useRegister();

  const handleRegister = () => {
    // 1. Validation: Check all fields
    if (!email.trim() || !password.trim() || !firstName.trim() || !lastName.trim() ) {
      alert('All fields are required');
      return;
    }

    console.log('REGISTER PAYLOAD ', {
      email: email.trim(),
      password,
      role,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      
    });

    // 2. Send all data to mutation
    registerMutation.mutate({
      email: email.trim(),
      password,
      role,
      first_name: firstName.trim(),
      last_name: lastName.trim()
      
    });
  };

  return (
    //  Changed View to ScrollView to handle keyboard covering inputs
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} className="bg-white p-6">
      
      <Text className="text-3xl font-bold text-center mb-2 text-slate-800">
        Create Parent Account
      </Text>
      <Text className="text-slate-500 text-center mb-8">
        Join the Smart School Bus Network
      </Text>

      {/* --- Name Fields Row --- */}
      <View className="flex-row justify-between mb-4">
        <TextInput 
          placeholder="First Name" 
          value={firstName} 
          onChangeText={setFirstName} 
          className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-[48%] text-base"
        />
        <TextInput 
          placeholder="Last Name" 
          value={lastName} 
          onChangeText={setLastName} 
          className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-[48%] text-base"
        />
      </View>

      

      {/* --- Email Field --- */}
      <TextInput 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-base"
        autoCapitalize="none"
        keyboardType="email-address"
      />

      {/* --- Password Field --- */}
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
        {registerMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white font-bold text-lg">Sign Up as Parent</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')} className="mt-6 items-center">
        <Text className="text-slate-500">
          Already have an account? <Text className="text-blue-600 font-bold">Log In</Text>
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}