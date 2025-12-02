import React, { useState, useEffect } from 'react';
import { updateDoc, doc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  Wrench, X, Image as ImageIcon, CheckCircle, MapPin,
  Clock, User, FileText, Camera, Calendar, RefreshCw, AlertTriangle
} from 'lucide-react';
import { compressImage, uploadImage } from './storage';

// --- Badges ---
const StatusBadge = ({ status }) => {
  const styles = {
    open: "bg-red-50 text-red-700 border-red-100",
    in_progress: "bg-amber-50 text-amber-700 border-amber-100",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-100"
  };
  const labels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.open}`}>
      {labels[status] || status}
    </span>
  );
};

const PriorityBadge = ({ priority }) => {
  const styles = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-red-600 text-white animate-pulse"
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${styles[priority] || styles.medium}`}>
      {priority}
    </span>
  );
};

// --- Modals ---

function TicketDetailModal({ isOpen, onClose, ticket, getDisplayName, getTimeElapsed }) {
  const [selectedImage, setSelectedImage] = useState(null);
  if (!isOpen || !ticket) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50">
          <div>
            <h3 className="font-bold text-lg text-slate-800">{ticket.category}</h3>
            <div className="flex gap-2 mt-1">
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
           <div className="grid grid-cols-2 gap-4 text-sm">
             <div>
               <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Location</p>
               <div className="flex items-center gap-2 text-slate-700 font-medium">
                 <MapPin size={14} className="text-indigo-500" /> {ticket.location}
               </div>
             </div>
             <div>
               <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Reported By</p>
               <div className="flex items-center gap-2 text-slate-700 font-medium">
                 <User size={14} className="text-indigo-500" />
                 {ticket.submittedBy ? getDisplayName(ticket.submittedBy) : ticket.reporterName || 'Anonymous'}
               </div>
             </div>
           </div>

           <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
             <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Description</p>
             <p className="text-slate-700 text-sm whitespace-pre-wrap">{ticket.description}</p>
           </div>

           {ticket.imageUrls?.length > 0 && (
             <div>
               <p className="text-xs text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1">
                 <Camera size={12} /> Photos
               </p>
               <div className="grid grid-cols-3 gap-2">
                 {ticket.imageUrls.map((url, i) => (
                   <img
                     key={i} src={url} alt="Proof"
                     className="h-16 w-full object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80"
                     onClick={() => setSelectedImage(url)}
                   />
                 ))}
               </div>
             </div>
           )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} className="max-w-full max-h-full rounded" alt="Full" />
          <button className="absolute top-4 right-4 text-white"><X size={32}/></button>
        </div>
      )}
    </div>
  );
}

