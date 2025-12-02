# Al Fajer School Maintenance & Support System

A comprehensive digital maintenance reporting and management system built for Al Fajer International School to streamline workflow between staff, maintenance teams, and administration.

## 📋 Overview

This application enables real-time maintenance issue reporting with role-based access control, image attachments, automated scheduling, and comprehensive analytics. The system supports three main user roles: Staff/Teachers, Maintenance Team, and Head Management/HR (Administrators).

## ✨ Key Features

### 🎯 Staff/Teacher Features
- **Anonymous Issue Reporting**: Report maintenance issues without account registration
- **Visual Evidence**: Upload up to 5 photos per report with automatic compression
- **Categorized Reporting**: Pre-defined issue categories and location selection
- **Priority Levels**: Low, Medium, High, Critical priority assignment
- **Real-time Updates**: Instant feedback on submission status

### 🔧 Maintenance Team Features
- **Task Queue Management**: Filterable maintenance ticket queue
- **Priority-based Sorting**: Focus on critical and high-priority tasks first
- **Work Status Updates**: Mark tasks as "In Progress" or "Resolved"
- **Completion Documentation**: Add technician name and completion photos
- **Task Filtering**: Filter by priority levels and status

### 👨‍💼 Administration Features
- **Executive Dashboard**: Real-time KPIs and system overview
- **User Management**: Approve/deny user accounts, assign roles
- **Scheduled Maintenance**: Create recurring maintenance tasks
- **Analytics & Reports**: Comprehensive reporting on system performance
- **Issue Escalation**: Warning system for delayed tasks
- **Data Management**: Full CRUD operations on all system data

## 🛠️ Technology Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore (real-time database)
- **Authentication**: Firebase Auth (anonymous + email/password)
- **Storage**: Firebase Storage (image hosting)
- **Deployment**: Netlify-ready configuration

## 📦 Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "firebase": "^10.7.0",
    "lucide-react": "^0.294.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.6",
    "vite": "^5.0.0"
  }
}
```

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+ and npm
- Firebase project with Firestore, Auth, and Storage enabled
- Git (for version control)

### Step 1: Clone and Install
```bash
# Clone the repository
git clone <repository-url>
cd school-ops

# Install dependencies
npm install
```

### Step 2: Firebase Configuration

1. **Create a Firebase project** at [https://console.firebase.google.com](https://console.firebase.google.com)

2. **Enable required services:**
   - Authentication (enable Anonymous and Email/Password sign-in)
   - Firestore Database
   - Storage

3. **Create environment file:**
   ```bash
   # Create .env file in project root
   touch .env
   ```

4. **Add Firebase configuration to `.env`:**
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

### Step 3: Firestore Security Rules

Update your Firestore rules to allow proper access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Maintenance tickets - read/write access
    match /maintenance_tickets/{ticket} {
      allow read, write: if true;
    }

    // User management - admin only for write
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Scheduled tasks - admin only
    match /scheduled_tasks/{task} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 4: Storage Security Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### Step 5: Development Server

```bash
# Start development server
npm run dev

# Server will run on http://localhost:5173
```

### Step 6: Build for Production

```bash
# Build the application
npm run build

# Serve locally to test build
npm run preview

