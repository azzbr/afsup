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
import { signInAsAnonymous, signInWithCredentials, signOutUser, onAuthStateChange, getUserData, updateUserData } from './auth';
import { compressImage, uploadImage } from './storage';

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

const ROLES = {
  STAFF: 'Staff/Teacher',
  MAINTENANCE: 'Maintenance Team',
  ADMIN: 'Head Management/HR'
};

const USER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  BLOCKED: 'blocked'
};

// --- Inline Styles ---
const styles = {
  badgeBase: { padding: '4px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600', display: 'inline-block' },
  badgeOpen: { backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' },
  badgeInProgress: { backgroundColor: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' },
  badgeResolved: { backgroundColor: '#d1fae5', color: '#059669', border: '1px solid #a7f3d0' },
  priorityLow: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  priorityMedium: { backgroundColor: '#dbeafe', color: '#2563eb' },
  priorityHigh: { backgroundColor: '#fed7aa', color: '#ea580c' },
  priorityCritical: { backgroundColor: '#dc2626', color: 'white' },
  btnPrimary: { backgroundColor: '#4f46e5', color: 'white', padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' },
  btnSecondary: { backgroundColor: '#f3f4f6', color: '#374151', padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db', cursor: 'pointer' },
  btnYellow: { backgroundColor: '#eab308', color: 'white', padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', fontSize: '14px' },
  btnGreen: { backgroundColor: '#16a34a', color: 'white', padding: '8px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' },
  card: { backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', marginBottom: '16px' },
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: 'white' },
  textarea: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minHeight: '96px', resize: 'vertical' },
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

// --- Image Modal for Zoom ---
function ImageModal({ isOpen, src, onClose }) {
  if (!isOpen || !src) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '40px'
    }} onClick={onClose}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: 'white',
          borderRadius: '50%',
          padding: '8px',
          border: 'none',
          cursor: 'pointer',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <X style={{ height: '20px', width: '20px', color: 'black' }} />
      </button>
      <img
        src={src}
        alt="Full Size"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '8px'
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// --- Updated ImageThumbnail with Zoom ---
function ImageThumbnail({ src, onClick }) {
  if (!src) return null;
  return (
    <div style={{ marginTop: '8px', cursor: 'pointer' }} onClick={() => onClick && onClick(src)}>
      <img
        src={src}
        alt="Report Evidence"
        style={{
          width: '96px',
          height: '96px',
          objectFit: 'cover',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          transition: 'transform 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
      />
    </div>
  );
}

// --- Completion Modal Component ---
function CompletionModal({ isOpen, onClose, onComplete, ticket }) {
  const [technicianName, setTechnicianName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!technicianName.trim()) {
      alert("Please enter the technician's name.");
      return;
    }

    setLoading(true);
    await onComplete(ticket.id, technicianName.trim());
    setLoading(false);
    setTechnicianName('');
    onClose();
  };

  if (!isOpen || !ticket) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '24px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '400px',
        margin: '16px'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>
          Task Completed
        </h3>
        <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '14px' }}>
          Who completed this task?
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Technician Name *</label>
            <input
              type="text"
              required
              style={styles.input}
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              placeholder="Enter technician's name"
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
            <button
              type="submit"
              disabled={loading || !technicianName.trim()}
              style={{
                ...styles.btnGreen,
                flex: 1,
                justifyContent: 'center',
                opacity: (loading || !technicianName.trim()) ? 0.5 : 1
              }}
            >
              {loading ? 'Completing...' : 'Mark Complete'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={styles.btnSecondary}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Report Form Component (manages its own state) ---
function ReportForm({ user, onSuccess }) {
  const [category, setCategory] = useState(ISSUE_CATEGORIES[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("File size too large. Please select an image under 5MB.");
        return;
      }
      const compressed = await compressImage(file);
      setSelectedFile(compressed);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    
    if (!user) {
      setError("Authentication error. Please refresh the page and try again.");
      console.error("No user found. User object:", user);
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
      const ticketData = {
        category,
        location,
        description: description.trim(),
        priority,
        status: 'open',
        reportedBy: user.uid,
        reporterName: user.isAnonymous ? "Anonymous User" : "Staff Member",
        createdAt: serverTimestamp(),
        warnings: 0,
        notes: []
      };

      const docRef = await addDoc(collectionRef, ticketData);
      console.log("Ticket created with ID:", docRef.id);

      if (selectedFile) {
        setUploadingImage(true);
        const uploadResult = await uploadImage(selectedFile, docRef.id);
        if (uploadResult.success) {
          await updateDoc(doc(db, 'maintenance_tickets', docRef.id), {
            imageUrl: uploadResult.downloadURL
          });
        }
        setUploadingImage(false);
      }

      // Reset form
      setDescription("");
      setPriority("medium");
      setSelectedFile(null);
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
          <label style={styles.label}>Photo Evidence (Optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white' }}>
              <ImageIcon style={{ height: '16px', width: '16px', color: '#64748b' }} />
              <span style={{ fontSize: '14px', color: '#64748b' }}>Add Photo</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
            </label>
            {selectedFile && (
              <div style={{ position: 'relative' }}>
                <img src={selectedFile} alt="Preview" style={{ height: '40px', width: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #e2e8f0' }} />
                <button type="button" onClick={() => setSelectedFile(null)} style={{ position: 'absolute', top: '-8px', right: '-8px', backgroundColor: '#ef4444', color: 'white', borderRadius: '9999px', padding: '2px', border: 'none', cursor: 'pointer' }}>
                  <X style={{ height: '12px', width: '12px' }} />
                </button>
              </div>
            )}
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
        disabled={submitting || uploadingImage || !user}
        style={{ ...styles.btnPrimary, width: '100%', justifyContent: 'center', opacity: (submitting || uploadingImage || !user) ? 0.5 : 1 }}
      >
        {submitting ? 'Submitting...' : uploadingImage ? 'Uploading Image...' : !user ? 'Connecting...' : 'Submit Report'}
      </button>
    </form>
  );
}

// --- Schedule Form Modal ---
function ScheduleForm({ isOpen, onClose, onSubmit }) {
  const [category, setCategory] = useState(ISSUE_CATEGORIES[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [frequencyDays, setFrequencyDays] = useState(30);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const scheduleData = {
      category,
      location,
      description: description.trim(),
      priority,
      frequencyDays: parseInt(frequencyDays)
    };

    await onSubmit(scheduleData);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) {
      setCategory(ISSUE_CATEGORIES[0]);
      setLocation(LOCATIONS[0]);
      setDescription('');
      setPriority('medium');
      setFrequencyDays(30);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '500px', margin: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '20px' }}>
          Create Recurring Schedule
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={styles.label}>Issue Category</label>
              <select style={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
                {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Location</label>
              <select style={styles.select} value={location} onChange={(e) => setLocation(e.target.value)}>
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={styles.label}>Priority</label>
              <select style={styles.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>Frequency (Days)</label>
              <input
                type="number"
                required
                min="1"
                max="365"
                style={styles.input}
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(e.target.value)}
                placeholder="e.g., 30 for monthly"
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Task Description</label>
            <textarea
              required
              style={styles.textarea}
              placeholder="Describe the recurring maintenance task..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
            <button type="submit" disabled={loading} style={{ ...styles.btnPrimary, flex: 1, justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>
              {loading ? 'Creating...' : 'Create Schedule'}
            </button>
            <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Enhanced Login Modal (with Registration) ---
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
        // Reset will happen in useEffect when user state changes
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
      // Import what we need for registration
      const { createUserAccount } = await import('./auth');
      const result = await createUserAccount(email, password);

      if (result.success) {
        setError(''); // Clear error
        alert('Registration successful! Your account is pending approval by an Admin.');
        setActiveTab('login');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Registration error:', err);
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
        {/* Tab Buttons */}
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
              fontWeight: '500'
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
              fontWeight: '500'
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

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeRole, setActiveRole] = useState(ROLES.STAFF);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('overview'); // 'overview', 'users', 'schedules'
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const isAuthenticated = user && user.isAnonymous === false;

  // Image zoom modal state
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState('');

  // Task filtering state for maintenance view
  const [filterCriteria, setFilterCriteria] = useState({
    priority: 'all', // 'all', 'high_priority', 'normal', 'critical_only'
    status: 'all'    // 'all', 'open', 'in_progress'
  });

  // Completion modal state
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const openImageModal = (src) => {
    setModalImageSrc(src);
    setImageModalOpen(true);
  };

  const closeImageModal = () => {
    setImageModalOpen(false);
    setModalImageSrc('');
  };

  // --- Schedule Modal State ---
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  // --- Fetch scheduled tasks ---
  useEffect(() => {
    if (isAuthenticated && activeRole === ROLES.ADMIN && activeAdminTab === 'schedules') {
      const fetchSchedules = async () => {
        try {
          const schedulesCollection = collection(db, 'scheduled_tasks');
          const scheduleDoc = await getDocs(schedulesCollection);
          const fetchedSchedules = scheduleDoc.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            lastRun: doc.data().lastRun?.toDate() || null,
            nextRun: doc.data().nextRun?.toDate() || new Date()
          }));
          setScheduledTasks(fetchedSchedules);
        } catch (error) {
          console.error('Error fetching schedules:', error);
        }
      };
      fetchSchedules();
    }
  }, [isAuthenticated, activeRole, activeAdminTab]);

  // --- Check for due schedules on admin login ---
  useEffect(() => {
    if (isAuthenticated && activeRole === ROLES.ADMIN && user) {
      checkAndCreateDueTasks();
    }
  }, [isAuthenticated, activeRole, user]);

  const checkAndCreateDueTasks = async () => {
    if (!user) return;

    try {
      const schedulesCollection = collection(db, 'scheduled_tasks');
      const schedulesQuery = await getDocs(schedulesCollection);
      const now = new Date();

      for (const scheduleDoc of schedulesQuery.docs) {
        const schedule = scheduleDoc.data();
        const lastRun = schedule.lastRun?.toDate() || new Date(0);
        const nextRun = schedule.nextRun?.toDate() || new Date(0);

        if (now >= nextRun) {
          // Create a new maintenance ticket
          const ticketData = {
            category: schedule.category,
            location: schedule.location,
            description: `${schedule.description} [Scheduled: Every ${schedule.frequencyDays} days]`,
            priority: schedule.priority || 'medium',
            status: 'open',
            reportedBy: user.uid,
            reporterName: 'Scheduled System',
            createdAt: serverTimestamp(),
            warnings: 0,
            notes: [],
            scheduledFrom: scheduleDoc.id // Reference to the schedule
          };

          await addDoc(collection(db, 'maintenance_tickets'), ticketData);

          // Update the schedule's next run date and last run
          const nextRunDate = new Date(now);
          nextRunDate.setDate(nextRunDate.getDate() + schedule.frequencyDays);

          await updateDoc(doc(db, 'scheduled_tasks', scheduleDoc.id), {
            lastRun: serverTimestamp(),
            nextRun: nextRunDate
          });
        }
      }
    } catch (error) {
      console.error('Error checking due tasks:', error);
    }
  };

  const createSchedule = async (scheduleData) => {
    try {
      const scheduleDoc = {
        ...scheduleData,
        createdAt: serverTimestamp(),
        lastRun: null,
        nextRun: new Date(),
        createdBy: user.uid,
        isActive: true
      };

      const docRef = await addDoc(collection(db, 'scheduled_tasks'), scheduleDoc);
      setShowScheduleForm(false);
      alert('Schedule created successfully!');

      // Refresh schedules
      if (activeAdminTab === 'schedules') {
        const schedulesCollection = collection(db, 'scheduled_tasks');
        const scheduleDoc = await getDocs(schedulesCollection);
        const fetchedSchedules = scheduleDoc.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          nextRun: doc.data().nextRun?.toDate() || new Date()
        }));
        setScheduledTasks(fetchedSchedules);
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert('Error creating schedule: ' + error.message);
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

  useEffect(() => {
    console.log("Starting anonymous sign-in...");
    signInAsAnonymous().then(result => {
      console.log("Anonymous sign-in result:", result);
    });

    const unsubscribe = onAuthStateChange(async (u) => {
      console.log("Auth state changed:", u?.uid, "isAnonymous:", u?.isAnonymous);

      // Start loading user data for authenticated users
      if (u && !u.isAnonymous) {
        setUserDataLoading(true);
      }

      setUser(u);

      if (u && !u.isAnonymous) {
        // Set default staff role initially - will be updated after verification
        setActiveRole(ROLES.STAFF);

        // Fetch user data for role-based access
        try {
          const userDataResult = await getUserData(u.uid);
          if (userDataResult.success) {
            const userData = userDataResult.data;

            // Check if user is approved or blocked
            if (userData.status === 'blocked' || userData.status === 'pending') {
              setUserDataLoading(false);
              alert('Your account is pending approval. Please wait for an administrator to approve your account.');
              await signOutUser();
              return;
            }

            if (userData.status === 'approved') {
              setUserData(userData);

              // Set role based on database (with viewAll override)
              if (userData.viewAll) {
                setActiveRole(ROLES.ADMIN); // Special permission allows viewing all
              } else {
                // Set role normally based on database
                if (userData.role === 'admin') setActiveRole(ROLES.ADMIN);
                else if (userData.role === 'maintenance') setActiveRole(ROLES.MAINTENANCE);
                else setActiveRole(ROLES.STAFF);
              }
            }
          } else {
            console.error("Failed to fetch user data");
            setUserDataLoading(false);
            alert('Account verification failed. Please contact support.');
            await signOutUser();
            return;
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUserDataLoading(false);
          alert('Account verification failed. Please contact support.');
          await signOutUser();
          return;
        }
      } else {
        // Reset user data for anonymous user
        setUserData(null);
        setUserDataLoading(false);
        setActiveRole(ROLES.STAFF); // Reset role for anonymous users
      }

      // Stop loading once user data is processed
      setTimeout(() => setUserDataLoading(false), 100); // Small delay to prevent flash
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db) return;
    const collectionRef = collection(db, 'maintenance_tickets');
    const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
      const fetchedTickets = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate() || new Date(),
        resolvedAt: d.data().resolvedAt?.toDate() || null
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

  // Fetch users for admin user management with real-time listener
  useEffect(() => {
    let unsubscribe = null;

    if (isAuthenticated && activeRole === ROLES.ADMIN && activeAdminTab === 'users') {
      const usersCollection = collection(db, 'users');
      unsubscribe = onSnapshot(usersCollection, (snapshot) => {
        const fetchedUsers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Convert Firestore timestamps to dates
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          lastLogin: doc.data().lastLogin?.toDate?.() || doc.data().lastLogin
        }));
        setUsers(fetchedUsers);
      }, (error) => {
        console.error('Error fetching users:', error);
      });
    }

    // Cleanup listener when component unmounts or conditions change
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isAuthenticated, activeRole, activeAdminTab]);

// --- Enhanced Status Update Function ---
const updateStatus = async (ticketId, newStatus, technicianName = null) => {
  try {
    const docRef = doc(db, 'maintenance_tickets', ticketId);
    const updateData = {
      status: newStatus,
      updatedAt: serverTimestamp()
    };

    if (newStatus === 'in_progress') {
      updateData.startedAt = serverTimestamp();
    } else if (newStatus === 'resolved') {
      updateData.resolvedAt = serverTimestamp();
      if (technicianName) {
        updateData.resolvedBy = technicianName;
      }
    }

    await updateDoc(docRef, updateData);
  } catch (err) {
    console.error("Error updating status:", err);
    alert("Error updating task status. Please try again.");
  }
};

// --- Completion Handler ---
const handleCompleteTask = async (ticketId, technicianName) => {
  await updateStatus(ticketId, 'resolved', technicianName);
  setCompletionModalOpen(false);
  setSelectedTicket(null);
};

  const issueWarning = async (ticketId, currentWarnings) => {
    try {
      const docRef = doc(db, 'maintenance_tickets', ticketId);
      await updateDoc(docRef, { warnings: (currentWarnings || 0) + 1, lastWarningAt: serverTimestamp() });
    } catch (err) {
      console.error("Error issuing warning:", err);
    }
  };

  const deleteTicket = async (ticketId) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await deleteDoc(doc(db, 'maintenance_tickets', ticketId));
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '80px' }}>
      <nav style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
        <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ backgroundColor: '#4f46e5', padding: '6px', borderRadius: '8px' }}>
                <Wrench style={{ height: '20px', width: '20px', color: 'white' }} />
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>
                Al Fajer <span style={{ color: '#4f46e5' }}>Support & Maintenance</span>
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {isAuthenticated && !userDataLoading && (
                <div style={{ display: 'flex', backgroundColor: '#f8fafc', padding: '4px', borderRadius: '8px' }}>
                  {Object.values(ROLES).map((role) => (
                    <button key={role} onClick={() => setActiveRole(role)} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '500', borderRadius: '6px', backgroundColor: activeRole === role ? 'white' : 'transparent', color: activeRole === role ? '#4f46e5' : '#64748b', boxShadow: activeRole === role ? '0 1px 3px 0 rgba(0, 0, 0, 0.1)' : 'none', border: 'none', cursor: 'pointer' }}>
                      {role}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={isAuthenticated ? () => signOutUser() : () => setShowLoginModal(true)} style={styles.btnPrimary}>
                {isAuthenticated ? <><LogOut style={{ height: '16px', width: '16px' }} /> Logout</> : <><LogIn style={{ height: '16px', width: '16px' }} /> Login</>}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: '1024px', margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
            {isAuthenticated ? (activeRole === ROLES.STAFF ? "Welcome, Staff Member" : activeRole === ROLES.MAINTENANCE ? "Maintenance Dashboard" : "Administration Control") : "Welcome to Al Fajer Support & Maintenance"}
          </h1>
          {!isAuthenticated && <p style={{ color: '#64748b' }}>Report maintenance issues anonymously or login for full access.</p>}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '256px' }}>
            <div style={{ border: '4px solid #e2e8f0', borderTop: '4px solid #4f46e5', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite' }}></div>
          </div>
        ) : (
          <>
            {/* Staff View - Report Form */}
            {(!isAuthenticated || activeRole === ROLES.STAFF) && (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Megaphone style={{ height: '20px', width: '20px', color: '#4f46e5' }} /> Report Issue
                  </h2>
                  <button onClick={() => setIsFormOpen(!isFormOpen)} style={styles.btnPrimary}>
                    {isFormOpen ? "Cancel" : <><Plus style={{ height: '16px', width: '16px' }} /> New Report</>}
                  </button>
                </div>
                {isFormOpen && <ReportForm user={user} onSuccess={() => setIsFormOpen(false)} />}
              </div>
            )}

            {/* Maintenance View */}
            {isAuthenticated && !userDataLoading && activeRole === ROLES.MAINTENANCE && (
              <div style={styles.card}>
                <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', borderRadius: '12px 12px 0 0', marginTop: '-24px', marginLeft: '-24px', marginRight: '-24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontWeight: 'bold', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Wrench style={{ height: '20px', width: '20px', color: '#64748b' }} /> Task Queue
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '14px' }}>
                      <select
                        value={filterCriteria.priority}
                        onChange={(e) => setFilterCriteria({ ...filterCriteria, priority: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '12px' }}
                      >
                        <option value="all">All Priorities</option>
                        <option value="critical_only">Critical Only</option>
                        <option value="high_priority">High & Critical</option>
                        <option value="normal">Normal & Low</option>
                      </select>
                      <select
                        value={filterCriteria.status}
                        onChange={(e) => setFilterCriteria({ ...filterCriteria, status: e.target.value })}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '12px' }}
                      >
                        <option value="all">All Tasks</option>
                        <option value="open">Open Only</option>
                        <option value="in_progress">In Progress</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Table View - Keep filters at top, replace cards with table */}
                <div>
                  <table style={{ width: '100%', fontSize: '14px', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Category / Location</th>
                        <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Priority</th>
                        <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Status</th>
                        <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Reported</th>
                        <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Apply filters to tickets
                        let filteredTickets = tickets.filter(t => t.status !== 'resolved');

                        // Priority filter
                        if (filterCriteria.priority === 'critical_only') {
                          filteredTickets = filteredTickets.filter(t => t.priority === 'critical');
                        } else if (filterCriteria.priority === 'high_priority') {
                          filteredTickets = filteredTickets.filter(t => t.priority === 'critical' || t.priority === 'high');
                        } else if (filterCriteria.priority === 'normal') {
                          filteredTickets = filteredTickets.filter(t => t.priority === 'low' || t.priority === 'medium');
                        }

                        // Status filter
                        if (filterCriteria.status === 'open') {
                          filteredTickets = filteredTickets.filter(t => t.status === 'open');
                        } else if (filterCriteria.status === 'in_progress') {
                          filteredTickets = filteredTickets.filter(t => t.status === 'in_progress');
                        }

                        return filteredTickets.map(ticket => (
                          <tr key={ticket.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: '500', color: '#1e293b' }}>{ticket.category}</div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>{ticket.location}</div>
                              {ticket.warnings > 0 && <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 'bold', marginTop: '2px' }}>⚠️ HR Warning ({ticket.warnings})</div>}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <PriorityBadge priority={ticket.priority} />
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <StatusBadge status={ticket.status} />
                            </td>
                            <td style={{ padding: '12px 16px', color: '#64748b' }}>
                              {ticket.createdAt.toLocaleDateString()}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {ticket.status === 'open' && (
                                  <button onClick={() => updateStatus(ticket.id, 'in_progress')} style={styles.btnYellow}>
                                    Start Work
                                  </button>
                                )}
                                {ticket.status === 'in_progress' && (
                                  <button onClick={() => { setSelectedTicket(ticket); setCompletionModalOpen(true); }} style={styles.btnGreen}>
                                    <CheckCircle style={{ height: '16px', width: '16px' }} /> Complete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                      {tickets.filter(t => t.status !== 'resolved').length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                            No active tasks. Good job!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Admin View with Tabs */}
            {isAuthenticated && !userDataLoading && activeRole === ROLES.ADMIN && (
              <div>
                {/* Admin Tab Navigation */}
                <div style={{ marginBottom: '24px', borderBottom: '1px solid #e2e8f0' }}>
                  <nav style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setActiveAdminTab('overview')}
                      style={{
                        padding: '12px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        borderBottom: activeAdminTab === 'overview' ? '2px solid #4f46e5' : '2px solid transparent',
                        color: activeAdminTab === 'overview' ? '#4f46e5' : '#64748b',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer'
                      }}
                    >
                      Overview
                    </button>
                    <button
                      onClick={() => setActiveAdminTab('users')}
                      style={{
                        padding: '12px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        borderBottom: activeAdminTab === 'users' ? '2px solid #4f46e5' : '2px solid transparent',
                        color: activeAdminTab === 'users' ? '#4f46e5' : '#64748b',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Users style={{ height: '14px', width: '14px' }} />
                      Users ({users.length})
                    </button>
                    <button
                      onClick={() => setActiveAdminTab('schedules')}
                      style={{
                        padding: '12px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        borderBottom: activeAdminTab === 'schedules' ? '2px solid #4f46e5' : '2px solid transparent',
                        color: activeAdminTab === 'schedules' ? '#4f46e5' : '#64748b',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '4px 4px 0 0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Calendar style={{ height: '14px', width: '14px' }} />
                      Schedules ({scheduledTasks.length})
                    </button>
                  </nav>
                </div>

                {/* Overview Tab */}
                {activeAdminTab === 'overview' && (
                  <>
                    <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><ShieldAlert style={{ height: '24px', width: '24px' }} /> Executive Oversight</h2>
                      <p style={{ color: '#94a3b8' }}>Monitor maintenance performance.</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '24px' }}>
                        <div style={{ backgroundColor: 'rgba(71, 85, 105, 0.5)', padding: '16px', borderRadius: '8px' }}><div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f87171' }}>{tickets.filter(t => t.priority === 'critical' && t.status !== 'resolved').length}</div><div style={{ fontSize: '14px', color: '#94a3b8' }}>Critical</div></div>
                        <div style={{ backgroundColor: 'rgba(71, 85, 105, 0.5)', padding: '16px', borderRadius: '8px' }}><div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>{tickets.filter(t => t.status === 'open').length}</div><div style={{ fontSize: '14px', color: '#94a3b8' }}>Backlog</div></div>
                        <div style={{ backgroundColor: 'rgba(71, 85, 105, 0.5)', padding: '16px', borderRadius: '8px' }}><div style={{ fontSize: '32px', fontWeight: 'bold', color: '#facc15' }}>{tickets.filter(t => t.status === 'in_progress').length}</div><div style={{ fontSize: '14px', color: '#94a3b8' }}>In Progress</div></div>
                        <div style={{ backgroundColor: 'rgba(71, 85, 105, 0.5)', padding: '16px', borderRadius: '8px' }}><div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4ade80' }}>{tickets.filter(t => t.status === 'resolved').length}</div><div style={{ fontSize: '14px', color: '#94a3b8' }}>Resolved</div></div>
                      </div>
                    </div>
                    <div style={styles.card}>
                      <table style={{ width: '100%', fontSize: '14px', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Category / Location</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Status</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Reported</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tickets.map(ticket => (
                            <tr key={ticket.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: '500', color: '#1e293b' }}>{ticket.category}</div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{ticket.location}</div>
                              </td>
                              <td style={{ padding: '12px 16px' }}><StatusBadge status={ticket.status} /></td>
                              <td style={{ padding: '12px 16px', color: '#64748b' }}>{ticket.createdAt.toLocaleDateString()}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {ticket.status !== 'resolved' && (
                                    <button onClick={() => issueWarning(ticket.id, ticket.warnings)} style={{ color: '#ea580c', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', border: '1px solid #fed7aa', backgroundColor: 'transparent', cursor: 'pointer' }}>
                                      <AlertTriangle style={{ height: '12px', width: '12px' }} /> Escalate
                                    </button>
                                  )}
                                  <button onClick={() => deleteTicket(ticket.id)} style={{ color: '#94a3b8', padding: '4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer' }}>
                                    <Trash2 style={{ height: '16px', width: '16px' }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Users Tab */}
                {activeAdminTab === 'users' && (
                  <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users style={{ height: '20px', width: '20px', color: '#4f46e5' }} />
                        User Management
                      </h3>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '14px', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Email</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Role</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Status</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Registered</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map(user => (
                              <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1e293b' }}>{user.email}</td>
                                <td style={{ padding: '12px 16px' }}>
                                  <select
                                    value={user.role || 'staff'}
                                    onChange={(e) => updateUserData(user.id, { role: e.target.value })}
                                    style={styles.select}
                                  >
                                    <option value="staff">Staff</option>
                                    <option value="maintenance">Maintenance</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    backgroundColor: user.status === 'approved' ? '#d1fae5' : user.status === 'blocked' ? '#fee2e2' : '#fef3c7',
                                    color: user.status === 'approved' ? '#059669' : user.status === 'blocked' ? '#dc2626' : '#d97706'
                                  }}>
                                    {user.status || 'pending'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px', color: '#64748b' }}>
                                  {user.createdAt?.toDate?.() ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <select
                                      value={user.status || 'pending'}
                                      onChange={(e) => updateUserData(user.id, { status: e.target.value })}
                                      style={{ ...styles.select, fontSize: '12px', padding: '4px 8px', width: 'auto' }}
                                    >
                                      <option value="approved">Approved</option>
                                      <option value="blocked">Blocked</option>
                                    </select>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                      <input
                                        type="checkbox"
                                        checked={user.viewAll || false}
                                        onChange={(e) => updateUserData(user.id, { viewAll: e.target.checked })}
                                      />
                                      View All
                                    </label>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          {users.length === 0 && (
                            <tr>
                              <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                No users registered yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Schedules Tab */}
                {activeAdminTab === 'schedules' && (
                  <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar style={{ height: '20px', width: '20px', color: '#4f46e5' }} />
                        Task Scheduling
                      </h3>
                      <button onClick={() => setShowScheduleForm(true)} style={styles.btnPrimary}>
                        <Plus style={{ height: '14px', width: '14px' }} /> Create Schedule
                      </button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: '14px', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Task</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Location</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Frequency</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Next Due</th>
                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: '500' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduledTasks.map(schedule => (
                            <tr key={schedule.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: '500', color: '#1e293b' }}>{schedule.category}</div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{schedule.description}</div>
                              </td>
                              <td style={{ padding: '12px 16px', color: '#64748b' }}>
                                {schedule.location}
                              </td>
                              <td style={{ padding: '12px 16px', color: '#64748b' }}>
                                Every {schedule.frequencyDays} days
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <PriorityBadge priority={schedule.priority} />
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                                  {schedule.nextRun ? schedule.nextRun.toLocaleDateString() : 'Due now'}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <button
                                  onClick={() => deleteSchedule(schedule.id)}
                                  style={{ color: '#dc2626', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '12px' }}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {scheduledTasks.length === 0 && (
                            <tr>
                              <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                No scheduled tasks created yet.<br />
                                Create recurring maintenance tasks to never forget important inspections.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <ImageModal isOpen={imageModalOpen} src={modalImageSrc} onClose={closeImageModal} />
      <CompletionModal
        isOpen={completionModalOpen}
        onClose={() => {
          setCompletionModalOpen(false);
          setSelectedTicket(null);
        }}
        onComplete={handleCompleteTask}
        ticket={selectedTicket}
      />
      <ScheduleForm
        isOpen={showScheduleForm}
        onClose={() => setShowScheduleForm(false)}
        onSubmit={createSchedule}
      />

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
