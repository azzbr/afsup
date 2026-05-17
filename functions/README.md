# Cloud Functions — `functions/`

Server-side code for the Al Fajer School operations platform. See
[CLAUDE.md](../CLAUDE.md) for the broader project context.

## What's here

| Function | Trigger | Purpose |
|---|---|---|
| `inviteUser` | Callable | HR/admin creates an invitation + sets up the Auth user. |
| `acceptInvite` | Callable | Invitee redeems the link, sets password, gets signed in. |

Both functions write to `audit_log` and respect the permissions matrix in
[CLAUDE.md §6](../CLAUDE.md#6-permissions-matrix).

## Deploy checklist (one-time setup)

Run these in order. None of these have been done yet — this file is the
deployment runbook for when you're ready.

### 1. Upgrade the Firebase project to Blaze (pay-as-you-go)

Cloud Functions v2 requires the Blaze plan. Free tier is generous (2M
invocations/month). Upgrade at:

```
https://console.firebase.google.com/project/afsup-3ff9b/usage/details
```

### 2. Install Firebase CLI (if not already)

```bash
npm install -g firebase-tools@latest
firebase login
```

Verify you can see the project:

```bash
firebase projects:list
```

### 3. Install function dependencies

```bash
cd functions
npm install
```

### 4. (Optional) Configure SendGrid for invite emails

If you skip this step, `inviteUser` still works — it returns the invite URL in
the response so HR can copy/share manually. Install SendGrid only when you
want emails sent automatically.

```bash
# From the repo root
firebase functions:secrets:set SENDGRID_API_KEY
# Paste the API key when prompted.
```

You'll also need to verify the sender address (`noreply@afs.edu.bh` by default
— see `src/email.ts:FROM_ADDRESS`) in SendGrid's dashboard.

### 5. Deploy the functions

```bash
firebase deploy --only functions
```

First-time deploy creates the Cloud Run services and IAM bindings; takes
~2 minutes.

### 6. Deploy Firestore rules

```bash
firebase deploy --only firestore:rules
```

The new rules add the `invitations`, `audit_log`, and `notifications`
collections. Existing rules for `users`, `maintenance_tickets`, etc. are
unchanged.

### 7. Test end-to-end

1. Log in to the app as an HR or admin user.
2. Open the HR dashboard.
3. Click "Invite Employee", fill the form, submit.
4. Copy the invite URL from the result modal (or check the email if you
   configured SendGrid).
5. Open the URL in an incognito window.
6. Set a password — you should be signed in and land on the role's home.

If anything fails, check the Cloud Functions logs:

```bash
firebase functions:log --only inviteUser,acceptInvite
```

## Local emulator

To test against emulators without touching production:

```bash
# From repo root
firebase emulators:start
```

The emulator UI is at http://localhost:4000.

To point the React app at the emulators, add this to `school-ops/src/firebase.js`
during local development (DON'T commit it):

```js
import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

## Where things live

```
functions/
├── src/
│   ├── index.ts          # Entrypoint: re-exports every callable
│   ├── admin.ts          # Shared Firebase Admin init (db, adminAuth)
│   ├── permissions.ts    # Mirrors client permissions matrix
│   ├── audit.ts          # writeAudit() helper for /audit_log
│   ├── email.ts          # SendGrid wrapper (with no-op fallback)
│   ├── inviteUser.ts     # HR creates invitation
│   └── acceptInvite.ts   # Invitee redeems invitation
├── package.json
├── tsconfig.json
└── README.md             # ← you are here
```

## Rules to keep in mind (CLAUDE.md §9)

- Server-side `permissions.ts` MUST mirror `school-ops/src/permissions.ts` and
  `firestore.rules`. When you change one, change all three.
- Every mutation writes an `audit_log` entry.
- Secrets go in `firebase functions:secrets:set`, never in `.env` files
  committed to the repo.
- No new functions before this README documents them.
