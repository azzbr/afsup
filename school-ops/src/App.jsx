import React, { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  where,
  orderBy,
  getDocs
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Wrench,
  ShieldAlert,
  Trash2,
  Megaphone,
  Image as ImageIcon,
  X,
  LogIn,
  LogOut,
  Users,
  Calendar
} from 'lucide-react';

// Import Firebase services
import { db } from './firebase';
import { signInAsAnonymous, signInWithCredentials, signOutUser, onAuthStateChange, getUserData, updateUserData, initializeAuth } from './auth';
import { compressImage, uploadImage } from './storage';
import EnhancedScheduleForm from './enhanced_scheduler';
import MaintenanceView from './MaintenanceView';
import AdminView from './AdminView';

// --- Constants ---
const ISSUE_CATEGORIES = [
  "Air conditioners not cooling properly",
  "Unpleasant odors",
  "Broken furniture (chairs, tables, shelves)",
  "Peeling paint or damaged walls",
  "Loose or hanging ceiling tiles",
  "Smartboard not functioning",
  "Water leakage (AC or ceiling)",
  "Missing or damaged classroom supplies",
  "Presence of insects or pests",
  "Broken blinds or curtains",
  "Lights not working",
  "Dirty or unclean areas",
  "Damaged electrical sockets",
  "Broken or loose door handles",
  "Safety Hazard (General)",
  "Other"
];

const LOCATIONS = [
  "B3 Hall Ground",
  "B3 Hall Up",
  "B3 KG1",
  "B3 KG2A",
  "B3 KG2B",
  "B3 KG3A",
  "B3 KG3B",
  "B3 KG3C",
  "B3 UnMark Room",
  "B4 Art Room",
  "B4 Computer Lab",
  "B4- G4A",
  "B4- G4B",
  "B4- G5A",
  "B4 Hall Ground",
  "B4 Hall Up",
  "B4 Library",
  "B4 Multimedia Room",
  "B4- Remedial Class",
  "B5 G1A",
  "B5 G1B",
  "B5 G2A",
  "B5 G2B",
  "B5 G3A",
  "B5 G3B",
  "B5 G3C",
  "B5 Hall Ground",
  "B5 Hall Up",
  "B5 Teachers Room",
  "B5 UnMark Room",
  "B1 Admin Hall Ground",
  "B1 Admin Hall Up",
  "Principal Office",
  "Academics Office",
  "HR Office",
  "HOA Office",
  "Accounting Office",
  "Consulor Office",
  "Registration Office",
  "Registration Waiting Area",
  "PE Hall",
  "Teachers Cabin Eng",
  "Teachers Cabin Arb"
];

const LOCATION_GROUPS = {
  building3: {
    name: "Building 3 (9 rooms)",
    locations: [
      "B3 Hall Ground", "B3 Hall Up", "B3 KG1", "B3 KG2A", "B3 KG2B",
      "B3 KG3A", "B3 KG3B", "B3 KG3C", "B3 UnMark Room"
    ]
  },
  building4: {
    name: "Building 4 (14 rooms)",
    locations: [
      "B4 Art Room", "B4 Computer Lab", "B4- G4A", "B4- G4B", "B4- G5A",
      "B4 Hall Ground", "B4 Hall Up", "B4 Library", "B4 Multimedia Room", "B4- Remedial Class"
    ]
  },
  building5: {
    name: "Building 5 (12 rooms)",
    locations: [
      "B5 G1A", "B5 G1B", "B5 G2A", "B5 G2B", "B5 G3A", "B5 G3B", "B5 G3C",
      "B5 Hall Ground", "B5 Hall Up", "B5 Teachers Room", "B5 UnMark Room"
    ]
  },
  adminAreas: {
    name: "Admin Areas (4 rooms)",
    locations: [
      "Principal Office", "HR Office", "Accounting Office", "Academics Office"
    ]
  },
  hallways: {
    name: "Hallways & Common Areas (4 areas)",
    locations: [
      "B1 Admin Hall Ground", "B1 Admin Hall Up", "PE Hall", "Registration Waiting Area"
    ]
  },
  specialRooms: {
    name: "Special Rooms (4 rooms)",
    locations: [
      "Teachers Cabin Eng", "Teachers Cabin Arb", "Registration Office", "Consulor Office", "HOA Office"
    ]
  },
  wholeSchool: {
    name: "Whole School (43 locations)",
    locations: LOCATIONS
  }
};

