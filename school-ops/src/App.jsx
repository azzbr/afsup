// --- CRITICAL FIX: Poll until document truly exists ---
      console.log('🔵 Waiting for user document to be fully created...');

      const userDocRef = doc(db, 'users', u.uid);

      // Poll for document existence with retries
      let docExists = false;
      let attempts = 0;
      const maxAttempts = 10; // 10 attempts = 5 seconds max

      while (!docExists && attempts < maxAttempts) {
        attempts++;
        console.log(`🔵 Attempt ${attempts}/${maxAttempts}: Checking document...`);

        try {
          // Wait 500ms between checks to avoid hammering Firestore
          if (attempts > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            // Verify the document has actual data (not just cached/pending)
            const data = docSnap.data();
            if (data && data.uid === u.uid && data.email) {
              docExists = true;
              console.log('✅ Document verified and ready!');
            } else {
              console.log('⚠️ Document exists but data incomplete, retrying...');
            }
          } else {
            console.log('⚠️ Document does not exist yet, retrying...');
          }
        } catch (error) {
          console.error('⚠️ Error checking document:', error);
          // Continue retrying even on error
        }
      }

      if (!docExists) {
        console.error('❌ Document verification timeout after 5 seconds');
        alert('Registration incomplete. Please try logging in again.');
        await signOutUser();
        setAuthLoading(false);
        return;
      }
