import React, { useState, useEffect } from 'react';
import { updateDoc, doc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Wrench, X, Image as ImageIcon, CheckCircle, MapPin, Clock, User, FileText, Camera, Calendar, RefreshCw } from 'lucide-react';
import { compressImage, uploadImage } from './storage';

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
function TicketDetailModal({ isOpen, onClose, ticket, getDisplayName, getTimeElapsed }) {
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
            <div style={{ backgroundColor: '#fef3c7', padding: '12px 16px', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <p style={{ fontSize: '13px', color: '#92400e', fontWeight: '500' }}>
                🔧 Being worked on by {ticket.startedByName || getDisplayName(ticket.assignedTo)} • Started {getTimeElapsed(ticket.startedAt)}
              </p>
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

// Completion Modal Component
function CompletionModal({ isOpen, onClose, ticket, onComplete }) {
  const [technicianName, setTechnicianName] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length + completionFiles.length > 3) {
      alert("Maximum 3 completion photos allowed.");
      return;
    }
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setCompletionFiles(prev => [...prev, compressed]);
      } catch (error) {
        console.error("Error compressing:", error);
      }
    }
    e.target.value = null;
  };

  const handleSubmit = async () => {
    if (!technicianName.trim()) {
      alert("Please enter your name.");
      return;
    }
    setSubmitting(true);
    try {
      let imageUrls = [];
      if (completionFiles.length > 0) {
        setUploading(true);
        for (let i = 0; i < completionFiles.length; i++) {
          const result = await uploadImage(completionFiles[i], `completion_${ticket.id}_${i}`);
          if (result.success) imageUrls.push(result.downloadURL);
        }
        setUploading(false);
      }
      await onComplete(ticket.id, technicianName.trim(), completionNotes.trim(), imageUrls);
      onClose();
    } catch (error) {
      console.error("Error completing:", error);
      alert("Failed to complete task.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '100%', maxWidth: '500px', margin: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b' }}>Complete Task</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontWeight: '600', color: '#1e293b' }}>{ticket?.category}</p>
          <p style={{ fontSize: '13px', color: '#64748b' }}>{ticket?.location}</p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Technician Name *</label>
          <input type="text" value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} placeholder="Enter your name" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Completion Notes</label>
          <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Describe work completed..." style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '80px' }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Completion Photos (Optional)</label>
          <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white' }}>
            <ImageIcon size={16} /> Add Photos
            <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
          </label>
          {completionFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {completionFiles.map((f, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={f} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px' }} />
                  <button onClick={() => setCompletionFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: '-4px', right: '-4px', backgroundColor: '#ef4444', color: 'white', borderRadius: '50%', border: 'none', width: '18px', height: '18px', cursor: 'pointer', fontSize: '12px' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={handleSubmit} disabled={submitting || uploading} style={{ flex: 1, padding: '10px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', opacity: (submitting || uploading) ? 0.5 : 1 }}>
            {uploading ? 'Uploading...' : submitting ? 'Completing...' : '✓ Mark Complete'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 20px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenanceView({ tickets, user, userData }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [scheduledTasks, setScheduledTasks] = useState([]);

  const activeTickets = tickets.filter(t => t.status !== 'resolved');

  // Fetch scheduled tasks
  useEffect(() => {
    if (!db) return;

    const scheduledTasksRef = collection(db, 'scheduled_tasks');
    const unsubscribe = onSnapshot(scheduledTasksRef, (snapshot) => {
      const scheduled = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(task => task.isActive !== false) // Only show active schedules
        .sort((a, b) => {
          // Sort by next due date
          const aDate = a.nextRun?.toDate ? a.nextRun.toDate() : new Date();
          const bDate = b.nextRun?.toDate ? b.nextRun.toDate() : new Date();
          return aDate - bDate;
        });

      setScheduledTasks(scheduled);
    }, (error) => {
      console.error("Error fetching scheduled tasks:", error);
    });

    return () => unsubscribe();
  }, []);

  // Helper function to format time elapsed
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

  // Helper to get display name from email
  const getDisplayName = (email) => {
    if (!email) return 'Unknown';
    return email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1);
  };

  const startJob = async (ticketId) => {
    try {
      await updateDoc(doc(db, 'maintenance_tickets', ticketId), {
        status: 'in_progress',
        startedAt: serverTimestamp(),
        assignedTo: userData?.email || user?.uid,
        startedByName: userData?.name || userData?.email?.split('@')[0] || 'Technician'
      });
    } catch (error) {
      console.error("Error starting job:", error);
      alert("Failed to start job.");
    }
  };

  const completeTask = async (ticketId, technicianName, notes, imageUrls) => {
    try {
      const updateData = {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: technicianName,
        completionNotes: notes,
        completedBy: userData?.email || user?.uid
      };
      
      // QUICK FIX: If this was an "Open" ticket (skipped the start phase), set start time now
      if (selectedTicket && selectedTicket.status === 'open') {
        updateData.startedAt = serverTimestamp();
        updateData.assignedTo = userData?.email || user?.uid;
        updateData.startedByName = technicianName;
        updateData.quickFixed = true; // Flag to indicate this was a quick fix
      }
      
      if (imageUrls && imageUrls.length > 0) {
        updateData.completionImageUrls = imageUrls;
      }
      await updateDoc(doc(db, 'maintenance_tickets', ticketId), updateData);
    } catch (error) {
      console.error("Error completing:", error);
      throw error;
    }
  };

  const openCompletionModal = (ticket) => {
    setSelectedTicket(ticket);
    setShowCompletionModal(true);
  };

  const openDetailModal = (ticket) => {
    setDetailTicket(ticket);
    setShowDetailModal(true);
  };

  return (
    <div>
      {/* Maintenance Job Queue Card */}
      <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wrench style={{ height: '20px', width: '20px', color: '#4f46e5' }} /> Maintenance Job Queue
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>Manage and complete assigned maintenance tasks</p>

        {activeTickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
            <CheckCircle style={{ height: '48px', width: '48px', margin: '0 auto 16px', color: '#10b981' }} />
            <p style={{ fontSize: '18px', fontWeight: '600' }}>All tasks completed!</p>
            <p>No pending maintenance jobs.</p>
          </div>
        ) : (
          <div className="table-container">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '5px', textAlign: 'left', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Category / Location</th>
                <th style={{ padding: '5px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                <th style={{ padding: '5px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Reported</th>
                <th style={{ padding: '5px', textAlign: 'center', fontSize: '12px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeTickets.map(ticket => (
                <tr key={ticket.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td
                    style={{ padding: '5px', cursor: 'pointer' }}
                    onClick={() => openDetailModal(ticket)}
                  >
                    <p style={{ fontWeight: '600', color: '#1e293b', margin: '0 0 3px 0', lineHeight: '1.5', display: 'flex', alignItems: 'center', gap: '2px' }}>
                      {ticket.category}
                      {(ticket.imageUrls && ticket.imageUrls.length > 0) && (
                        <Camera size={14} color="#64748b" title={`${ticket.imageUrls.length} photo(s)`} />
                      )}
                    </p>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '3px 0 3px 0', lineHeight: '1.5', display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
                      📍 {ticket.location} <PriorityBadge priority={ticket.priority} />
                      {ticket.submittedBy && <span style={{ color: '#6b7280' }}>👤 {getDisplayName(ticket.submittedBy)}</span>}
                    </p>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0 0', lineHeight: '1.5' }}>Click to view details</p>
                  </td>
                  <td style={{ padding: '5px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}>
                      <StatusBadge status={ticket.status} />
                      {ticket.status === 'in_progress' && ticket.startedAt && (
                        <span style={{ fontSize: '10px', color: '#6b7280' }}>
                          {ticket.startedByName || getDisplayName(ticket.assignedTo)} • {getTimeElapsed(ticket.startedAt)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '5px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '5px', textAlign: 'center' }}>
                    {/* If Open: Show BOTH Start and Quick Complete */}
                    {ticket.status === 'open' && (
                      <div className="action-buttons">
                        <button
                          onClick={() => startJob(ticket.id)}
                          style={{ padding: '8px 14px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
                          title="Start Timer (Long Job)"
                        >
                          🔧 Start
                        </button>
                        <button
                          onClick={() => openCompletionModal(ticket)}
                          style={{ padding: '8px 14px', backgroundColor: 'white', border: '2px solid #10b981', color: '#10b981', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                          title="Mark Done Immediately (Quick Fix)"
                        >
                          ⚡ Quick Fix
                        </button>
                      </div>
                    )}

                    {/* If In Progress: Show ONLY Complete */}
                    {ticket.status === 'in_progress' && (
                      <button onClick={() => openCompletionModal(ticket)} style={{ padding: '10px 18px', backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        ✓ Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {showCompletionModal && (
          <CompletionModal
            isOpen={showCompletionModal}
            onClose={() => { setShowCompletionModal(false); setSelectedTicket(null); }}
            ticket={selectedTicket}
            onComplete={completeTask}
          />
        )}

        {showDetailModal && (
          <TicketDetailModal
            isOpen={showDetailModal}
            onClose={() => { setShowDetailModal(false); setDetailTicket(null); }}
            ticket={detailTicket}
            getDisplayName={getDisplayName}
            getTimeElapsed={getTimeElapsed}
          />
        )}
      </div>

      {/* Upcoming Scheduled Maintenance Card */}
      {scheduledTasks.length > 0 && (
        <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar style={{ height: '20px', width: '20px', color: '#4f46e5' }} /> Upcoming Scheduled Maintenance
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>Scheduled tasks created by Head Management</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {scheduledTasks.map(task => {
              const nextRunDate = task.nextRun?.toDate ? task.nextRun.toDate() : new Date();
              const formattedDate = nextRunDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                ...(nextRunDate.getFullYear() !== new Date().getFullYear() && { year: 'numeric' })
              });

              return (
                <div key={task.id} style={{
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                        {task.category}
                      </h3>
                      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '6px' }}>
                        {task.description || 'No description provided'}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#6b7280' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={14} />
                        Every {task.frequencyDays || '?'} days
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={14} />
                        {task.locations?.length || 0} locations
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📅 Next: {formattedDate}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
