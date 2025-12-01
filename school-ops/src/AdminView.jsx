import React, { useState, useEffect } from 'react';
import { updateDoc, doc, serverTimestamp, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ShieldAlert, Users, Calendar, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown, MapPin, User, FileText, Camera, X, Trash2, Play, Pause, RefreshCw, Activity, RotateCcw } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const config = { open: { color: '#dc2626', bg: '#fef2f2', text: 'Open' }, in_progress: { color: '#d97706', bg: '#fef3c7', text: 'In Progress' }, resolved: { color: '#059669', bg: '#d1fae5', text: 'Resolved' } };
  const style = config[status] || config.open;
  return <span style={{ padding: '4px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', color: style.color, backgroundColor: style.bg }}>{style.text}</span>;
};

const PriorityBadge = ({ priority }) => {
  const config = { low: { color: '#6b7280', bg: '#f3f4f6' }, medium: { color: '#2563eb', bg: '#dbeafe' }, high: { color: '#ea580c', bg: '#fed7aa' }, critical: { color: 'white', bg: '#dc2626' } };
  const style = config[priority] || config.medium;
  return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', color: style.color, backgroundColor: style.bg, textTransform: 'uppercase' }}>{priority}</span>;
};

// Ticket Detail Modal Component
function TicketDetailModal({ isOpen, onClose, ticket }) {
  const [selectedImage, setSelectedImage] = useState(null);

  if (!isOpen || !ticket) return null;

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDisplayName = (email) => {
    if (!email) return 'Unknown';
    return email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
  };

  const getTimeElapsed = (startedAt) => {
    if (!startedAt) return '';
    const started = startedAt.toDate ? startedAt.toDate() : new Date(startedAt);
    const now = new Date();
    const diffMs = now - started;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>{ticket.category}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ 
                padding: '2px 8px', 
                borderRadius: '4px', 
                fontSize: '11px', 
                fontWeight: '600', 
                textTransform: 'uppercase',
                backgroundColor: ticket.priority === 'critical' ? '#dc2626' : ticket.priority === 'high' ? '#fed7aa' : ticket.priority === 'medium' ? '#dbeafe' : '#f3f4f6',
                color: ticket.priority === 'critical' ? 'white' : ticket.priority === 'high' ? '#ea580c' : ticket.priority === 'medium' ? '#2563eb' : '#6b7280'
              }}>
                {ticket.priority}
              </span>
              <span style={{ 
                padding: '4px 8px', 
                borderRadius: '9999px', 
                fontSize: '11px', 
                fontWeight: '600',
                backgroundColor: ticket.status === 'open' ? '#fef2f2' : ticket.status === 'in_progress' ? '#fef3c7' : '#d1fae5',
                color: ticket.status === 'open' ? '#dc2626' : ticket.status === 'in_progress' ? '#d97706' : '#059669'
              }}>
                {ticket.status === 'open' ? 'Open' : ticket.status === 'in_progress' ? 'In Progress' : 'Resolved'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={24} color="#64748b" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
            <MapPin size={20} color="#4f46e5" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>Location</p>
              <p style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>{ticket.location}</p>
            </div>
          </div>

          {/* Reported By & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <User size={20} color="#4f46e5" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>Reported By</p>
                <p style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>
                  {ticket.submittedBy ? getDisplayName(ticket.submittedBy) : ticket.reporterName || 'Anonymous'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <Clock size={20} color="#4f46e5" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>Reported On</p>
                <p style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>{formatDate(ticket.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
            <FileText size={20} color="#4f46e5" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Description</p>
              <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {ticket.description || 'No description provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Photos */}
          {ticket.imageUrls && ticket.imageUrls.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
              <Camera size={20} color="#4f46e5" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Photos ({ticket.imageUrls.length})</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                  {ticket.imageUrls.map((url, index) => (
                    <img
                      key={index}
                      src={url}
                      alt={`Issue photo ${index + 1}`}
                      style={{ 
                        width: '100%', 
                        height: '100px', 
                        objectFit: 'cover', 
                        borderRadius: '8px', 
                        cursor: 'pointer',
                        border: '1px solid #e2e8f0'
                      }}
                      onClick={() => setSelectedImage(url)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Work Status (if in progress) */}
          {ticket.status === 'in_progress' && ticket.startedAt && (
            <div style={{ backgroundColor: '#fef3c7', padding: '12px 16px', borderRadius: '8px', border: '1px solid #fde68a', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#92400e', fontWeight: '500' }}>
                🔧 Being worked on by {ticket.startedByName || getDisplayName(ticket.assignedTo)} • Started {getTimeElapsed(ticket.startedAt)}
              </p>
            </div>
          )}

          {/* Completion Info (if resolved) */}
          {ticket.status === 'resolved' && (
            <div style={{ backgroundColor: '#d1fae5', padding: '12px 16px', borderRadius: '8px', border: '1px solid #a7f3d0', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
                ✓ Completed by {ticket.resolvedBy || 'Unknown'} • {formatDate(ticket.resolvedAt)}
              </p>
              {ticket.completionNotes && (
                <p style={{ fontSize: '13px', color: '#065f46', marginTop: '8px' }}>
                  Notes: {ticket.completionNotes}
                </p>
              )}
            </div>
          )}

          {/* Completion Photos */}
          {ticket.completionImageUrls && ticket.completionImageUrls.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
              <CheckCircle size={20} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Completion Photos ({ticket.completionImageUrls.length})</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                  {ticket.completionImageUrls.map((url, index) => (
                    <img
                      key={index}
                      src={url}
                      alt={`Completion photo ${index + 1}`}
                      style={{ 
                        width: '100%', 
                        height: '100px', 
                        objectFit: 'cover', 
                        borderRadius: '8px', 
                        cursor: 'pointer',
                        border: '2px solid #10b981'
                      }}
                      onClick={() => setSelectedImage(url)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <button 
            onClick={onClose} 
            style={{ width: '100%', padding: '10px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Image Lightbox */}
      {selectedImage && (
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, cursor: 'pointer' }}
          onClick={() => setSelectedImage(null)}
        >
          <img src={selectedImage} alt="Full size" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: '8px' }} />
          <button 
            onClick={() => setSelectedImage(null)} 
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', padding: '8px', cursor: 'pointer' }}
          >
            <X size={24} color="white" />
          </button>
        </div>
      )}
    </div>
  );
}

// Schedule Detail Modal Component
function ScheduleDetailModal({ isOpen, onClose, schedule }) {
  if (!isOpen || !schedule) return null;

  const formatScheduleDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const calculateNextRun = () => {
    if (!schedule.lastRun || !schedule.frequencyDays) return 'N/A';
    const lastRunDate = schedule.lastRun.toDate ? schedule.lastRun.toDate() : new Date(schedule.lastRun);
    const nextRunDate = new Date(lastRunDate);
    nextRunDate.setDate(nextRunDate.getDate() + schedule.frequencyDays);
    return formatScheduleDate(nextRunDate);
  };

  const locationCount = schedule.locations?.length || 0;
  const isActive = schedule.isActive !== false;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>{schedule.category || 'Scheduled Task'}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                padding: '4px 10px', 
                borderRadius: '9999px', 
                fontSize: '11px', 
                fontWeight: '600',
                backgroundColor: isActive ? '#d1fae5' : '#f3f4f6',
                color: isActive ? '#059669' : '#6b7280'
              }}>
                {isActive ? 'ACTIVE' : 'PAUSED'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={24} color="#64748b" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Description */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Description</p>
            <p style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>{schedule.description || 'No description'}</p>
          </div>

          {/* Schedule Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Frequency</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={16} color="#4f46e5" />
                Every {schedule.frequencyDays || '?'} days
              </p>
            </div>
            <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Total Locations</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={16} color="#4f46e5" />
                {locationCount} location{locationCount !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ backgroundColor: '#dbeafe', padding: '12px', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', color: '#1d4ed8', marginBottom: '4px', textTransform: 'uppercase' }}>Current Run</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={16} color="#1d4ed8" />
                {schedule.lastRun ? formatScheduleDate(schedule.lastRun) : 'Never'}
              </p>
            </div>
            <div style={{ backgroundColor: '#fef3c7', padding: '12px', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', textTransform: 'uppercase' }}>Next Run</p>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={16} color="#d97706" />
                {calculateNextRun()}
              </p>
            </div>
          </div>

          {/* All Locations */}
          <div>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
              All Covered Locations ({locationCount})
            </p>
            <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', maxHeight: '300px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {schedule.locations && schedule.locations.map((loc, i) => (
                  <div key={i} style={{ fontSize: '13px', padding: '8px 12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={14} color="#4f46e5" />
                    {loc}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <button 
            onClick={onClose} 
            style={{ width: '100%', padding: '10px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminView({ tickets, user, userData, onCreateSchedule, onDeleteTicket }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [allUsers, setAllUsers] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [showScheduleDetailModal, setShowScheduleDetailModal] = useState(false);
  const [detailSchedule, setDetailSchedule] = useState(null);

  const openDetailModal = (ticket) => {
    setDetailTicket(ticket);
    setShowDetailModal(true);
  };

  const getDisplayName = (email) => {
    if (!email) return 'Unknown';
    return email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const usersDocs = await getDocs(collection(db, 'users'));
      setAllUsers(usersDocs.docs.map(d => ({ id: d.id, ...d.data() })));
      const schedulesDocs = await getDocs(collection(db, 'scheduled_tasks'));
      setAllSchedules(schedulesDocs.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const ticketStats = tickets.reduce((a, t) => {
    if (t.priority === 'critical') a.critical++;
    if (t.status === 'open') a.backlog++;
    if (t.status === 'in_progress') a.inProgress++;
    if (t.status === 'resolved') a.resolved++;
    return a;
  }, { critical: 0, backlog: 0, inProgress: 0, resolved: 0 });

  const updateUser = async (userId, status) => {
    await updateDoc(doc(db, 'users', userId), { status, [`${status}At`]: serverTimestamp(), [`${status}By`]: userData?.email });
    fetchData();
    setOpenDropdown(null);
  };

  const deleteUser = async (userId, userEmail) => {
    if (confirm(`Are you sure you want to permanently delete the user "${userEmail}"? This action cannot be undone and will remove all user data.`)) {
      try {
        await deleteDoc(doc(db, 'users', userId));
        fetchData();
        setOpenDropdown(null);
        alert('User deleted successfully.');
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user. Please try again.');
      }
    }
  };

  const escalateTicket = async (ticketId) => {
    await updateDoc(doc(db, 'maintenance_tickets', ticketId), { priority: 'critical', escalated: true, escalatedAt: serverTimestamp() });
  };

  return (
    <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert style={{ height: '20px', width: '20px', color: '#4f46e5' }} /> Administration Control
      </h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        {[{ k: 'overview', l: 'Overview' }, { k: 'users', l: `Users (${allUsers.length})` }, { k: 'schedules', l: `Schedules (${allSchedules.length})` }].map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)} style={{ padding: '10px 16px', borderRadius: '6px', border: 'none', backgroundColor: activeTab === t.k ? '#4f46e5' : '#f8fafc', color: activeTab === t.k ? 'white' : '#64748b', fontWeight: '500', cursor: 'pointer' }}>{t.l}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} /> Executive Oversight
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '16px' }}>Monitor maintenance performance.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{ backgroundColor: '#374151', padding: '16px', borderRadius: '8px' }}>
                <p style={{ fontSize: '36px', fontWeight: '700', color: '#fbbf24', margin: '0' }}>{ticketStats.critical}</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0' }}>Critical</p>
              </div>
              <div style={{ backgroundColor: '#374151', padding: '16px', borderRadius: '8px' }}>
                <p style={{ fontSize: '36px', fontWeight: '700', color: '#fbbf24', margin: '0' }}>{ticketStats.backlog}</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0' }}>Backlog</p>
              </div>
              <div style={{ backgroundColor: '#374151', padding: '16px', borderRadius: '8px' }}>
                <p style={{ fontSize: '36px', fontWeight: '700', color: '#22d3d1', margin: '0' }}>{ticketStats.inProgress}</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0' }}>In Progress</p>
              </div>
              <div style={{ backgroundColor: '#374151', padding: '16px', borderRadius: '8px' }}>
                <p style={{ fontSize: '36px', fontWeight: '700', color: '#10b981', margin: '0' }}>{ticketStats.resolved}</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0' }}>Resolved</p>
              </div>
            </div>
          </div>

          <div className="table-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '650px' }}>
            <thead><tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={{ padding: '4px 12px', textAlign: 'left', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Category / Location</th>
              <th style={{ padding: '4px 12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Status</th>
              <th style={{ padding: '4px 12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Reported</th>
              <th style={{ padding: '4px 12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
            </tr></thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td 
                    style={{ padding: '4px 12px', cursor: 'pointer' }}
                    onClick={() => openDetailModal(t)}
                  >
                    <p style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {t.category}
                      {(t.imageUrls && t.imageUrls.length > 0) && (
                        <Camera size={14} color="#64748b" title={`${t.imageUrls.length} photo(s)`} />
                      )}
                    </p>
                    <p style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px', marginBottom: '2px' }}>
                      📍 {t.location} <PriorityBadge priority={t.priority} />
                      {t.submittedBy && <span style={{ color: '#6b7280' }}>👤 {getDisplayName(t.submittedBy)}</span>}
                    </p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '0' }}>Click to view details</p>
                  </td>
                  <td style={{ padding: '4px 12px', textAlign: 'center' }}><StatusBadge status={t.status} /></td>
                  <td style={{ padding: '4px 12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      {t.status !== 'resolved' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); escalateTicket(t.id); }} 
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #dc2626', backgroundColor: 'white', color: '#dc2626', fontSize: '11px', cursor: 'pointer' }}
                        >
                          ⚠ Escalate
                        </button>
                      )}
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          if (confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
                            onDeleteTicket(t.id);
                          }
                        }} 
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #fee2e2', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Delete ticket"
                      >
                        <Trash2 size={14} color="#ef4444" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>User Management</h3>
          <div className="table-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead><tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Email</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Role</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Registered</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
            </tr></thead>
            <tbody>
              {allUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>{u.email}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: u.role === 'admin' ? '#dbeafe' : u.role === 'maintenance' ? '#fef3c7' : '#f3f4f6', color: u.role === 'admin' ? '#1d4ed8' : u.role === 'maintenance' ? '#92400e' : '#374151', textTransform: 'capitalize' }}>{u.role || 'Staff'}</span></td>
                  <td style={{ padding: '12px', textAlign: 'center' }}><span style={{ padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', backgroundColor: u.status === 'approved' ? '#d1fae5' : u.status === 'blocked' ? '#fee2e2' : '#fef3c7', color: u.status === 'approved' ? '#059669' : u.status === 'blocked' ? '#dc2626' : '#d97706' }}>{u.status || 'pending'}</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>N/A</td>
                  <td style={{ padding: '12px', textAlign: 'center', position: 'relative' }}>
                    <button onClick={() => setOpenDropdown(openDropdown === u.id ? null : u.id)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: '0 auto' }}>
                      Actions <ChevronDown size={14} />
                    </button>
                    {openDropdown === u.id && (
                      <div style={{ position: 'absolute', top: '100%', right: '50%', transform: 'translateX(50%)', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, minWidth: '120px' }}>
                        {u.status !== 'approved' && <button onClick={() => updateUser(u.id, 'approved')} style={{ width: '100%', padding: '10px 16px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', color: '#059669' }}>✓ Approve</button>}
                        {u.status !== 'blocked' && <button onClick={() => updateUser(u.id, 'blocked')} style={{ width: '100%', padding: '10px 16px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', color: '#dc2626' }}>✕ Block</button>}
                        {u.status !== 'approved' && <button onClick={() => deleteUser(u.id, u.email)} style={{ width: '100%', padding: '10px 16px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', textAlign: 'left', color: '#dc2626' }}>🗑 Delete User</button>}
                      </div>
                    )}
                  </td>
              </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* SCHEDULES TAB */}
      {activeTab === 'schedules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Advanced Scheduling System</h3>
            <button onClick={onCreateSchedule} style={{ backgroundColor: '#4f46e5', color: 'white', padding: '10px 16px', borderRadius: '8px', border: 'none', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={16} /> Create Schedule</button>
          </div>
          
          {/* Info Box */}
          <div style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.8', backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '8px', marginBottom: '24px' }}>
            <p style={{ margin: '4px 0' }}>🎯 <strong>Smart Location Groups:</strong> Schedule maintenance for entire buildings</p>
            <p style={{ margin: '4px 0' }}>📅 <strong>Flexible Timing:</strong> Start immediately or schedule for optimal dates</p>
            <p style={{ margin: '4px 0' }}>🔄 <strong>Advanced Frequencies:</strong> Daily, weekly, monthly, quarterly intervals</p>
          </div>

          {/* Schedules List */}
          {allSchedules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
              <Calendar style={{ height: '48px', width: '48px', margin: '0 auto 16px', color: '#94a3b8' }} />
              <p style={{ fontSize: '16px', fontWeight: '500' }}>No scheduled tasks created yet</p>
              <p style={{ fontSize: '14px' }}>Click "Create Schedule" to set up automated maintenance tasks.</p>
            </div>
          ) : (
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active Schedules ({allSchedules.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {allSchedules.map(schedule => {
                  const formatScheduleDate = (date) => {
                    if (!date) return 'N/A';
                    const d = date.toDate ? date.toDate() : new Date(date);
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  };
                  
                  const locationCount = schedule.locations?.length || 0;
                  const isActive = schedule.isActive !== false;
                  
                  return (
                    <div 
                      key={schedule.id} 
                      style={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '10px', 
                        padding: '16px',
                        borderLeft: `4px solid ${isActive ? '#4f46e5' : '#94a3b8'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h5 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                              {schedule.category || 'Maintenance Task'}
                            </h5>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '9999px', 
                              fontSize: '10px', 
                              fontWeight: '600',
                              backgroundColor: isActive ? '#d1fae5' : '#f3f4f6',
                              color: isActive ? '#059669' : '#6b7280'
                            }}>
                              {isActive ? 'ACTIVE' : 'PAUSED'}
                            </span>
                          </div>
                          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                            {schedule.description || 'No description'}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={async () => {
                              await updateDoc(doc(db, 'scheduled_tasks', schedule.id), { isActive: !isActive });
                              fetchData();
                            }}
                            style={{ 
                              padding: '6px', 
                              borderRadius: '6px', 
                              border: '1px solid #d1d5db', 
                              backgroundColor: 'white', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={isActive ? 'Pause schedule' : 'Resume schedule'}
                          >
                            {isActive ? <Pause size={16} color="#d97706" /> : <Play size={16} color="#059669" />}
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this schedule?')) {
                                await deleteDoc(doc(db, 'scheduled_tasks', schedule.id));
                                fetchData();
                              }
                            }}
                            style={{ 
                              padding: '6px', 
                              borderRadius: '6px', 
                              border: '1px solid #fecaca', 
                              backgroundColor: 'white', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Delete schedule"
                          >
                            <Trash2 size={16} color="#dc2626" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="responsive-grid-4" style={{ fontSize: '13px' }}>
                        <div>
                          <p style={{ color: '#94a3b8', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase' }}>Locations</p>
                          <p style={{ color: '#1e293b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={14} color="#4f46e5" />
                            {locationCount} location{locationCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div>
                          <p style={{ color: '#94a3b8', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase' }}>Frequency</p>
                          <p style={{ color: '#1e293b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={14} color="#4f46e5" />
                            Every {schedule.frequencyDays || '?'} days
                          </p>
                        </div>
                        <div>
                          <p style={{ color: '#94a3b8', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase' }}>Current Run</p>
                          <p style={{ color: '#1e293b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={14} color="#4f46e5" />
                            {schedule.lastRun ? formatScheduleDate(schedule.lastRun) : 'Never'}
                          </p>
                        </div>
                        <div>
                          <p style={{ color: '#94a3b8', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase' }}>Next Run</p>
                          <p style={{ color: '#d97706', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={14} color="#d97706" />
                            {(() => {
                              if (!schedule.lastRun || !schedule.frequencyDays) return 'N/A';
                              const lastRunDate = schedule.lastRun.toDate ? schedule.lastRun.toDate() : new Date(schedule.lastRun);
                              const nextRunDate = new Date(lastRunDate);
                              nextRunDate.setDate(nextRunDate.getDate() + schedule.frequencyDays);
                              return nextRunDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            })()}
                          </p>
                        </div>
                      </div>

                      {/* Locations list preview - clickable */}
                      {schedule.locations && schedule.locations.length > 0 && (
                        <div 
                          style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                          onClick={() => { setDetailSchedule(schedule); setShowScheduleDetailModal(true); }}
                        >
                          <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>Covered Locations</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {schedule.locations.slice(0, 5).map((loc, i) => (
                              <span key={i} style={{ fontSize: '12px', padding: '2px 8px', backgroundColor: '#f1f5f9', borderRadius: '4px', color: '#64748b' }}>
                                {loc}
                              </span>
                            ))}
                            {schedule.locations.length > 5 && (
                              <span style={{ fontSize: '12px', padding: '2px 8px', backgroundColor: '#dbeafe', borderRadius: '4px', color: '#2563eb', cursor: 'pointer' }}>
                                +{schedule.locations.length - 5} more (click to view all)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showDetailModal && (
        <TicketDetailModal
          isOpen={showDetailModal}
          onClose={() => { setShowDetailModal(false); setDetailTicket(null); }}
          ticket={detailTicket}
        />
      )}

      {showScheduleDetailModal && (
        <ScheduleDetailModal
          isOpen={showScheduleDetailModal}
          onClose={() => { setShowScheduleDetailModal(false); setDetailSchedule(null); }}
          schedule={detailSchedule}
        />
      )}
    </div>
  );
}
