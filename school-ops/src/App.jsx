// --- 1. Auth & User Data Loading (Refined & Memory Safe) ---
  useEffect(() => {
    initializeAuth();
    
    // TRACKERS: Keep track of listeners and timeouts to prevent race conditions
    let unsubscribeDoc = null;
    let timeoutId = null;

    const unsubscribeAuth = onAuthStateChange((u) => {
      // 1. CLEANUP: Stop previous listeners and timers
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // 2. HANDLE LOGOUT
      if (!u) {
        setUser(null);
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      setUser(u);

      // 3. HANDLE ANONYMOUS
      if (u.isAnonymous) {
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      // --- 4. START LISTENER WITH TIMEOUT PROTECTION ---
      
      // Flag to prevent race condition (Timeout vs Success)
      let hasTimedOut = false;

      // FAILSAFE: If Firestore takes longer than 10s, kill the process
      timeoutId = setTimeout(async () => {
        hasTimedOut = true; // Mark as timed out
        console.error("Timeout waiting for user profile");
        
        // Kill the listener so it doesn't try to run later
        if (unsubscribeDoc) unsubscribeDoc();
        
        alert("System Timeout: Unable to load your profile. Please check your connection and refresh.");
        await signOutUser();
        setAuthLoading(false);
      }, 10000); // 10 seconds

      const userDocRef = doc(db, 'users', u.uid);
      
      unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
        // STOP if the timeout already won the race
        if (hasTimedOut) return;
        
        // SUCCESS: Clear the failsafe timer
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
        } else {
          // Document waiting creation...
          console.log("Waiting for user profile creation...");
        }
      }, (error) => {
        // STOP if the timeout already won the race  
        if (hasTimedOut) return;
        clearTimeout(timeoutId);
        
        console.error("Profile fetch error", error);
        alert("Database Error: " + error.message);
        signOutUser();
        setAuthLoading(false);
      });
    });

    // FINAL CLEANUP: When App unmounts
    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