const ROLES = {
  STAFF: 'Staff/Teacher',
  MAINTENANCE: 'Maintenance Team',
  ADMIN: 'Head Management/HR'
};

// --- Report Types and Helpers ---
const createDateRangeFilter = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end };
};

const REPORT_TYPES = {
  TICKET_ANALYTICS: 'ticket_analytics',
  PERFORMANCE: 'performance',
  TIME_ANALYSIS: 'time_analysis',
  QUALITY_ASSURANCE: 'quality_assurance'
};

const USER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  BLOCKED: 'blocked'
};

// --- Inline Styles (Mobile-Optimized) ---
const styles = {
  badgeBase: { padding: '4px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600', display: 'inline-block' },
  badgeOpen: { backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' },
  badgeInProgress: { backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' },
  badgeResolved: { backgroundColor: '#d1fae5', color: '#059669', border: '1px solid #a7f3d0' },
  priorityLow: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  priorityMedium: { backgroundColor: '#dbeafe', color: '#2563eb' },
  priorityHigh: { backgroundColor: '#fed7aa', color: '#ea580c' },
  priorityCritical: { backgroundColor: '#dc2626', color: 'white' },
  btnPrimary: { backgroundColor: '#4f46e5', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' },
  btnSecondary: { backgroundColor: '#f3f4f6', color: '#374151', padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', cursor: 'pointer', fontSize: '16px' },
  btnYellow: { backgroundColor: '#eab308', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', fontSize: '16px' },
  btnGreen: { backgroundColor: '#16a34a', color: 'white', padding: '12px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' },
  card: { backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', marginBottom: '16px' },
  input: { width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px', outline: 'none' },
  select: { width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px', backgroundColor: 'white' },
  textarea: { width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px', minHeight: '96px', resize: 'vertical' },
  label: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '4px' }
};

// --- Simple Components ---
const StatusBadge = ({ status }) => {
  const statusStyles = { open: styles.badgeOpen, in_progress: styles.badgeInProgress, resolved: styles.badgeResolved };
  const labels = { open: "Open", in_progress: "In Progress", resolved: "Resolved" };
  return <span style={{ ...styles.badgeBase, ...statusStyles[status] }}>{labels[status] || status}</span>;
};

const PriorityBadge = ({ priority }) => {
  const priorityStyles = { low: styles.priorityLow, medium: styles.priorityMedium, high: styles.priorityHigh, critical: styles.priorityCritical };
  return <span style={{ ...styles.badgeBase, ...priorityStyles[priority], textTransform: 'uppercase', fontSize: '11px' }}>{priority}</span>;
};

// --- Login Modal Component ---
function LoginModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signInWithCredentials(email, password);
      if (result.success) {
        onClose();
        alert('Login successful!');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Login failed: ' + err.message);
    }
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      const { createUserAccount } = await import('./auth');
      const result = await createUserAccount(email, password);

      if (result.success) {
        setError('');
        alert('Registration successful! Your account is pending approval by an Admin.');
        setActiveTab('login');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Registration failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setError('');
      setActiveTab('login');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '400px', margin: '16px' }}>
        <div style={{ display: 'flex', marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <button
            onClick={() => setActiveTab('login')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'login' ? '#4f46e5' : 'transparent',
              color: activeTab === 'login' ? 'white' : '#64748b',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Login
          </button>
          <button
            onClick={() => setActiveTab('register')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'register' ? '#4f46e5' : 'transparent',
              color: activeTab === 'register' ? 'white' : '#64748b',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Register
          </button>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
          {activeTab === 'login' ? 'Staff Login' : 'Account Registration'}
        </h2>

        {error && <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>{error}</div>}

        {activeTab === 'login' ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Email</label>
              <input type="email" required style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Password</label>
              <input type="password" required style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            </div>
            <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
              <button type="submit" disabled={loading} style={{ ...styles.btnPrimary, flex: 1, justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>{loading ? 'Logging in...' : 'Login'}</button>
              <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancel</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Email</label>
              <input type="email" required style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your work email" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Password</label>
              <input type="password" required style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create password (min 6 chars)" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>Confirm Password</label>
              <input type="password" required style={styles.input} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm your password" />
            </div>
            <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
              <button type="submit" disabled={loading} style={{ ...styles.btnPrimary, flex: 1, justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>{loading ? 'Creating...' : 'Register'}</button>
              <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// --- Report Form Component ---
function ReportForm({ user, onSuccess }) {
  const [category, setCategory] = useState(ISSUE_CATEGORIES[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length + selectedFiles.length > 5) {
      alert("Maximum 5 images allowed per report.");
      return;
    }

    const compressedFiles = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" is too large. Please select images under 5MB.`);
        continue;
      }
      try {
        const compressed = await compressImage(file);
        compressedFiles.push(compressed);
      } catch (error) {
        console.error("Error compressing image:", error);
      }
    }

    setSelectedFiles(prev => [...prev, ...compressedFiles]);
    e.target.value = null;
  };

  const removeImage = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!user) {
      setError("Authentication error. Please refresh the page and try again.");
      return;
    }

    if (!description.trim()) {
      setError("Please enter a description.");
      return;
    }

    setSubmitting(true);

    try {
      console.log("Submitting ticket for user:", user.uid);
      const collectionRef = collection(db, 'maintenance_tickets');
      // Get submittedBy from the parent component's userData if available
      const getUserEmail = () => {
        if (user.isAnonymous) return null;
        return user.email || null;
      };

      const ticketData = {
        category,
        location,
        description: description.trim(),
        priority,
        status: 'open',
        reportedBy: user.uid,
        reporterName: user.isAnonymous ? "Anonymous User" : "Staff Member",
        submittedBy: getUserEmail(),
        createdAt: serverTimestamp(),
        warnings: 0,
        notes: []
      };

      const docRef = await addDoc(collectionRef, ticketData);
      console.log("Ticket created with ID:", docRef.id);

      if (selectedFiles.length > 0) {
        setUploadingImages(true);
        const uploadPromises = selectedFiles.map((file, index) =>
          uploadImage(file, `${docRef.id}_${index}`)
        );

        try {
          const uploadResults = await Promise.all(uploadPromises);
          const successfulUploads = uploadResults.filter(result => result.success);

          if (successfulUploads.length > 0) {
            const imageUrls = successfulUploads.map(result => result.downloadURL);
            await updateDoc(doc(db, 'maintenance_tickets', docRef.id), {
              imageUrls: imageUrls
            });
          }
        } catch (error) {
          console.error("Multiple image upload error:", error);
        }
        setUploadingImages(false);
      }

      setDescription("");
      setPriority("medium");
      setSelectedFiles([]);
      setCategory(ISSUE_CATEGORIES[0]);
      setLocation(LOCATIONS[0]);

      if (onSuccess) onSuccess();
      alert("Report submitted successfully!");
    } catch (err) {
      console.error("Error submitting:", err);
      setError("Failed to submit ticket: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {!user && (
        <div style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
          ⏳ Connecting to server... Please wait.
        </div>
      )}

      <div className="responsive-grid-2">
        <div>
          <label style={styles.label}>Issue Category</label>
          <select style={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
            {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={styles.label}>Location</label>
          <select style={styles.select} value={location} onChange={(e) => setLocation(e.target.value)}>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="responsive-grid-2">
        <div>
          <label style={styles.label}>Priority</label>
          <div style={{ display: 'flex', gap: '16px', height: '40px', alignItems: 'center' }}>
            {['low', 'medium', 'high', 'critical'].map(p => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="radio" name="priority" value={p} checked={priority === p} onChange={(e) => setPriority(e.target.value)} />
                <span style={{ textTransform: 'capitalize', fontSize: '14px', color: '#374151' }}>{p}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label style={styles.label}>Photo Evidence (Optional) - Max 5 images</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: 'white',
              width: 'fit-content'
            }}>
              <ImageIcon style={{ height: '16px', width: '16px', color: '#64748b' }} />
              <span style={{ fontSize: '14px', color: '#64748b' }}>Add Photos</span>
              <input
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageSelect}
              />
            </label>
            {selectedFiles.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', maxWidth: '400px' }}>
                {selectedFiles.map((file, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <img
                      src={file}
                      alt={`Preview ${index + 1}`}
                      style={{
                        width: '80px',
                        height: '80px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        borderRadius: '9999px',
                        padding: '2px',
                        border: 'none',
                        cursor: 'pointer',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <X style={{ height: '12px', width: '12px' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              {selectedFiles.length}/5 photos selected
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={styles.label}>Description *</label>
        <textarea
          required
          style={styles.textarea}
          placeholder="Please describe the issue in detail..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={submitting || uploadingImages || !user}
        style={{ ...styles.btnPrimary, width: '100%', justifyContent: 'center', opacity: (submitting || uploadingImages || !user) ? 0.5 : 1 }}
      >
        {submitting ? 'Submitting...' : uploadingImages ? 'Uploading Images...' : !user ? 'Connecting...' : 'Submit Report'}
      </button>
    </form>
  );
}

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeRole, setActiveRole] = useState(ROLES.STAFF);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('overview');
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const isAuthenticated = user && user.isAnonymous === false;

  // Enhanced createSchedule for multiple locations
  const createSchedule = async (scheduleData) => {
    try {
      const enhancedScheduleData = {
        ...scheduleData,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        lastRun: scheduleData.isStartImmediately ? serverTimestamp() : null,
        isActive: true,
        // Add computed fields for better querying
        totalLocations: scheduleData.locations.length,
        nextDue: scheduleData.nextRun ? new Date(scheduleData.nextRun) : null,
        frequencyDescription: `Every ${scheduleData.frequencyDays} days`
      };

      // Create the main schedule document
      const docRef = await addDoc(collection(db, 'scheduled_tasks'), enhancedScheduleData);
      setShowScheduleForm(false);
      alert('Advanced schedule created successfully! Will create ' + scheduleData.totalLocations + ' maintenance tickets.');

      // Refresh schedules list
      if (activeAdminTab === 'schedules') {
        const schedulesCollection = collection(db, 'scheduled_tasks');
        const scheduleDocs = await getDocs(schedulesCollection);
        const fetchedSchedules = scheduleDocs.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            nextRun: data.nextRun?.toDate ? data.nextRun.toDate() : new Date(),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            lastRun: data.lastRun?.toDate ? data.lastRun.toDate() : null
          };
        });
        setScheduledTasks(fetchedSchedules);
      }
    } catch (error) {
      console.error('Error creating enhanced schedule:', error);
      alert('Error creating schedule: ' + error.message);
    }
  };

  // Modified to handle multiple location schedules
  const checkAndCreateDueTasks = async () => {
    if (!user || !isAuthenticated) return;

    try {
      const schedulesCollection = collection(db, 'scheduled_tasks');
      const schedulesQuery = await getDocs(schedulesCollection);
      const now = new Date();

      for (const scheduleDoc of schedulesQuery.docs) {
        const schedule = scheduleDoc.data();
        if (!schedule.isActive) continue;

        const nextRun = schedule.nextRun?.toDate ? schedule.nextRun.toDate() : null;
        if (!nextRun) continue;

        // SAFETY CHECK: Prevent double booking - if it ran less than 20 hours ago, skip
        const lastRun = schedule.lastRun?.toDate ? schedule.lastRun.toDate() : null;
        if (lastRun) {
          const twentyHoursAgo = new Date(now.getTime() - (20 * 60 * 60 * 1000));
          if (lastRun > twentyHoursAgo) {
            console.log(`Skipping schedule ${scheduleDoc.id} - already ran in the last 20 hours.`);
            continue;
          }
        }

        if (now >= nextRun) {
          console.log(`Creating maintenance tickets for schedule "${schedule.description}"`);

          // Create tickets for each location in the schedule
          const ticketPromises = schedule.locations.map(async (location) => {
            const ticketData = {
              category: schedule.category,
              location: location,
              description: `${schedule.description} [Auto-generated from schedule: "${scheduleDoc.id}"]`,
              priority: schedule.priority || 'medium',
              status: 'open',
              reportedBy: schedule.createdBy,
              reporterName: 'Scheduled Maintenance System',
              createdAt: serverTimestamp(),
              warnings: 0,
              notes: [`Auto-generated on ${now.toLocaleDateString()} as part of scheduled maintenance`],
              scheduledFrom: scheduleDoc.id
            };

            return addDoc(collection(db, 'maintenance_tickets'), ticketData);
          });

          await Promise.all(ticketPromises);

          // Calculate next run date
          const nextRunDate = new Date(now);
          nextRunDate.setDate(nextRunDate.getDate() + schedule.frequencyDays);

          // Update the schedule's next run date and last run
          await updateDoc(doc(db, 'scheduled_tasks', scheduleDoc.id), {
            lastRun: serverTimestamp(),
            nextRun: nextRunDate
          });

          console.log(`Created ${schedule.locations.length} tickets for scheduled maintenance`);
        }
      }
    } catch (error) {
      console.error('Error checking due schedules:', error);
    }
  };

  // Initialize authentication
  useEffect(() => {
    initializeAuth().then(() => {
      console.log("Auth initialized successfully");
    }).catch(error => {
      console.error("Failed to initialize auth:", error);
    });

    const unsubscribe = onAuthStateChange(async (u) => {
      if (!u) {
        // Only sign in anonymously if no user exists at all
        signInAsAnonymous().then(result => {
          console.log("Anonymous sign-in result:", result);
        }).catch(error => {
          console.error("Anonymous sign-in error:", error);
        });
      }
      if (!u) {
        setUser(null);
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        return;
      }

      setUser(u);

      if (!u.isAnonymous) {
        setUserDataLoading(true);
        try {
          const userDataResult = await getUserData(u.uid);
          if (userDataResult.success) {
            const data = userDataResult.data;
            if (data.status === 'blocked' || data.status === 'pending') {
              alert('Your account is pending approval. Please wait for an administrator to approve your account.');
              await signOutUser();
              return;
            }

            setUserData(data);
            if (data.viewAll) {
              setActiveRole(ROLES.ADMIN);
            } else {
              if (data.role === 'admin') setActiveRole(ROLES.ADMIN);
              else if (data.role === 'maintenance') setActiveRole(ROLES.MAINTENANCE);
              else setActiveRole(ROLES.STAFF);
            }

            // Check for due schedules when admin logs in
            if (data.role === 'admin' || data.viewAll) {
              setTimeout(() => checkAndCreateDueTasks(), 2000);
            }
          } else {
            alert('Account verification failed. Please contact support.');
            await signOutUser();
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          alert('Account verification failed. Please contact support.');
          await signOutUser();
        }
      }
      setTimeout(() => setUserDataLoading(false), 100);
    });

    return () => unsubscribe();
  }, []);

  // Fetch tickets
  useEffect(() => {
    if (!db) return;
    const collectionRef = collection(db, 'maintenance_tickets');
    const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
      const fetchedTickets = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(),
        resolvedAt: d.data().resolvedAt?.toDate ? d.data().resolvedAt.toDate() : null
      }));
      fetchedTickets.sort((a, b) => {
        if (a.status === 'resolved' && b.status !== 'resolved') return 1;
        if (a.status !== 'resolved' && b.status === 'resolved') return -1;
        return b.createdAt - a.createdAt;
      });
      setTickets(fetchedTickets);
      setLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Delete ticket function (used by AdminView)
  const deleteTicket = async (ticketId) => {
    try {
      await deleteDoc(doc(db, 'maintenance_tickets', ticketId));
      console.log("Ticket deleted:", ticketId);
    } catch (err) {
      console.error("Error deleting ticket:", err);
      alert("Error deleting ticket. Please try again.");
    }
  };

  const deleteSchedule = async (scheduleId) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      await deleteDoc(doc(db, 'scheduled_tasks', scheduleId));
      setScheduledTasks(prev => prev.filter(s => s.id !== scheduleId));
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  // Basic UI render - staff view only for now, admin view stripped down
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '80px' }}>
      <nav style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '12px 16px' }}>
          <div className="nav-content">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                backgroundColor: '#4f46e5',
                padding: '6px',
                borderRadius: '8px'
              }}>
                <Wrench style={{ height: '20px', width: '20px', color: 'white' }} />
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>
                Al Fajer <span style={{ color: '#4f46e5' }}>Support & Maintenance</span>
              </h1>
            </div>

            {/* Navigation Menu - shows when authenticated */}
            {isAuthenticated && (
              <div className="nav-auth-section">

                {/* Role Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#64748b', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ fontWeight: '500' }} className="hide-on-mobile">Current Role:</span>
                  <div className="nav-role-selector">
                    <button
                      onClick={() => setActiveRole(ROLES.STAFF)}
                      disabled={activeRole === ROLES.STAFF}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: activeRole === ROLES.STAFF ? '#4f46e5' : 'transparent',
                        color: activeRole === ROLES.STAFF ? 'white' : '#64748b',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        opacity: activeRole === ROLES.STAFF ? 1 : 0.7
                      }}
                    >
                      Staff/Teacher
                    </button>
                    <button
                      onClick={() => setActiveRole(ROLES.MAINTENANCE)}
                      disabled={activeRole === ROLES.MAINTENANCE}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: activeRole === ROLES.MAINTENANCE ? '#4f46e5' : 'transparent',
                        color: activeRole === ROLES.MAINTENANCE ? 'white' : '#64748b',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        opacity: activeRole === ROLES.MAINTENANCE ? 1 : 0.7
                      }}
                    >
                      Maintenance Team
                    </button>
                    <button
                      onClick={() => setActiveRole(ROLES.ADMIN)}
                      disabled={activeRole === ROLES.ADMIN || !userData?.viewAll}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: activeRole === ROLES.ADMIN ? '#4f46e5' : 'transparent',
                        color: activeRole === ROLES.ADMIN ? 'white' : '#64748b',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        opacity: (activeRole === ROLES.ADMIN || !userData?.viewAll) ? 1 : 0.7
                      }}
                      title={!userData?.viewAll ? "Admin access requires special privileges" : ""}
                    >
                      Head Management/HR
                    </button>
                  </div>
                </div>

                {/* User Info */}
                <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users style={{ height: '16px', width: '16px' }} />
                  <span className="hide-on-mobile">{userData?.email?.split('@')[0] || 'User'}</span>
                </div>

                {/* Administration Control - only for admins */}
                {userData?.viewAll && (
                  <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <ShieldAlert style={{ height: '16px', width: '16px', color: '#4f46e5' }} />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#4f46e5' }}>Admin</span>
                    <span style={{ fontSize: '11px', color: '#64748b', backgroundColor: 'white', padding: '2px 8px', borderRadius: '50px' }}>
                      {tickets.length}
                    </span>
                  </div>
                )}

                {/* Logout Button */}
                <button
                  onClick={() => signOutUser()}
                  style={{
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <LogOut style={{ height: '16px', width: '16px' }} />
                  Logout
                </button>
              </div>
            )}

            {/* Login Button - when not authenticated */}
            {!isAuthenticated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  onClick={() => setShowLoginModal(true)}
                  style={{
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <LogIn style={{ height: '16px', width: '16px' }} />
                  Login
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: '1024px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
            Welcome to Al Fajer Support & Maintenance
          </h1>
          <p style={{ color: '#64748b' }}>
            {isAuthenticated 
              ? 'Professional maintenance management system with advanced scheduling'
              : 'Report maintenance issues anonymously or login for full access.'}
          </p>
        </div>

        {/* Anonymous Report Form - for non-logged-in visitors */}
        {!isAuthenticated && (
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#4f46e5', padding: '8px', borderRadius: '8px' }}>
                <Megaphone style={{ height: '20px', width: '20px', color: 'white' }} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>Report Issue</h2>
                <p style={{ fontSize: '14px', color: '#64748b' }}>Submit a new maintenance request</p>
              </div>
            </div>
            <ReportForm user={user} onSuccess={() => {}} />
          </div>
        )}

        {/* Maintenance View - for maintenance technicians (job cards) */}
        {isAuthenticated && activeRole === ROLES.MAINTENANCE && (
          <MaintenanceView
            tickets={tickets}
            user={user}
            userData={userData}
          />
        )}

        {/* Admin View - for administrators (executive dashboard) */}
        {isAuthenticated && activeRole === ROLES.ADMIN && (
          <AdminView
            tickets={tickets}
            user={user}
            userData={userData}
            onCreateSchedule={() => setShowScheduleForm(true)}
            onDeleteTicket={deleteTicket}
          />
        )}

        {/* Staff Report Form - only for Staff role */}
        {isAuthenticated && activeRole === ROLES.STAFF && (
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <ReportForm user={user} onSuccess={() => setIsFormOpen(false)} />
          </div>
        )}
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {/* Enhanced Schedule Modal */}
      {showScheduleForm && (
        <EnhancedScheduleForm
          isOpen={showScheduleForm}
          onClose={() => setShowScheduleForm(false)}
          onSubmit={createSchedule}
          user={user}
        />
      )}
    </div>
  );
}
