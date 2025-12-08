// --- 1. Auth & User Data Loading (FIXED RACE CONDITION) ---
  useEffect(() => {
    initializeAuth();

    let unsubscribeDoc = null;
    let timeoutId = null;

    const unsubscribeAuth = onAuthStateChange(async (u) => {
      // Cleanup previous listeners
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!u) {
        setUser(null);
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      setUser(u);

      if (u.isAnonymous) {
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      // --- CRITICAL FIX: Check if document exists BEFORE starting listener ---
      console.log('🔵 Checking if user document exists before starting listener...');

      const userDocRef = doc(db, 'users', u.uid);

      try {
        // First, try to GET the document (not listen to it)
        const docSnap = await getDoc(userDocRef);

        if (!docSnap.exists()) {
          // Document doesn't exist yet (new registration in progress)
          console.log('⚠️ Document does not exist yet. Waiting 3 seconds for registration to complete...');

          // Wait 3 seconds for the registration to complete
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Try again
          const retrySnap = await getDoc(userDocRef);

          if (!retrySnap.exists()) {
            console.error('❌ Document still does not exist after 3 seconds');
            alert('Registration incomplete. Please try logging in again.');
            await signOutUser();
            setAuthLoading(false);
            return;
          }

          console.log('✅ Document now exists!');
        } else {
          console.log('✅ Document exists, proceeding...');
        }
      } catch (error) {
        console.error('❌ Error checking document:', error);
        await signOutUser();
        setAuthLoading(false);
        return;
      }

      // --- NOW start the real-time listener (document is guaranteed to exist) ---

      let hasTimedOut = false;

      timeoutId = setTimeout(async () => {
        hasTimedOut = true;
        console.error("Timeout waiting for user profile");
        if (unsubscribeDoc) unsubscribeDoc();
        alert("System Timeout: Unable to load your profile. Please refresh.");
        await signOutUser();
        setAuthLoading(false);
      }, 10000);

      unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
        if (hasTimedOut) return;
        clearTimeout(timeoutId);

        if (docSnap.exists()) {
          const data = docSnap.data();

          // SECURITY CHECK: Block Pending Users
          if (data.status !== 'approved' && data.role !== 'admin') {
             await signOutUser();
             setUser(null);
             setUserData(null);
             setActiveRole(ROLES.STAFF);
             setAuthLoading(false);
             return;
          }

          setUserData(data);

          // Role Switching
          if (data.viewAll || data.role === 'admin') {
             setActiveRole(ROLES.ADMIN);
          } else if (data.role === 'maintenance') {
             setActiveRole(ROLES.MAINTENANCE);
          } else if (data.role === 'hr') {
             setActiveRole(ROLES.HR);
          } else {
             setActiveRole(ROLES.STAFF);
          }
          setAuthLoading(false);
        }
      }, (error) => {
        if (hasTimedOut) return;
        clearTimeout(timeoutId);
        console.error("Profile fetch error", error);
        alert("Database Error: " + error.message);
        signOutUser();
        setAuthLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
