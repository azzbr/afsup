import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Compress image before upload
export const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Compress to JPEG at 70% quality for storage
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
  });
};

// Upload image to Firebase Storage and get download URL
export const uploadImage = async (file, ticketId) => {
  try {
    // Create a unique filename
    const timestamp = Date.now();
    const filename = `ticket-images/${ticketId}_${timestamp}.jpg`;
    const storageRef = ref(storage, filename);

    // Convert data URL to blob
    const response = await fetch(file);
    const blob = await response.blob();

    // Upload to Firebase Storage
    const snapshot = await uploadBytes(storageRef, blob);

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    return { success: true, downloadURL, filename };
  } catch (error) {
    console.error('Image upload error:', error);
    return { success: false, error: error.message };
  }
};
