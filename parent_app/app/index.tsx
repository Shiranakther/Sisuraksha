
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRegister } from '../hooks/useApi';
import { router } from 'expo-router';
import { UserRole } from '../utils/types';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function RegisterForm() {
  const insets = useSafeAreaInsets();
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
    <ScrollView 
      className="bg-white" 
      contentContainerStyle={{ 
        flexGrow: 1, 
        justifyContent: 'center',
        paddingHorizontal: 24, 
        paddingTop: Math.max(insets.top, 20) + 24,
        paddingBottom: Math.max(insets.bottom, 20) + 50
      }}
    >
      <View className="items-center mb-4">
        <Image 
          source={require('../assets/images/sisuraksha_logo.png')} 
          style={{ width: 120, height: 120 }}
          resizeMode="contain" 
        />
      </View>
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

export default function IndexScreen() {
  const [isReady, setIsReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0); // 0: Splash, 1: Page 1, 2: Page 2

  useEffect(() => {
    async function checkStatus() {
      try {
        const seen = await SecureStore.getItemAsync('hasSeenOnboarding');
        if (seen === 'true') {
          setHasSeenOnboarding(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsReady(true);
      }
    }
    checkStatus();
  }, []);

  useEffect(() => {
    if (isReady && !hasSeenOnboarding && onboardingStep === 0) {
      const timer = setTimeout(() => {
        setOnboardingStep(1);
      }, 2500); // 2.5 seconds before transitioning
      return () => clearTimeout(timer);
    }
  }, [isReady, hasSeenOnboarding, onboardingStep]);

  const completeOnboarding = async () => {
    await SecureStore.setItemAsync('hasSeenOnboarding', 'true');
    setHasSeenOnboarding(true);
  };

  if (!isReady) {
    return <View className="flex-1 bg-white" />;
  }

  if (!hasSeenOnboarding) {
    if (onboardingStep === 0) {
      // Step 0: Splash Screen
      return (
        <View className="flex-1 bg-white items-center justify-center">
          <Image 
            source={require('../assets/images/sisuraksha_logo.png')} 
            style={{ width: 250, height: 250 }}
            resizeMode="contain" 
          />
        </View>
      );
    }

    const isLastStep = onboardingStep === 2;
    
    // Steps 1 & 2: Onboarding Pages
    return (
      <View className="flex-1 bg-blue-50 px-6 pt-20 pb-10 justify-between">
        <View className="flex-1 justify-center items-center">
          <View className="bg-white p-6 rounded-full shadow-sm mb-10">
            <Image 
              source={require('../assets/images/sisuraksha_logo.png')} 
              style={{ width: 140, height: 140 }}
              resizeMode="contain" 
            />
          </View>
          <Text className="text-3xl font-bold text-blue-950 text-center mb-6">
            {onboardingStep === 1 ? 'Real-Time Bus Tracking' : 'Smart Attendance & Safety Alerts'}
          </Text>
          <Text className="text-base text-blue-800 text-center leading-6 tracking-wide">
            {onboardingStep === 1 
              ? 'Monitor your child’s school bus journey in real time. Stay updated with accurate location tracking and live status updates for complete peace of mind.' 
              : 'Get instant notifications when your child boards or exits the bus. Receive safety alerts and important updates directly on your phone.'}
          </Text>
        </View>

        <View className="w-full">
          {/* Progress Indicator (Dots) */}
          <View className="flex-row justify-center mb-8 gap-3">
            <View className={`h-2.5 rounded-full ${onboardingStep === 1 ? 'w-8 bg-blue-600' : 'w-2.5 bg-blue-200'}`} />
            <View className={`h-2.5 rounded-full ${onboardingStep === 2 ? 'w-8 bg-blue-600' : 'w-2.5 bg-blue-200'}`} />
          </View>
          
          <TouchableOpacity 
            onPress={() => isLastStep ? completeOnboarding() : setOnboardingStep(2)}
            className="bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-300 active:bg-blue-700"
          >
            <Text className="text-white font-bold text-lg">Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Once completed or already seen, render Register Form
  return <RegisterForm />;
}