function CompletionModal({ isOpen, onClose, ticket, onComplete }) {
  const [technicianName, setTechnicianName] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length + completionFiles.length > 3) return alert("Max 3 photos.");
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setCompletionFiles(prev => [...prev, compressed]);
      } catch (e) { console.error(e); }
    }
  };

  const handleSubmit = async () => {
    if (!technicianName.trim()) return alert("Enter your name.");
    setSubmitting(true);
    try {
      let imageUrls = [];
      if (completionFiles.length > 0) {
        setUploading(true);
        const urls = [];
        for (let i = 0; i < completionFiles.length; i++) {
          const res = await uploadImage(completionFiles[i], `completion_${ticket.id}_${i}`);
          if (res.success) urls.push(res.downloadURL);
        }
        setUploading(false);
        imageUrls = urls;
      }
      await onComplete(ticket.id, technicianName.trim(), completionNotes.trim(), imageUrls);
      onClose();
    } catch (e) { alert("Failed to complete."); } finally { setSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Complete Task</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Technician Name *</label>
            <input
              type="text"
              className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              value={technicianName}
              onChange={e => setTechnicianName(e.target.value)}
              placeholder="Who fixed this?"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <textarea
              className="w-full mt-1 p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none h-20"
              value={completionNotes}
              onChange={e => setCompletionNotes(e.target.value)}
              placeholder="What was done?"
            />
          </div>
          <div>
             <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg cursor-pointer hover:bg-slate-200 w-fit text-sm font-medium">
               <Camera size={16}/> Add Proof Photos
               <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} />
             </label>
             <div className="flex gap-2 mt-2">
               {completionFiles.map((f, i) => (
                 <div key={i} className="relative w-12 h-12">
                   <img src={f} className="w-full h-full object-cover rounded" alt="Thumb" />
                   <button onClick={() => setCompletionFiles(p => p.filter((_, x) => x !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-md"><X size={12}/></button>
                 </div>
               ))}
             </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || uploading}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {(submitting || uploading) ? (
              <>
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Uploading Photos...
                  </>
                ) : (
                  <>
                    Completing...
                  </>
                )}
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                Mark as Resolved
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function MaintenanceView({ tickets, user, userData }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [scheduledTasks, setScheduledTasks] = useState([]);

  const activeTickets = tickets.filter(t => t.status !== 'resolved');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'scheduled_tasks'), (snap) => {
      const scheduled = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.isActive !== false)
        .sort((a, b) => (a.nextRun?.toDate?.() || new Date()) - (b.nextRun?.toDate?.() || new Date()));
      setScheduledTasks(scheduled);
    });
    return () => unsub();
  }, []);

  const getDisplayName = (email) => {
    if (!email) return 'Unknown';
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const getTimeElapsed = (startedAt) => {
    if (!startedAt) return '';
    const diff = new Date() - (startedAt.toDate ? startedAt.toDate() : new Date(startedAt));
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    if (Math.floor(hrs / 24) > 0) return `${Math.floor(hrs / 24)}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    return `${mins}m ago`;
  };

  const startJob = async (ticketId) => {
    try {
      await updateDoc(doc(db, 'maintenance_tickets', ticketId), {
        status: 'in_progress',
        startedAt: serverTimestamp(),
        assignedTo: userData?.email || user?.uid,
        startedByName: userData?.name || userData?.email?.split('@')[0] || 'Technician'
      });
    } catch (e) {
      console.error(e);
      alert("Error starting job");
    }
  };

  const completeTask = async (id, techName, notes, imageUrls) => {
    try {
      const updateData = {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: techName,
        completionNotes: notes,
        completedBy: userData?.email || user?.uid
      };
      if (selectedTicket?.status === 'open') {
         updateData.startedAt = serverTimestamp();
         updateData.assignedTo = userData?.email;
         updateData.startedByName = techName;
         updateData.quickFixed = true;
      }
      if (imageUrls?.length) updateData.completionImageUrls = imageUrls;
      await updateDoc(doc(db, 'maintenance_tickets', id), updateData);
    } catch (e) {
      console.error("Error completing:", e);
      throw e;
    }
  };

  return (
    <div className="space-y-6">

      {/* Queue Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <Wrench className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800">Maintenance Queue</h2>
        </div>

        {activeTickets.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-800 font-medium">All Caught Up!</p>
            <p className="text-slate-500 text-sm">No pending tasks.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeTickets.map(ticket => (
              <div key={ticket.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center">
                <div className="flex-1 cursor-pointer" onClick={() => { setDetailTicket(ticket); setShowDetailModal(true); }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-800">{ticket.category}</span>
                    {ticket.imageUrls?.length > 0 && <Camera size={14} className="text-slate-400" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={12}/> {ticket.location}</span>
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                   <div className="flex flex-col items-end gap-1">
                     <StatusBadge status={ticket.status} />
                     {ticket.status === 'in_progress' && (
                       <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                         <Clock size={10}/> {getTimeElapsed(ticket.startedAt)}
                       </span>
                     )}
                   </div>

                   <div className="flex gap-2">
                     {ticket.status === 'open' && (
                       <>
                         <button onClick={() => startJob(ticket.id)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">
                           Start Job
                         </button>
                         <button onClick={() => { setSelectedTicket(ticket); setShowCompletionModal(true); }} className="px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-50">
                           Quick Fix
                         </button>
                       </>
                     )}
                     {ticket.status === 'in_progress' && (
                       <button onClick={() => { setSelectedTicket(ticket); setShowCompletionModal(true); }} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1">
                         <CheckCircle size={12}/> Mark Done
                       </button>
                     )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled Tasks Card */}
      {scheduledTasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
           <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
             <Calendar className="w-5 h-5 text-indigo-600" /> Upcoming Schedules
           </h3>
           <div className="grid gap-3">
             {scheduledTasks.slice(0, 3).map(task => (
               <div key={task.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                 <div>
                   <p className="font-semibold text-slate-700 text-sm">{task.category}</p>
                   <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                     <RefreshCw size={10}/> Every {task.frequencyDays} days
                     <span className="w-1 h-1 bg-slate-300 rounded-full"/>
                     {task.locations?.length} locations
                   </p>
                 </div>
                 <div className="text-right">
                   <p className="text-xs font-bold text-indigo-600 uppercase">Next Due</p>
                   <p className="text-sm font-medium text-slate-800">
                     {task.nextRun?.toDate ? task.nextRun.toDate().toLocaleDateString() : 'N/A'}
                   </p>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* Modals */}
      <CompletionModal isOpen={showCompletionModal} onClose={() => setShowCompletionModal(false)} ticket={selectedTicket} onComplete={completeTask} />
      <TicketDetailModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} ticket={detailTicket} getDisplayName={getDisplayName} getTimeElapsed={getTimeElapsed} />

    </div>
  );
}
