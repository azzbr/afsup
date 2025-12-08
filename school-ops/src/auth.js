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

// --- ATOMIC USER CREATION WITH REGISTRATION FLAG ---
export const createUserAccount = async (email, password, nameData) => {
  console.log('🔵 STEP 1: Starting createUserAccount for:', email);
  
  // SET FLAG: Tell App.jsx to IGNORE this user during registration
  localStorage.setItem('REGISTRATION_IN_PROGRESS', 'true');
  console.log('🔵 STEP 1.5: Set registration flag to prevent App.jsx interference');
  
  let user = null;

  try {
    // 1. Create Firebase Auth user (they get auto-logged in)
    console.log('🔵 STEP 2: Creating Auth user...');
    const result = await createUserWithEmailAndPassword(auth, email, password);
    user = result.user;
    console.log('✅ STEP 2: Auth user created. UID:', user.uid);

    // Check if this is the super admin account
    const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    console.log('🔵 STEP 3: Is super admin?', isSuperAdmin);

    // Construct the full name for display
    const fullName = `${nameData.firstName} ${nameData.middleName ? nameData.middleName + ' ' : ''}${nameData.lastName}`;
    console.log('🔵 STEP 4: Full name constructed:', fullName);

    // 2. Update Auth Profile
    console.log('🔵 STEP 5: Updating Auth profile...');
    await updateProfile(user, {
      displayName: fullName
    });
    console.log('✅ STEP 5: Profile updated');

    // 3. Create user record in Firestore
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

    console.log('🔵 STEP 6: Writing to Firestore (user is authenticated)...');

    // Write the document
    await setDoc(doc(db, 'users', user.uid), userDoc);

    console.log('✅ STEP 6: Firestore document created successfully!');
    
    // Sign out immediately after writing
    console.log('🔵 STEP 7: Signing out user...');
    await signOut(auth);
    console.log('✅ STEP 7: User signed out');
    
    // CLEAR FLAG: Registration complete
    localStorage.removeItem('REGISTRATION_IN_PROGRESS');
    console.log('✅ STEP 8: Cleared registration flag');
    
    console.log('✅ ALL STEPS COMPLETE - Registration successful');

    return { success: true, user: user, isSuperAdmin };

  } catch (error) {
    console.error('❌ ERROR in createUserAccount:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    
    // CLEAR FLAG: Registration failed
    localStorage.removeItem('REGISTRATION_IN_PROGRESS');

    // ROLLBACK: Delete the Auth user
    if (user) {
      console.log('⚠️ ROLLBACK: Attempting to delete orphaned auth user...');
      try {
        await deleteUser(user);
        console.log('✅ ROLLBACK: Auth user deleted successfully');
      } catch (cleanupError) {
        console.error('❌ ROLLBACK FAILED:', cleanupError);
      }
    }

    // User Friendly Error Message
    let errorMsg = error.message;
    if (error.code === 'permission-denied') {
      errorMsg = 'Database permission denied. Please contact IT support.';
    } else if (error.code === 'auth/email-already-in-use') {
      errorMsg = 'This email is already registered. Please login instead.';
    }

    console.log('❌ Returning error:', errorMsg);
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