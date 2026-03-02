import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, Image } from 'react-native';
import { useRegister, useSchools } from '../hooks/useApi'; 
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker'; 
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function DriverRegisterForm() {
  const insets = useSafeAreaInsets();
  // User Info
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  // Driver Info
  const [license, setLicense] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState(''); // The Main Destination School
  const [servedSchools, setServedSchools] = useState<string[]>([]); // Array of all schools served
  
  // Location Data
  const [currentLoc, setCurrentLoc] = useState<{lat: number, lon: number} | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);

  // Hooks
  const registerMutation = useRegister();
  const { data: schoolsList, isLoading: isLoadingSchools } = useSchools();

  // 1. Get Phone Location (Trip Start)
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need your location to set the Trip Start point.');
        setGpsLoading(false);
        return;
      }
      try {
        let location = await Location.getCurrentPositionAsync({});
        setCurrentLoc({
          lat: location.coords.latitude,
          lon: location.coords.longitude
        });
      } catch (e) {
        Alert.alert('GPS Error', 'Could not fetch location.');
      } finally {
        setGpsLoading(false);
      }
    })();
  }, []);

  // Handler to toggle schools in the multi-select list
  const toggleSchoolSelection = (id: string) => {
    if (servedSchools.includes(id)) {
      setServedSchools(servedSchools.filter(s => s !== id));
    } else {
      setServedSchools([...servedSchools, id]);
    }
  };

  const handleRegister = async () => {
    // 1. Validation
    if (!email || !password || !firstName || !lastName || !phoneNumber || !license) {
      Alert.alert('Missing Fields', 'Please fill in your personal details.');
      return;
    }
    if (!selectedSchoolId) {
      Alert.alert('Missing Destination', 'Please select a School as your final destination.');
      return;
    }
    if (!currentLoc) {
      Alert.alert('Location Error', 'We could not fetch your current location.');
      return;
    }

    // 2. Find Destination School Data
    const destSchool = schoolsList?.find((s: any) => s.id === selectedSchoolId);
    if (!destSchool || !destSchool.school_latitude || !destSchool.school_longitude) {
       Alert.alert('Data Error', 'Selected school has no location data.');
       return;
    }

    // 3. Ensure the destination school is included in the served list
    // (Using Set to remove duplicates)
    const finalSchoolIds = Array.from(new Set([...servedSchools, selectedSchoolId]));

    // 4. Register
    registerMutation.mutate({
      email, password,
      role: 'Driver',
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      license_number: license,
      
      // Start = Phone GPS
      trip_start_lat: currentLoc.lat,
      trip_start_lon: currentLoc.lon,
      
      // End = Selected School Location
      trip_end_lat: parseFloat(destSchool.school_latitude),
      trip_end_lon: parseFloat(destSchool.school_longitude),
      
      // All Served Schools
      school_ids: finalSchoolIds 
    });
  };

  return (
    <ScrollView 
      className="flex-1 bg-white" 
      contentContainerStyle={{ 
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
      <Text className="text-3xl font-bold text-center mb-2 text-slate-800">Driver Registration</Text>
      <Text className="text-slate-500 text-center mb-8">Register your bus and route</Text>

      {/* --- Personal Info --- */}
      <View className="mb-6">
        <Text className="text-slate-800 font-bold mb-3">Personal Details</Text>
        <View className="flex-row gap-4 mb-4">
          <TextInput placeholder="First Name" value={firstName} onChangeText={setFirstName} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4" />
          <TextInput placeholder="Last Name" value={lastName} onChangeText={setLastName} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4" />
        </View>
        <TextInput placeholder="Phone Number" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" autoCapitalize="none" className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4" />
        <TextInput placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4" />
        <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry className="bg-slate-50 border border-slate-200 rounded-xl p-4" />
      </View>

      {/* --- Trip Info --- */}
      <View className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
        <Text className="text-slate-800 font-bold mb-3">Route Details</Text>
        
        {/* License */}
        <TextInput 
          placeholder="Bus License Number" 
          value={license} 
          onChangeText={setLicense} 
          className="bg-white border border-slate-200 rounded-xl p-4 mb-4" 
        />

        {/* Start Point */}
        <View className="mb-4">
          <Text className="text-xs text-slate-400 uppercase font-bold mb-1">Trip Start (Your Location)</Text>
          <View className="flex-row items-center bg-green-50 p-3 rounded-lg border border-green-100">
             <Ionicons name="location" size={20} color="#16A34A" />
             {gpsLoading ? (
               <ActivityIndicator size="small" className="ml-2" />
             ) : (
               <Text className="ml-2 text-green-800 font-medium">
                 {currentLoc ? `${currentLoc.lat.toFixed(4)}, ${currentLoc.lon.toFixed(4)}` : "GPS Failed"}
               </Text>
             )}
          </View>
        </View>

        {/* End Point (School Picker) */}
        <View className="mb-4">
          <Text className="text-xs text-slate-400 uppercase font-bold mb-1">Trip End (Destination School)</Text>
          <View className="bg-white border border-slate-200 rounded-xl overflow-hidden">
             {isLoadingSchools ? (
               <ActivityIndicator className="p-4" />
             ) : (
               <Picker
                 selectedValue={selectedSchoolId}
                 onValueChange={(val) => setSelectedSchoolId(val)}
               >
                 <Picker.Item label="Select Destination..." value="" color="#94a3b8" />
                 {schoolsList?.map((s: any) => (
                   <Picker.Item key={s.id} label={s.school_name} value={s.id} />
                 ))}
               </Picker>
             )}
          </View>
        </View>

        {/* Multi-Select for Other Schools */}
        <Text className="text-xs text-slate-400 uppercase font-bold mb-2">Schools Served (Select All)</Text>
        <View className="bg-white border border-slate-200 rounded-xl p-2 max-h-40">
           <ScrollView nestedScrollEnabled>
             {isLoadingSchools ? (
               <Text className="text-center p-2 text-slate-400">Loading schools...</Text>
             ) : (
               schoolsList?.map((s: any) => {
                 const isSelected = servedSchools.includes(s.id) || selectedSchoolId === s.id;
                 return (
                   <TouchableOpacity 
                     key={s.id} 
                     onPress={() => toggleSchoolSelection(s.id)}
                     className={`flex-row items-center p-3 border-b border-slate-100 ${isSelected ? 'bg-blue-50' : ''}`}
                   >
                     <Ionicons 
                       name={isSelected ? "checkbox" : "square-outline"} 
                       size={20} 
                       color={isSelected ? "#2563EB" : "#94a3b8"} 
                     />
                     <Text className={`ml-3 ${isSelected ? 'text-blue-700 font-bold' : 'text-slate-600'}`}>
                       {s.school_name}
                     </Text>
                   </TouchableOpacity>
                 );
               })
             )}
           </ScrollView>
        </View>
      </View>

      <TouchableOpacity onPress={handleRegister} className="bg-blue-600 p-4 rounded-xl items-center shadow-lg shadow-blue-200">
        {registerMutation.isPending ? (
           <ActivityIndicator color="#fff"/> 
        ) : (
           <Text className="text-white font-bold text-lg">Register Driver</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/login')} className="mt-6 items-center">
        <Text className="text-slate-500">Already have an account? <Text className="text-blue-600 font-bold">Log In</Text></Text>
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
        const seen = await SecureStore.getItemAsync('hasSeenDriverOnboarding');
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
      }, 2500); // 2.5 seconds splash screen display
      return () => clearTimeout(timer);
    }
  }, [isReady, hasSeenOnboarding, onboardingStep]);

  const completeOnboarding = async () => {
    await SecureStore.setItemAsync('hasSeenDriverOnboarding', 'true');
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
            {onboardingStep === 1 ? 'Easily Find Students' : 'Smart Attendance & Secure Parent Connection'}
          </Text>
          <Text className="text-base text-blue-800 text-center leading-6 tracking-wide">
            {onboardingStep === 1 
              ? 'Quickly identify and manage assigned students with a clear and organized list. Reduce confusion and ensure every child boards safely and efficiently.' 
              : 'Record attendance instantly and keep parents informed in real time. Strengthen trust with accurate updates and a secure communication system.'}
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

  // Render Driver Registration Once Done
  return <DriverRegisterForm />;
}