import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';
import { compressImage } from '../hooks/useImageCompression';

interface FaceRegistrationProps {
  childId: string;
  childName: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

const MAX_PHOTOS = 3;

export default function FaceRegistration({ childId, childName, onComplete, onCancel }: FaceRegistrationProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Request camera permission
  if (!permission) {
    return <View className="flex-1 justify-center items-center"><ActivityIndicator size="large" /></View>;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 justify-center items-center p-6">
        <Ionicons name="camera-outline" size={64} color="#94A3B8" />
        <Text className="text-lg font-semibold text-slate-700 mt-4 text-center">
          Camera permission is required for face registration
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="bg-blue-500 rounded-xl px-6 py-3 mt-4"
        >
          <Text className="text-white font-bold text-base">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current || photos.length >= MAX_PHOTOS) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        skipProcessing: true,
      });

      if (photo?.uri) {
        const compressedUri = await compressImage(photo.uri);
        console.log(`[FaceReg] 📸 Photo ${photos.length + 1} captured:`, compressedUri.substring(0, 80));
        setPhotos(prev => [...prev, compressedUri]);
      }
    } catch (error) {
      console.error('[FaceReg] ❌ takePicture error:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const uploadPhotos = async () => {
    if (photos.length === 0) {
      Alert.alert('Error', 'Please capture at least 1 photo');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    console.log(`[FaceReg] 🚀 Uploading ${photos.length} photos for child: ${childName} (${childId})`);

    try {
      const formData = new FormData();
      formData.append('child_id', childId);

      for (let i = 0; i < photos.length; i++) {
        const file = {
          uri: photos[i],
          type: 'image/jpeg',
          name: `face_${i + 1}.jpg`,
        } as any;
        formData.append('images', file);
        console.log(`[FaceReg] 📎 Appended image ${i + 1}: ${file.name} @ ${photos[i].substring(0, 60)}...`);
      }

      console.log('[FaceReg] 📤 POST', API_ENDPOINTS.FACE_REGISTER, '| child_id:', childId, '| images:', photos.length);

      const { data } = await apiClient.post(API_ENDPOINTS.FACE_REGISTER, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      console.log('[FaceReg] ✅ Response:', JSON.stringify(data));

      setUploadResult(`Face registered with ${data.faces_saved} images`);
      Alert.alert(
        'Success',
        `Face registered for ${childName} with ${data.faces_saved} images.`,
        [{ text: 'OK', onPress: onComplete }]
      );
    } catch (error: any) {
      const status = error.response?.status;
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Face registration failed';
      console.error('[FaceReg] ❌ Upload error:', status, msg);
      console.error('[FaceReg] Full error:', JSON.stringify(error.response?.data));
      setUploadResult(null);
      Alert.alert('Registration Failed', msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-xl font-bold text-slate-800">Face Registration</Text>
          {onCancel && (
            <TouchableOpacity onPress={onCancel}>
              <Ionicons name="close" size={28} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
        <Text className="text-sm text-slate-500">
          Capture {MAX_PHOTOS} photos of <Text className="font-semibold">{childName}</Text> for face recognition
        </Text>
      </View>

      {/* Camera View */}
      {photos.length < MAX_PHOTOS && (
        <View className="mx-4 mt-2 rounded-2xl overflow-hidden" style={{ height: 350 }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
          >
            {/* Capture overlay */}
            <View className="flex-1 justify-end items-center pb-6">
              <View className="bg-black/40 rounded-full px-4 py-1 mb-4">
                <Text className="text-white text-sm font-medium">
                  Photo {photos.length + 1} of {MAX_PHOTOS}
                </Text>
              </View>
              <TouchableOpacity
                onPress={takePicture}
                className="bg-white rounded-full p-4"
                activeOpacity={0.7}
              >
                <Ionicons name="camera" size={32} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}

      {/* Photo Previews */}
      {photos.length > 0 && (
        <View className="px-4 mt-4">
          <Text className="text-sm font-semibold text-slate-600 mb-2">
            Captured Photos ({photos.length}/{MAX_PHOTOS})
          </Text>
          <View className="flex-row gap-3">
            {photos.map((uri, index) => (
              <View key={index} className="relative">
                <Image
                  source={{ uri }}
                  className="w-24 h-24 rounded-xl"
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => removePhoto(index)}
                  className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
                >
                  <Ionicons name="close" size={14} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View className="px-4 mt-6 mb-8 gap-3">
        {photos.length >= MAX_PHOTOS && (
          <View className="bg-green-50 rounded-xl p-3 flex-row items-center mb-2">
            <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
            <Text className="text-green-700 text-sm ml-2 font-medium">
              All {MAX_PHOTOS} photos captured. Ready to register!
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={uploadPhotos}
          disabled={photos.length === 0 || isUploading}
          className={`rounded-xl py-4 items-center ${photos.length === 0 || isUploading
              ? 'bg-slate-200'
              : 'bg-blue-500'
            }`}
        >
          {isUploading ? (
            <View className="flex-row items-center">
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-bold text-base ml-2">Registering Face...</Text>
            </View>
          ) : (
            <Text className={`font-bold text-base ${photos.length === 0 ? 'text-slate-400' : 'text-white'
              }`}>
              Register Face ({photos.length} photos)
            </Text>
          )}
        </TouchableOpacity>

        {photos.length > 0 && photos.length < MAX_PHOTOS && (
          <Text className="text-center text-xs text-slate-400">
            You can register with {photos.length} photo{photos.length > 1 ? 's' : ''}, but {MAX_PHOTOS} is recommended for best accuracy
          </Text>
        )}

        {uploadResult && (
          <View className="bg-blue-50 rounded-xl p-3 mt-2">
            <Text className="text-blue-700 text-sm text-center">{uploadResult}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
