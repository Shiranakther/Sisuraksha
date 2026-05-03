import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFaceVerify } from '../hooks/useApi';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCANNER_SIZE = SCREEN_WIDTH * 0.7;

interface FaceScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (result: any) => void;
}

export default function FaceScannerModal({ visible, onClose, onSuccess }: FaceScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const cameraRef = useRef<any>(null);
  const faceVerifyMutation = useFaceVerify();

  useEffect(() => {
    if (visible) {
      console.log('[FaceScanner] Opening in Absolute View Mode');
      setLastResult(null);
      setIsProcessing(false);
      setIsCameraReady(false);
      
      // Safety delay for hardware initialization
      const timer = setTimeout(() => setShowCamera(true), 400);
      return () => {
        clearTimeout(timer);
        setShowCamera(false);
      };
    }
  }, [visible]);

  const handleCapture = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing) return;

    try {
      setIsProcessing(true);
      console.log('[FaceScanner] Capture sequence started');
      
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Location access required.');
        setIsProcessing(false);
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      const photo = await cameraRef.current.takePictureAsync(); 

      const manipulated = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 320 } }], 
        { format: SaveFormat.JPEG, base64: true, compress: 0.5 }
      );

      const result = await faceVerifyMutation.mutateAsync({
        image: manipulated.base64 || '',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      setLastResult(result);

      if (result.is_match) {
        if (onSuccess) onSuccess(result);
        setTimeout(() => onClose(), 2000);
      } else {
        Alert.alert('No Match', result.message || 'Face not recognized.');
        setIsProcessing(false);
      }
    } catch (error: any) {
      console.error('[FaceScanner] Capture Error:', error);
      Alert.alert('Error', 'Capture failed. Please try again.');
      setIsProcessing(false);
    }
  };

  if (!visible) return null;

  // Render over everything using Absolute Position instead of Modal
  return (
    <View style={styles.absoluteContainer}>
      <View style={styles.container}>
        {!permission ? (
           <View style={styles.center}><ActivityIndicator size="large" color="white" /></View>
        ) : !permission.granted ? (
          <View style={styles.permissionContainer}>
            <Ionicons name="camera" size={64} color="#3B82F6" />
            <Text style={styles.title}>Camera Access</Text>
            <Text style={styles.subtitle}>We need camera access to identify students.</Text>
            <TouchableOpacity style={styles.btn} onPress={() => requestPermission()}>
              <Text style={styles.btnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ marginTop: 20 }}>
              <Text style={{ color: '#64748B' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : showCamera ? (
          <CameraView 
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            onCameraReady={() => setIsCameraReady(true)}
            onMountError={(err) => console.error('Camera Mount Err:', err)}
          >
            <View style={styles.overlay}>
              <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                  <Ionicons name="close" size={28} color="white" />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setIsCameraReady(false);
                    setFacing(f => f === 'back' ? 'front' : 'back');
                  }}
                  style={styles.iconBtn}
                >
                  <Ionicons name="camera-reverse" size={28} color="white" />
                </TouchableOpacity>
              </View>

              <View style={styles.scanArea}>
                <View style={styles.scannerFrame}>
                  <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
                  <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
                  <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
                  <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />

                  {(isProcessing || !isCameraReady) && <ActivityIndicator size="large" color="#3B82F6" />}

                  {lastResult?.is_match && (
                    <View style={styles.resultBadge}>
                      <Ionicons name="checkmark-circle" size={40} color="white" />
                      <Text style={styles.resultText}>{lastResult.child_name}</Text>
                      <Text style={styles.resultSub}>{lastResult.attendance?.message || 'Boarded'}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.hint}>
                  {!isCameraReady ? 'Hardware starting...' : (isProcessing ? 'Verifying...' : 'Align face in frame')}
                </Text>
              </View>

              <View style={styles.footer}>
                {!isProcessing && isCameraReady && !lastResult?.is_match && (
                  <TouchableOpacity onPress={handleCapture} style={styles.captureBtn}>
                    <View style={styles.captureInner} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </CameraView>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="white" />
            <Text style={{ color: 'white', marginTop: 15 }}>Warming up camera...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999, // Ensure it sits on top of everything
    backgroundColor: 'black',
  },
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20 },
  iconBtn: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25 },
  scanArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scannerFrame: { width: SCANNER_SIZE, height: SCANNER_SIZE, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#3B82F6' },
  hint: { color: 'white', marginTop: 30, fontSize: 16, fontWeight: 'bold' },
  footer: { paddingBottom: 60, alignItems: 'center' },
  captureBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white' },
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: 'white' },
  title: { fontSize: 22, fontWeight: 'bold', marginTop: 20, color: '#1E293B' },
  subtitle: { textAlign: 'center', color: '#64748B', marginTop: 10, marginBottom: 30 },
  btn: { backgroundColor: '#2563EB', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  btnText: { color: 'white', fontWeight: 'bold' },
  resultBadge: { backgroundColor: 'rgba(16, 185, 129, 0.95)', padding: 25, borderRadius: 25, alignItems: 'center', width: '85%' },
  resultText: { color: 'white', fontWeight: 'bold', fontSize: 20, marginTop: 10 },
  resultSub: { color: 'white', fontSize: 14, opacity: 0.9 }
});