# Deploy to hosting platform (Netlify, Vercel, etc.)
```

## 📂 Project Structure

```
school-ops/
├── public/
│   └── vite.svg
├── src/
│   ├── App.jsx                    # Main application component
│   ├── auth.js                    # Firebase authentication utilities
│   ├── firebase.js               # Firebase configuration
│   ├── storage.js                # Image upload/compression utilities
│   ├── enhanced_scheduler.jsx   # Scheduled maintenance logic (optional)
│   └── index.css                # Global styles and Tailwind imports
├── index.html                    # HTML template
├── package.json                  # Dependencies and scripts
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── vite.config.js              # Vite build configuration
└── README.md                   # This file
```

## 🔧 Core Components

### Authentication System (`auth.js`)
- Anonymous sign-in for staff reporting
- Email/password authentication for team members
- Role-based access control
- Automatic account approval workflow

### Image Management (`storage.js`)
- Automatic image compression
- Firebase Storage upload
- Support for multiple image formats
- File size validation (5MB max per image)

### Database Schema (Firestore)

#### `maintenance_tickets`
```javascript
{
  id: string,
  category: string,
  location: string,
  description: string,
  priority: "low" | "medium" | "high" | "critical",
  status: "open" | "in_progress" | "resolved",
  reportedBy: string,          // User ID
  reporterName: string,         // Display name
  imageUrls: string[],          // Array of Firebase Storage URLs
  createdAt: serverTimestamp,
  startedAt: serverTimestamp,   // When marked in progress
  resolvedAt: serverTimestamp,  // When marked resolved
  resolvedBy: string,          // Technician name
  completedBy: string,         // Admin user who marked complete
  completionImageUrls: string[], // Images showing completed work
  warnings: number,            // HR escalation count
  notes: string[]              // Admin notes
}
```

#### `users`
```javascript
{
  id: string,
  email: string,
  role: "staff" | "maintenance" | "admin",
  status: "pending" | "approved" | "blocked",
  viewAll: boolean,            // Special admin permission
  createdAt: serverTimestamp,
  lastLogin: serverTimestamp
}
```

#### `scheduled_tasks`
```javascript
{
  id: string,
  category: string,
  location: string,
  description: string,
  priority: "low" | "medium" | "high" | "critical",
  frequencyDays: number,
  createdAt: serverTimestamp,
  lastRun: serverTimestamp,
  nextRun: serverTimestamp,
  createdBy: string,           // Admin user ID
  isActive: boolean
}
```

## 🔐 User Roles & Permissions

### Anonymous Staff
- Report maintenance issues
- Upload photos
- View submission confirmation

### Staff/Teacher (Authenticated)
- All anonymous permissions
- Track personal submissions
- Account management

### Maintenance Team
- View assigned tasks
- Update task status
- Provide completion documentation
- Upload completion photos

### Administrator
- Full system access
- User account management
- Scheduled maintenance creation
- Issue escalation and warnings
- System analytics and reporting
- Data deletion capabilities

## 📱 Usage Guide

### For Staff (Reporting Issues)
1. Visit the application
2. Select "Report Issue"
3. Choose issue category and location
4. Add detailed description
5. Set priority level
6. Upload up to 5 photos (optional)
7. Submit report

### For Maintenance Team
1. Login with credentials
2. View available tasks in queue
3. Apply filters as needed (priority/status)
4. Start work on selected tasks
5. Mark tasks as complete with technician details
6. Upload completion photos

### For Administrators
1. Login with admin credentials
2. Switch to desired role using top navigation
3. **Admin Tab:** Monitor KPIs, manage reports
4. **Users Tab:** Approve accounts, assign roles
5. **Schedules Tab:** Create recurring maintenance tasks
6. **Reports Tab:** View analytics and export data

## 🎨 Customization

### Branding
Update the organization name and colors in:
- `src/App.jsx` - Update app title and theme colors
- `tailwind.config.js` - Modify color scheme

### Issue Categories & Locations
Modify arrays in `src/App.jsx`:
- `ISSUE_CATEGORIES` - Maintenance issue types
- `LOCATIONS` - Campus location options

### Priority Levels & Workflow
Adjust priority definitions and status flow in the constants section

## 🚀 Deployment Options

### Netlify (Recommended)
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variables in dashboard
5. Deploy

### Alternative Platforms
- Vercel
- Firebase Hosting
- AWS S3 + CloudFront

## 🔧 Troubleshooting

### Common Issues

**Images not uploading:**
- Check Firebase Storage rules
- Verify `.env` configuration
- Check browser console for errors

**Authentication issues:**
- Verify Firebase Auth settings
- Check email/password sign-in is enabled
- Review Firestore rules for user access

**Data not loading:**
- Check Firebase project configuration
- Verify environment variables
- Check browser network tab

**Build failures:**
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Update Node.js to latest LTS version
- Check for deprecated dependencies

## 📞 Support

For technical support or customization requests:
- Check the codebase for existing implementations
- Review Firebase documentation for service-specific issues
- Test with minimal configuration to isolate issues

## 📄 License

This project is proprietary to Al Fajer International School.

---

**Built with ❤️ for educational excellence**
