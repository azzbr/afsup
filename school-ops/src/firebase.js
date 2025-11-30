// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBpUjZWFDpOSdcUUDb0227-sOiNl6Thge0",
  authDomain: "afsup-3ff9b.firebaseapp.com",
  projectId: "afsup-3ff9b",
  storageBucket: "afsup-3ff9b.firebasestorage.app",
  messagingSenderId: "862713621496",
  appId: "1:862713621496:web:077626e00e2a88dbe5c40d",
  measurementId: "G-BQDWZ7SWXJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
