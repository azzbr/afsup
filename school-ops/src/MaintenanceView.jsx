import React, { useState, useEffect, useMemo } from 'react';
import { updateDoc, doc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  Wrench, X, CheckCircle, MapPin, Clock, User, Camera, Calendar, RefreshCw, 
  AlertTriangle, Search, Filter, SortAsc, SortDesc, ChevronDown, ChevronUp,
  Play, Zap, History, AlertCircle, Loader2
} from 'lucide-react';
import { compressImage, uploadImage } from './storage';

// ============================================================================
// STATUS BADGE (HR-Style with Icons)
// ============================================================================
const StatusBadge = ({ status }) => {
  const config = {
    open: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: AlertCircle, label: 'Open' },
    in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock, label: 'In Progress' },
    resolved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle, label: 'Resolved' }
  };
  const style = config[status] || config.open;
  const Icon = style.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
      <Icon size={12} />
      {style.label}
    </span>
  );
};

// ============================================================================
// PRIORITY BADGE (HR-Style)
// ============================================================================
const PriorityBadge = ({ priority }) => {
  const config = {
    low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
    medium: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    critical: { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700', pulse: true }
  };
  const style = config[priority] || config.medium;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${style.bg} ${style.text} ${style.border} ${style.pulse ? 'animate-pulse' : ''}`}>
      {priority === 'critical' && <AlertTriangle size={10} />}
      {priority}
    </span>
  );
};

// ============================================================================
// QUICK STATS CARD
// ============================================================================
const StatCard = ({ icon: Icon, label, count, colorClass, borderColor }) => (
  <div className={`${colorClass} rounded-xl p-4 border ${borderColor} transition-transform hover:scale-105`}>
    <div className="flex items-center justify-between">
      <Icon size={20} className="opacity-70" />
      <span className="text-2xl font-bold">{count}</span>
    </div>
    <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
  </div>
);

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MaintenanceView({ tickets = [], user, userData }) {
  // Modal States
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  
  // Search, Filter, Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);

  // Calculate Stats
  const stats = useMemo(() => {
    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress').length;
    const resolved = tickets.filter(t => t.status === 'resolved').length;
    const critical = tickets.filter(t => t.priority === 'critical' && t.status !== 'resolved').length;
    return { open, inProgress, resolved, critical };
  }, [tickets]);

  // Filter and Sort Tickets
  const filteredTickets = useMemo(() => {
    let result = tickets.filter(t => t.status !== 'resolved');
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.category?.toLowerCase().includes(query) ||
        t.location?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      );
    }
    
    // Apply priority filter
    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return (b.createdAt?.toDate?.() || new Date()) - (a.createdAt?.toDate?.() || new Date());
      } else if (sortBy === 'oldest') {
        return (a.createdAt?.toDate?.() || new Date()) - (b.createdAt?.toDate?.() || new Date());
      } else if (sortBy === 'priority') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] || 4) - (order[b.priority] || 4);
      }
      return 0;
    });
    
    return result;
  }, [tickets, searchQuery, priorityFilter, sortBy]);

  // Resolved tickets for history
  const resolvedTickets = useMemo(() => {
    return tickets
      .filter(t => t.status === 'resolved')
      .sort((a, b) => (b.resolvedAt?.toDate?.() || new Date()) - (a.resolvedAt?.toDate?.() || new Date()))
      .slice(0, 10);
  }, [tickets]);

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

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon={AlertCircle} 
          label="Open" 
          count={stats.open} 
          colorClass="bg-red-50 text-red-700" 
          borderColor="border-red-200" 
        />
        <StatCard 
          icon={Clock} 
          label="In Progress" 
          count={stats.inProgress} 
          colorClass="bg-amber-50 text-amber-700" 
          borderColor="border-amber-200" 
        />
        <StatCard 
          icon={CheckCircle} 
          label="Resolved" 
          count={stats.resolved} 
          colorClass="bg-emerald-50 text-emerald-700" 
          borderColor="border-emerald-200" 
        />
        <StatCard 
          icon={AlertTriangle} 
          label="Critical" 
          count={stats.critical} 
          colorClass="bg-red-600 text-white" 
          borderColor="border-red-700" 
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by category, location, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white outline-none transition-all"
            />
          </div>
          
          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          {/* Sort Options */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Priority</option>
          </select>
        </div>
        
        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-700">{filteredTickets.length}</span> active tickets
            {(searchQuery || priorityFilter !== 'all') && (
              <button 
                onClick={() => { setSearchQuery(''); setPriorityFilter('all'); }}
                className="ml-2 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Active Tickets Queue */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">Active Tickets</h2>
          </div>
          <span className="text-sm text-slate-500">{filteredTickets.length} tasks</span>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-slate-800 font-medium">All Caught Up!</p>
            <p className="text-slate-500 text-sm">No pending tasks match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTickets.map(ticket => (
              <div 
                key={ticket.id} 
                className="p-4 hover:bg-slate-50 transition-all duration-200 group cursor-pointer border-l-4 border-transparent hover:border-indigo-500"
              >
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div className="flex-1" onClick={() => { setDetailTicket(ticket); setShowDetailModal(true); }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
                        {ticket.category}
                      </span>
                      {ticket.imageUrls?.length > 0 && (
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-500 flex items-center gap-1">
                          <Camera size={10} /> {ticket.imageUrls.length}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-slate-400" /> {ticket.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" /> {getTimeElapsed(ticket.createdAt)}
                      </span>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={ticket.status} />
                      {ticket.status === 'in_progress' && ticket.startedByName && (
                        <span className="text-[10px] text-slate-500">
                          by {ticket.startedByName}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {ticket.status === 'open' && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); startJob(ticket.id); }} 
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1 transition-colors"
                          >
                            <Play size={12} /> Start
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); setShowCompletionModal(true); }} 
                            className="px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-50 flex items-center gap-1 transition-colors"
                          >
                            <Zap size={12} /> Quick Fix
                          </button>
                        </>
                      )}
                      {ticket.status === 'in_progress' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); setShowCompletionModal(true); }} 
                          className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle size={12} /> Mark Done
                        </button>
                      )}
                    </div>
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
              <div key={task.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center hover:bg-slate-100 transition-colors">
                <div>
                  <p className="font-semibold text-slate-700 text-sm">{task.category}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <RefreshCw size={10} /> Every {task.frequencyDays} days
                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
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

      {/* Resolved History Section */}
      {resolvedTickets.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button 
            onClick={() => setShowResolvedHistory(!showResolvedHistory)}
            className="w-full p-5 flex items-center justify-between bg-slate-50/50 hover:bg-slate-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-slate-800">Resolved History</h3>
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {resolvedTickets.length}
              </span>
            </div>
            {showResolvedHistory ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>
          
          {showResolvedHistory && (
            <div className="divide-y divide-slate-100">
              {resolvedTickets.map(ticket => (
                <div 
                  key={ticket.id} 
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => { setDetailTicket(ticket); setShowDetailModal(true); }}
                >
                  <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle size={14} className="text-emerald-500" />
                        <span className="font-medium text-slate-700">{ticket.category}</span>
                        <PriorityBadge priority={ticket.priority} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {ticket.location}
                        </span>
                        {ticket.resolvedBy && (
                          <span className="flex items-center gap-1">
                            <User size={12} /> Fixed by: {ticket.resolvedBy}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Resolved</p>
                      <p className="text-sm font-medium text-slate-600">
                        {ticket.resolvedAt?.toDate ? ticket.resolvedAt.toDate().toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {ticket.completionNotes && (
                    <p className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      "{ticket.completionNotes}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CompletionModal isOpen={showCompletionModal} onClose={() => setShowCompletionModal(false)} ticket={selectedTicket} onComplete={completeTask} />
      <TicketDetailModal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} ticket={detailTicket} getDisplayName={getDisplayName} getTimeElapsed={getTimeElapsed} />

    </div>
  );
}
