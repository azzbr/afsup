// Import Firestore for user management
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, updateProfile, deleteUser } from 'firebase/auth';
import { auth } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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
    await setPersistence(auth, browserLocalPersistence);
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

// Initialize authentication with persistence
export const initializeAuth = async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
    return { success: true };
  } catch (error) {
    console.error('Auth persistence initialization error:', error);
    return { success: false, error: error.message };
  }
};

// Auth state listener
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// Super admin email - this account is auto-approved with admin role
const SUPER_ADMIN_EMAIL = 'admin@afs.edu.bh';

// --- ATOMIC USER CREATION ---
export const createUserAccount = async (email, password, nameData) => {
  let user = null;
  try {
    // 1. Create Firebase Auth user
    const result = await createUserWithEmailAndPassword(auth, email, password);
    user = result.user;

    // Check if this is the super admin account
    const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

    // Construct the full name for display
    const fullName = `${nameData.firstName} ${nameData.middleName ? nameData.middleName + ' ' : ''}${nameData.lastName}`;

    // 2. Update Auth Profile immediately
    await updateProfile(user, {
      displayName: fullName
    });

    // 3. Create user record in Firestore (CRITICAL: Wait for this!)
    const userDoc = {
      uid: user.uid,
      email: user.email,
      role: isSuperAdmin ? 'admin' : 'staff',
      status: isSuperAdmin ? 'approved' : 'pending',
      viewAll: isSuperAdmin ? true : false,
      createdAt: new Date(),
      isActive: true,
      firstName: nameData.firstName,
      middleName: nameData.middleName || '',
      lastName: nameData.lastName,
      arabicName: '',
      displayName: fullName,
      nationality: 'Bahraini',
      gender: 'Male',
      maritalStatus: 'Single',
      cprNumber: '',
      cprExpiry: null,
      passportNumber: '',
      passportExpiry: null,
      residencePermitNumber: '',
      residencePermitExpiry: null,
      workPermitNumber: '',
      iban: 'BH',
      bankName: 'National Bank of Bahrain (NBB)',
      dateOfJoining: null,
      sickDaysUsed: 0,
      annualLeaveBalance: 30,
      phoneNumber: '',
    };

    // This ensures the document exists BEFORE we return success
    await setDoc(doc(db, 'users', user.uid), userDoc);

    return { success: true, user: user, isSuperAdmin };

  } catch (error) {
    console.error('Account creation error:', error);

    // ROLLBACK: If Firestore write failed, delete the Auth user
    // so the user isn't stuck in "Zombie" state.
    if (user) {
      try {
        await deleteUser(user);
        console.log('Rolled back orphaned auth user');
      } catch (cleanupError) {
        console.error('Failed to cleanup user:', cleanupError);
      }
    }

    // User Friendly Error Message
    let errorMsg = error.message;
    if (error.code === 'permission-denied') {
      errorMsg = 'System registration is currently locked. Please contact IT.';
    } else if (error.code === 'auth/email-already-in-use') {
      errorMsg = 'This email is already registered. Please login instead.';
    }

    return { success: false, error: errorMsg };
  }
};

export const getUserData = async (uid) => {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return { success: true, data: userSnap.data() };
    }
    return { success: false, error: 'User profile not found' };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { success: false, error: error.message };
  }
};

export const updateUserData = async (uid, updates) => {
  try {
    await setDoc(doc(db, 'users', uid), updates, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('Error updating user data:', error);
    return { success: false, error: error.message };
  }
};
