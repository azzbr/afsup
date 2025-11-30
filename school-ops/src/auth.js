// Import Firestore for user management
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Anonymous authentication for public reporting
export const signInAsAnonymous = async () => {
  try {
    const result = await signInAnonymously(auth);
    return { success: true, user: result.user };
  } catch (error) {
    console.error('Anonymous sign-in error:', error);
    return { success: false, error: error.message };
  }
};

// Email/password authentication for staff/admin
export const signInWithCredentials = async (email, password) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: result.user };
  } catch (error) {
    console.error('Credential sign-in error:', error);
    return { success: false, error: error.message };
  }
};

// Sign out function
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Sign-out error:', error);
    return { success: false, error: error.message };
  }
};

// Auth state listener
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// Super admin email - this account is auto-approved with admin role
const SUPER_ADMIN_EMAIL = 'admin@afs.edu.bh';

// User registration with Firestore user record
export const createUserAccount = async (email, password) => {
  try {
    // Create Firebase Auth user
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Check if this is the super admin account
    const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    // Create user record in Firestore
    const userDoc = {
      uid: result.user.uid,
      email: result.user.email,
      role: isSuperAdmin ? 'admin' : 'staff', // Super admin gets admin role
      status: isSuperAdmin ? 'approved' : 'pending', // Super admin is auto-approved
      viewAll: isSuperAdmin ? true : false, // Super admin can view all dashboards
      createdAt: new Date(),
      isActive: true
    };

    await setDoc(doc(db, 'users', result.user.uid), userDoc);

    return { success: true, user: result.user, isSuperAdmin };
  } catch (error) {
    console.error('Account creation error:', error);
    return { success: false, error: error.message };
  }
};

// Get user data from Firestore
export const getUserData = async (uid) => {
  try {
    const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', uid)));
    if (!userDoc.empty) {
      return { success: true, data: userDoc.docs[0].data() };
    }
    return { success: false, error: 'User not found' };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { success: false, error: error.message };
  }
};

// Update user data
export const updateUserData = async (uid, updates) => {
  try {
    await setDoc(doc(db, 'users', uid), updates, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('Error updating user data:', error);
    return { success: false, error: error.message };
  }
};
