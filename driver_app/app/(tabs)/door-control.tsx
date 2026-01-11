import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, Vibration, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type DoorStatus = 'locked' | 'unlocked' | 'unlocking';
type SensorStatus = 'normal' | 'warning' | 'danger';

interface SensorData {
  smoke: SensorStatus;
  fire: SensorStatus;
  gas: SensorStatus;
}

export default function DoorControlScreen() {
  // State
  const [doorStatus, setDoorStatus] = useState<DoorStatus>('locked');
  const [currentSpeed, setCurrentSpeed] = useState(0); // km/h from Hall Effect sensor
  const [sensors, setSensors] = useState<SensorData>({
    smoke: 'normal',
    fire: 'normal',
    gas: 'normal',
  });
  const [holdProgress] = useState(new Animated.Value(0));
  const [isHolding, setIsHolding] = useState(false);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);

  // Auto-refresh speed simulation (replace with actual Hall Effect API)
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate speed from Hall Effect sensor
      // In production, fetch from API: GET /api/speed
      setCurrentSpeed((prev) => {
        // Random fluctuation for demo
        const change = Math.random() > 0.7 ? (Math.random() > 0.5 ? 5 : -5) : 0;
        return Math.max(0, Math.min(60, prev + change));
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Check for auto-trigger conditions
  useEffect(() => {
    const hasDanger = sensors.smoke === 'danger' || sensors.fire === 'danger' || sensors.gas === 'danger';

    if (hasDanger && currentSpeed === 0 && doorStatus === 'locked') {
      // Auto-trigger door unlock
      Alert.alert(
        '🚨 Emergency Auto-Trigger',
        'Danger detected! Door will auto-unlock for safety.',
        [{ text: 'Acknowledged', onPress: () => unlockDoor('auto-trigger') }]
      );
    }
  }, [sensors, currentSpeed, doorStatus]);

  const unlockDoor = useCallback((reason: 'manual' | 'auto-trigger') => {
    setDoorStatus('unlocking');
    Vibration.vibrate(200);

    // Simulate solenoid release delay
    setTimeout(() => {
      setDoorStatus('unlocked');
      // Log to EDR (in production: POST /api/door/event)
      console.log(`Door unlocked: ${reason} at ${new Date().toISOString()}`);
    }, 500);
  }, []);

  const lockDoor = useCallback(() => {
    setDoorStatus('locked');
    Vibration.vibrate(100);
    console.log(`Door locked at ${new Date().toISOString()}`);
  }, []);

  const handlePressIn = () => {
    if (currentSpeed > 0) {
      Alert.alert(
        '⚠️ Cannot Unlock',
        `Vehicle is moving at ${currentSpeed} km/h.\nDoor can only be unlocked when stopped.`
      );
      return;
    }

    setIsHolding(true);
    holdProgress.setValue(0);

    progressAnim.current = Animated.timing(holdProgress, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    });

    progressAnim.current.start(({ finished }) => {
      if (finished) {
        unlockDoor('manual');
        setIsHolding(false);
      }
    });
  };

  const handlePressOut = () => {
    setIsHolding(false);
    if (progressAnim.current) {
      progressAnim.current.stop();
    }
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
    }
    holdProgress.setValue(0);
  };

  const getSensorIcon = (status: SensorStatus): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'normal': return 'checkmark-circle';
      case 'warning': return 'alert-circle';
      case 'danger': return 'warning';
    }
  };

  const getSensorColor = (status: SensorStatus): string => {
    switch (status) {
      case 'normal': return '#22C55E';
      case 'warning': return '#F59E0B';
      case 'danger': return '#EF4444';
    }
  };

  // Demo: Toggle sensor status for testing
  const toggleSensorDemo = (sensor: keyof SensorData) => {
    setSensors((prev) => {
      const states: SensorStatus[] = ['normal', 'warning', 'danger'];
      const currentIndex = states.indexOf(prev[sensor]);
      const nextIndex = (currentIndex + 1) % states.length;
      return { ...prev, [sensor]: states[nextIndex] };
    });
  };

  const progressWidth = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const canUnlock = currentSpeed === 0 && doorStatus === 'locked';

  return (
    <View className="flex-1 bg-slate-100">
      {/* Header */}
      <View className="bg-slate-900 pt-14 pb-4 px-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-white">Emergency Door Control</Text>
          <View className={`px-3 py-1 rounded-full ${doorStatus === 'unlocked' ? 'bg-green-500' : 'bg-slate-700'}`}>
            <Text className="text-white text-xs font-bold uppercase">{doorStatus}</Text>
          </View>
        </View>
      </View>

      {/* Main Content - Scrollable */}
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Speed & Door Status Cards */}
        <View className="flex-row gap-4 mb-6">
          {/* Current Speed */}
          <View className="flex-1 bg-white rounded-2xl p-5 shadow-sm">
            <View className="flex-row items-center mb-2">
              <Ionicons name="speedometer" size={20} color="#64748B" />
              <Text className="text-slate-500 text-xs uppercase ml-2">Current Speed</Text>
            </View>
            <View className="flex-row items-end">
              <Text className={`text-4xl font-bold ${currentSpeed === 0 ? 'text-green-500' : 'text-slate-800'}`}>
                {currentSpeed}
              </Text>
              <Text className="text-slate-400 text-lg ml-1 mb-1">km/h</Text>
            </View>
            {currentSpeed === 0 && (
              <Text className="text-green-500 text-xs mt-1">✓ Safe to unlock</Text>
            )}
          </View>

          {/* Door Status */}
          <View className={`flex-1 rounded-2xl p-5 shadow-sm ${doorStatus === 'unlocked' ? 'bg-green-50' : 'bg-white'}`}>
            <View className="flex-row items-center mb-2">
              <Ionicons name="lock-closed" size={20} color="#64748B" />
              <Text className="text-slate-500 text-xs uppercase ml-2">Door Status</Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons
                name={doorStatus === 'unlocked' ? 'lock-open' : 'lock-closed'}
                size={32}
                color={doorStatus === 'unlocked' ? '#22C55E' : '#64748B'}
              />
              <Text className={`text-xl font-bold ml-2 ${doorStatus === 'unlocked' ? 'text-green-600' : 'text-slate-700'}`}>
                {doorStatus === 'locked' ? 'Locked' : doorStatus === 'unlocking' ? 'Releasing...' : 'Unlocked'}
              </Text>
            </View>
          </View>
        </View>

        {/* Manual Override Button */}
        <View className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <View className="flex-row items-center mb-4">
            <Ionicons name="hand-left" size={24} color="#DC2626" />
            <Text className="text-lg font-bold text-slate-800 ml-2">Manual Override</Text>
          </View>

          {doorStatus === 'unlocked' ? (
            <TouchableOpacity
              onPress={lockDoor}
              className="bg-slate-800 py-5 rounded-xl flex-row items-center justify-center"
            >
              <Ionicons name="lock-closed" size={24} color="white" />
              <Text className="text-white font-bold text-lg ml-2">Lock Door</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <TouchableOpacity
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={!canUnlock}
                className={`relative overflow-hidden py-6 rounded-xl flex-row items-center justify-center ${canUnlock ? 'bg-red-500' : 'bg-slate-300'
                  }`}
              >
                {/* Progress Bar */}
                <Animated.View
                  className="absolute left-0 top-0 bottom-0 bg-red-700"
                  style={{ width: progressWidth }}
                />

                <View className="z-10 flex-row items-center">
                  <Ionicons name="lock-open" size={24} color="white" />
                  <Text className="text-white font-bold text-lg ml-2">
                    {isHolding ? 'Hold to Unlock...' : 'Hold 3 Sec to Unlock'}
                  </Text>
                </View>
              </TouchableOpacity>

              {!canUnlock && currentSpeed > 0 && (
                <View className="flex-row items-center mt-3 bg-amber-50 p-3 rounded-lg">
                  <Ionicons name="warning" size={20} color="#F59E0B" />
                  <Text className="text-amber-700 text-sm ml-2">
                    Stop the vehicle to unlock ({currentSpeed} km/h)
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Auto-Trigger Sensor Status */}
        <View className="bg-white rounded-2xl p-6 shadow-sm">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <Ionicons name="shield-checkmark" size={24} color="#2563EB" />
              <Text className="text-lg font-bold text-slate-800 ml-2">Auto-Trigger Status</Text>
            </View>
            <Text className="text-xs text-slate-400">(Tap to test)</Text>
          </View>

          {/* Sensor Grid */}
          <View className="flex-row gap-3">
            {/* Smoke Sensor */}
            <TouchableOpacity
              onPress={() => toggleSensorDemo('smoke')}
              className={`flex-1 p-4 rounded-xl border-2 ${sensors.smoke === 'normal' ? 'border-green-200 bg-green-50' :
                sensors.smoke === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                  'border-red-200 bg-red-50'
                }`}
            >
              <Ionicons name="cloud" size={28} color={getSensorColor(sensors.smoke)} />
              <Text className="text-slate-700 font-semibold mt-2">Smoke</Text>
              <View className="flex-row items-center mt-1">
                <Ionicons name={getSensorIcon(sensors.smoke)} size={14} color={getSensorColor(sensors.smoke)} />
                <Text className="text-xs ml-1 capitalize" style={{ color: getSensorColor(sensors.smoke) }}>
                  {sensors.smoke}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Fire Sensor */}
            <TouchableOpacity
              onPress={() => toggleSensorDemo('fire')}
              className={`flex-1 p-4 rounded-xl border-2 ${sensors.fire === 'normal' ? 'border-green-200 bg-green-50' :
                sensors.fire === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                  'border-red-200 bg-red-50'
                }`}
            >
              <Ionicons name="flame" size={28} color={getSensorColor(sensors.fire)} />
              <Text className="text-slate-700 font-semibold mt-2">Fire</Text>
              <View className="flex-row items-center mt-1">
                <Ionicons name={getSensorIcon(sensors.fire)} size={14} color={getSensorColor(sensors.fire)} />
                <Text className="text-xs ml-1 capitalize" style={{ color: getSensorColor(sensors.fire) }}>
                  {sensors.fire}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Gas Sensor */}
            <TouchableOpacity
              onPress={() => toggleSensorDemo('gas')}
              className={`flex-1 p-4 rounded-xl border-2 ${sensors.gas === 'normal' ? 'border-green-200 bg-green-50' :
                sensors.gas === 'warning' ? 'border-yellow-200 bg-yellow-50' :
                  'border-red-200 bg-red-50'
                }`}
            >
              <Ionicons name="flask" size={28} color={getSensorColor(sensors.gas)} />
              <Text className="text-slate-700 font-semibold mt-2">Gas Leak</Text>
              <View className="flex-row items-center mt-1">
                <Ionicons name={getSensorIcon(sensors.gas)} size={14} color={getSensorColor(sensors.gas)} />
                <Text className="text-xs ml-1 capitalize" style={{ color: getSensorColor(sensors.gas) }}>
                  {sensors.gas}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View className="mt-4 bg-slate-50 p-3 rounded-lg">
            <Text className="text-xs text-slate-500 text-center">
              Door will auto-unlock when danger is detected and vehicle is stopped
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
