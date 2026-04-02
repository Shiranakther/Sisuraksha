import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compress and resize an image URI for upload.
 * Reduces from ~3-4MB to ~100-200KB while retaining enough quality for face recognition.
 */
export const compressImage = async (uri: string): Promise<string> => {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 640 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
};
