DB Rules (Point 1 Security Rules and Point 2 Logic Fixes)

1. Firestore Security Rules (firestore.rules)
These rules ensure that:

Admins have full control.

Maintenance staff can update ticket status but cannot delete users.

Staff can only create tickets and read their own profile.

Guests (Anonymous) can only create tickets.

Everyone is prevented from editing someone else's data maliciously.

Copy this content into a file named firestore.rules in your Firebase project (or paste it into the "Rules" tab in the Firebase Console).

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // --- Helper Functions ---

    // Check if user is logged in (anon or real)
    function isAuthenticated() {
      return request.auth != null;
    }

    // Check if user is a fully registered staff/admin (not anonymous)
    function isVerifiedUser() {
      return isAuthenticated() && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }

    // Get the user's role from their user document
    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isAdmin() {
      return isVerifiedUser() && getUserRole() == 'admin';
    }

    function isMaintenance() {
      return isVerifiedUser() && (getUserRole() == 'maintenance' || getUserRole() == 'admin');
    }

    // --- Collection Rules ---

    // 1. Users Collection
    match /users/{userId} {
      // Users can read their own profile. Admins can read all.
      allow read: if isAuthenticated() && (request.auth.uid == userId || isAdmin());

      // Users can create their own profile during registration (pending status).
      // We ensure they can't make themselves admin immediately.
      allow create: if isAuthenticated() && request.auth.uid == userId
                    && request.resource.data.status == 'pending'
                    && request.resource.data.role != 'admin';

      // Only Admins can update roles/status or delete users.
      allow update, delete: if isAdmin();
    }

    // 2. Maintenance Tickets
    match /maintenance_tickets/{ticketId} {
      // Admins and Maintenance see all.
      // Regular users/Anonymous can see tickets they created (if persisted).
      allow read: if isAdmin() || isMaintenance() ||
                  (isAuthenticated() && resource.data.reportedBy == request.auth.uid);

      // Anyone (including anonymous guests) can create a ticket.
      allow create: if isAuthenticated();

      // Updates:
      // Maintenance/Admins can update status, assign, add notes.
      // Regular users CANNOT update tickets once sent (prevents tampering).
      allow update: if isAdmin() || isMaintenance();

      // Only Admins can delete tickets.
      allow delete: if isAdmin();
    }

    // 3. Scheduled Tasks (Backend/Admin only)
    match /scheduled_tasks/{taskId} {
      allow read, write: if isAdmin();
    }
  }
}
