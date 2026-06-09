import React, { useState, useMemo } from 'react';
import { updateDoc, doc, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  Wrench, X, CheckCircle, MapPin, Clock, User, Camera, Calendar, RefreshCw,
  AlertTriangle, Search, ChevronDown, ChevronUp, Play, Zap, History,
  AlertCircle, Copy, Building2, List, RotateCcw, Ban, MessageSquare
} from 'lucide-react';
import { compressImage, uploadImage } from './storage';
import { auditUpdate } from './data/audit';
import { can, actorFrom } from './permissions';
import { useScheduledTasks } from './data/useScheduledTasks';
import SupervisorDashboard from './maintenance/SupervisorDashboard';
import {
  getTimeOpen, buildingOf, BUILDING_LABELS, groupDuplicateTickets,
  computeScheduleDue, ticketSorters, isActiveTicket
} from './maintenance/ticketUtils';

const BUILDING_ORDER = ['B3', 'B4', 'B5', 'Admin', 'Other'];
const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const TABS = [
  { key: 'my', label: 'My Jobs' },
  { key: 'pool', label: 'Open Pool' },
  { key: 'all', label: 'All Active' },
];

// ============================================================================
// STATUS BADGE (HR-Style with Icons)
// ============================================================================
const StatusBadge = ({ status }) => {
  const config = {
    open: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: AlertCircle, label: 'Open' },
    in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock, label: 'In Progress' },
    resolved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle, label: 'Resolved' },
    duplicate: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', icon: Copy, label: 'Duplicate' },
    cancelled: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', icon: Ban, label: 'Cancelled' }
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
// AGING CHIP (time-open, color-coded from getTimeOpen)
// ============================================================================
const AgingChip = ({ createdAt }) => {
  const age = getTimeOpen(createdAt);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${age.color}`}>
      <Clock size={10} /> {age.text}
    </span>
  );
};

// ============================================================================
// QUICK STATS CARD (clickable)
// ============================================================================
const StatCard = ({ icon: Icon, label, count, colorClass, borderColor, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${colorClass} rounded-xl p-4 border ${borderColor} transition-transform hover:scale-105 text-left cursor-pointer`}
  >
    <div className="flex items-center justify-between">
      <Icon size={20} className="opacity-70" />
      <span className="text-2xl font-bold">{count}</span>
    </div>
    <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
  </button>
);

// --- Helpers ---

const fmtDateTime = (d) => (d instanceof Date ? d.toLocaleString() : 'N/A');
const fmtDate = (d) => (d instanceof Date ? d.toLocaleDateString() : 'N/A');

// The data hook converts top-level Timestamps to Dates, but NOT Timestamps
// nested inside arrays — so a notesThread entry's `at` may still be a raw
// Firestore Timestamp. This helper is the single allowed exception to the
// no-toDate rule; keep all such conversion inside it.
const noteDate = (value) => {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return null;
};

const descriptionPreview = (text) => {
  if (!text) return '';
  return text.length > 90 ? text.slice(0, 90).trimEnd() + '...' : text;
};

// --- Modals ---

function TicketDetailModal({ isOpen, onClose, ticket, getDisplayName, actor, onCancelTicket, onAddNote }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  if (!isOpen || !ticket) return null;

  const canAddNote = can(actor, 'ticket.update.status');
  const canCancel = can(actor, 'ticket.cancel') && isActiveTicket(ticket);

  // Legacy adminNotes renders first; threaded notes follow, oldest first.
  const noteEntries = [
    ...(ticket.adminNotes
      ? [{ byName: ticket.lastNoteBy || 'Admin', text: ticket.adminNotes, at: noteDate(ticket.lastNoteAt), legacy: true }]
      : []),
    ...(ticket.notesThread ?? [])
      .map(n => ({ ...n, at: noteDate(n.at) }))
      .sort((a, b) => (a.at ? a.at.getTime() : 0) - (b.at ? b.at.getTime() : 0)),
  ];

  const handleAddNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      await onAddNote(ticket, text);
      setNoteText('');
    } catch (e) {
      console.error(e);
      alert('Error adding note');
    } finally {
      setSavingNote(false);
    }
  };

  const reporter = ticket.reporterName || (ticket.submittedBy ? getDisplayName(ticket.submittedBy) : 'Anonymous');
  const timeline = [
    ticket.createdAt instanceof Date && {
      icon: AlertCircle, color: 'text-red-500 bg-red-50 border-red-100',
      label: 'Reported', detail: `by ${reporter}`, at: ticket.createdAt,
    },
    ticket.startedAt instanceof Date && {
      icon: Play, color: 'text-amber-600 bg-amber-50 border-amber-100',
      label: 'Started', detail: (ticket.assignedToName || ticket.startedByName) ? `with ${ticket.assignedToName || ticket.startedByName}` : '', at: ticket.startedAt,
    },
    ticket.resolvedAt instanceof Date && {
      icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
      label: 'Resolved', detail: ticket.resolvedBy ? `by ${ticket.resolvedBy}` : '', at: ticket.resolvedAt,
    },
  ].filter(Boolean);

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
                 {reporter}
               </div>
             </div>
             <div className="col-span-2">
               <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Created</p>
               <div className="flex items-center gap-2 text-slate-700 font-medium">
                 <Calendar size={14} className="text-indigo-500" /> {fmtDateTime(ticket.createdAt)}
               </div>
             </div>
           </div>

           <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
             <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Description</p>
             <p className="text-slate-700 text-sm whitespace-pre-wrap">{ticket.description}</p>
           </div>

           {timeline.length > 0 && (
             <div>
               <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Timeline</p>
               <div className="space-y-2">
                 {timeline.map((stage, i) => {
                   const Icon = stage.icon;
                   return (
                     <div key={i} className="flex items-center gap-3">
                       <span className={`p-1.5 rounded-full border ${stage.color}`}>
                         <Icon size={12} />
                       </span>
                       <div className="flex-1 min-w-0">
                         <p className="text-sm font-medium text-slate-700">
                           {stage.label}
                           {stage.detail && <span className="text-slate-500 font-normal"> {stage.detail}</span>}
                         </p>
                       </div>
                       <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(stage.at)}</span>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}

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

           {ticket.completionImageUrls?.length > 0 && (
             <div>
               <p className="text-xs text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1">
                 <CheckCircle size={12} /> Completion Photos
               </p>
               <div className="grid grid-cols-3 gap-2">
                 {ticket.completionImageUrls.map((url, i) => (
                   <img
                     key={i} src={url} alt="Completion proof"
                     className="h-16 w-full object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80"
                     onClick={() => setSelectedImage(url)}
                   />
                 ))}
               </div>
             </div>
           )}

           {ticket.completionNotes && (
             <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
               <p className="text-xs text-emerald-600 uppercase font-semibold mb-1">Completion Notes</p>
               <p className="text-slate-700 text-sm whitespace-pre-wrap">{ticket.completionNotes}</p>
             </div>
           )}

           {ticket.status === 'cancelled' && (
             <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
               <p className="text-xs text-slate-500 uppercase font-semibold mb-1 flex items-center gap-1">
                 <Ban size={12} /> Cancelled{ticket.cancelledByName ? ` by ${ticket.cancelledByName}` : ''}
               </p>
               {ticket.cancelReason && (
                 <p className="text-slate-600 text-sm whitespace-pre-wrap">{ticket.cancelReason}</p>
               )}
             </div>
           )}

           {(noteEntries.length > 0 || canAddNote) && (
             <div>
               <p className="text-xs text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1">
                 <MessageSquare size={12} /> Notes
               </p>
               {noteEntries.length > 0 && (
                 <div className="space-y-2">
                   {noteEntries.map((note, i) => (
                     <div key={i} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                       <div className="flex items-center justify-between gap-2">
                         <p className="text-xs font-semibold text-slate-600">
                           {note.byName || 'Unknown'}
                           {note.legacy && (
                             <span className="ml-1.5 bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">note</span>
                           )}
                         </p>
                         {note.at && (
                           <span className="text-[10px] text-slate-400 whitespace-nowrap">{note.at.toLocaleString()}</span>
                         )}
                       </div>
                       <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">{note.text}</p>
                     </div>
                   ))}
                 </div>
               )}
               {canAddNote && (
                 <div className="flex gap-2 mt-2">
                   <input
                     type="text"
                     value={noteText}
                     onChange={(e) => setNoteText(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                     placeholder="Add a note for the team..."
                     className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none"
                   />
                   <button
                     onClick={handleAddNote}
                     disabled={!noteText.trim() || savingNote}
                     className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {savingNote ? 'Adding...' : 'Add'}
                   </button>
                 </div>
               )}
             </div>
           )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
          {canCancel && (
            <button
              onClick={() => onCancelTicket(ticket)}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 flex items-center justify-center gap-1.5"
            >
              <Ban size={14} /> Cancel ticket
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800">
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

function CompletionModal({ isOpen, onClose, ticket, onComplete, technicianName }) {
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
      await onComplete(ticket.id, completionNotes.trim(), imageUrls);
      setCompletionNotes('');
      setCompletionFiles([]);
      onClose();
    } catch (e) { alert("Failed to complete."); } finally { setSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Complete Task</h3>
        <p className="text-sm text-slate-500 mb-4 flex items-center gap-1.5">
          <User size={14} className="text-indigo-500" /> Completing as <span className="font-semibold text-slate-700">{technicianName}</span>
        </p>
        <div className="space-y-4">
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
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting || uploading}
              className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || uploading}
              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
    </div>
  );
}

// ============================================================================
// TICKET ROW (primary card + optional expandable duplicate sub-list)
// ============================================================================

function TicketRow({ entry, expanded, onToggleExpand, onOpenDetail, onStart, onQuickFix, onMarkDone, onMarkDuplicate }) {
  const ticket = entry.primary;
  const duplicates = entry.duplicates;
  const reportCount = duplicates.length + 1;
  const workingWith = ticket.assignedToName || ticket.startedByName;

  return (
    <div>
      <div className="p-4 hover:bg-slate-50 transition-all duration-200 group cursor-pointer border-l-4 border-transparent hover:border-indigo-500">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex-1 min-w-0 w-full" onClick={() => onOpenDetail(ticket)}>
            {/* Line 1: category + photo chip + duplicate-count chip */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
                {ticket.category}
              </span>
              {ticket.imageUrls?.length > 0 && (
                <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-500 flex items-center gap-1">
                  <Camera size={10} /> {ticket.imageUrls.length}
                </span>
              )}
              {duplicates.length > 0 && (
                <button
                  type="button"
                  title={`${reportCount} reports of this issue`}
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(ticket.id); }}
                  className="bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-amber-200 transition-colors"
                >
                  <Copy size={10} /> x{reportCount}
                  {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              )}
            </div>

            {/* Line 2: description preview */}
            {ticket.description && (
              <p className="text-xs text-slate-500 truncate mb-1.5">
                {descriptionPreview(ticket.description)}
              </p>
            )}

            {/* Line 3: location + building + reporter + aging + priority */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-slate-400" /> {ticket.location}
              </span>
              <span className="bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                {buildingOf(ticket.location || '')}
              </span>
              <span className="flex items-center gap-1">
                <User size={12} className="text-slate-400" /> by {ticket.reporterName || 'Anonymous'}
              </span>
              <AgingChip createdAt={ticket.createdAt} />
              <PriorityBadge priority={ticket.priority} />
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={ticket.status} />
              {ticket.status === 'in_progress' && workingWith && (
                <span className="text-[10px] text-slate-500">
                  with {workingWith}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {ticket.status === 'open' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onStart(ticket.id); }}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-1 transition-colors"
                  >
                    <Play size={12} /> Start
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuickFix(ticket); }}
                    className="px-3 py-1.5 border border-emerald-500 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-50 flex items-center gap-1 transition-colors"
                  >
                    <Zap size={12} /> Quick Fix
                  </button>
                </>
              )}
              {ticket.status === 'in_progress' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkDone(ticket); }}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 flex items-center gap-1 transition-colors"
                >
                  <CheckCircle size={12} /> Mark Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded duplicate sub-list */}
      {expanded && duplicates.length > 0 && (
        <div className="bg-amber-50/40 border-t border-amber-100">
          {duplicates.map(dup => (
            <div
              key={dup.id}
              className="pl-8 md:pl-12 pr-4 py-3 border-b border-amber-100 last:border-b-0 flex flex-col sm:flex-row sm:items-center gap-2 justify-between cursor-pointer hover:bg-amber-50"
              onClick={() => onOpenDetail(dup)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-600 truncate">
                  {descriptionPreview(dup.description) || dup.category}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <User size={10} className="text-slate-400" /> by {dup.reporterName || 'Anonymous'}
                  </span>
                  <AgingChip createdAt={dup.createdAt} />
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onMarkDuplicate(dup, ticket); }}
                className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 flex items-center gap-1 transition-colors w-fit"
              >
                <Copy size={12} /> Mark duplicate
              </button>
            </div>
          ))}
        </div>
      )}
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

  // Tabs / Search / Filter / Sort States
  const [tabChoice, setTabChoice] = useState(null); // null = auto default
  const [statusView, setStatusView] = useState('all'); // 'all' | 'in_progress' (All Active tab only)
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('urgent');
  const [groupByBuilding, setGroupByBuilding] = useState(false);
  const [showResolvedHistory, setShowResolvedHistory] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  // Technician display name (used for claim + completion writes)
  const techDisplayName = userData?.displayName || userData?.firstName || userData?.email?.split('@')[0] || 'Technician';

  const actor = actorFrom(userData);
  const showInsights = can(actor, 'ticket.update.status');
  const tabs = useMemo(
    () => (showInsights ? [...TABS, { key: 'insights', label: 'Insights' }] : TABS),
    [showInsights]
  );

  // Active = still needs work. Excludes 'resolved', 'duplicate' AND 'cancelled'.
  const activeTickets = useMemo(
    () => tickets.filter(isActiveTicket),
    [tickets]
  );

  const myJobs = useMemo(
    () => activeTickets.filter(t =>
      t.status === 'in_progress' &&
      (t.assignedToUid === user?.uid || (userData?.email && t.assignedTo === userData.email))
    ),
    [activeTickets, user?.uid, userData?.email]
  );

  const poolTickets = useMemo(
    () => activeTickets.filter(t => t.status === 'open'),
    [activeTickets]
  );

  // Default tab: My Jobs if it has items, else Open Pool.
  const activeTab = tabChoice ?? (myJobs.length > 0 ? 'my' : 'pool');

  const selectTab = (key) => {
    setTabChoice(key);
    setStatusView('all');
  };

  // Calculate Stats (duplicates and cancelled excluded everywhere)
  const stats = useMemo(() => ({
    open: poolTickets.length,
    inProgress: activeTickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    critical: activeTickets.filter(t => t.priority === 'critical').length,
  }), [tickets, activeTickets, poolTickets]);

  const tabCounts = { my: myJobs.length, pool: poolTickets.length, all: activeTickets.length };

  // Filter + sort pipeline for the current tab
  const visibleTickets = useMemo(() => {
    let result = activeTab === 'my' ? myJobs : activeTab === 'pool' ? poolTickets : activeTickets;

    if (activeTab === 'all' && statusView === 'in_progress') {
      result = result.filter(t => t.status === 'in_progress');
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.category?.toLowerCase().includes(query) ||
        t.location?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.reporterName?.toLowerCase().includes(query)
      );
    }

    if (priorityFilter !== 'all') {
      result = result.filter(t => t.priority === priorityFilter);
    }

    return [...result].sort(ticketSorters[sortBy] || ticketSorters.urgent);
  }, [activeTab, myJobs, poolTickets, activeTickets, statusView, searchQuery, priorityFilter, sortBy]);

  // Duplicate grouping (Open Pool + All Active only)
  const groupedTickets = useMemo(() => {
    if (activeTab === 'my') return visibleTickets.map(t => ({ primary: t, duplicates: [] }));
    return groupDuplicateTickets(visibleTickets);
  }, [visibleTickets, activeTab]);

  // Walk-order sections (already sorted upstream, so each section keeps the sorter order)
  const buildingSections = useMemo(() => {
    if (!groupByBuilding) return null;
    const byBuilding = new Map();
    for (const entry of groupedTickets) {
      const key = buildingOf(entry.primary.location || '');
      if (!byBuilding.has(key)) byBuilding.set(key, []);
      byBuilding.get(key).push(entry);
    }
    return BUILDING_ORDER
      .filter(key => byBuilding.has(key))
      .map(key => ({ key, label: BUILDING_LABELS[key], entries: byBuilding.get(key) }));
  }, [groupedTickets, groupByBuilding]);

  // Resolved tickets for history (resolvedAt is a JS Date)
  const resolvedTickets = useMemo(() => {
    return tickets
      .filter(t => t.status === 'resolved')
      .sort((a, b) => {
        const at = a.resolvedAt instanceof Date ? a.resolvedAt.getTime() : 0;
        const bt = b.resolvedAt instanceof Date ? b.resolvedAt.getTime() : 0;
        return bt - at;
      })
      .slice(0, 10);
  }, [tickets]);

  // Scheduled tasks via the shared hook (no component-local onSnapshot)
  const { data: scheduledTasksRaw } = useScheduledTasks();
  const scheduledTasks = useMemo(() => {
    return (scheduledTasksRaw ?? [])
      .filter(t => t.isActive !== false)
      .map(task => ({ task, due: computeScheduleDue(task) }))
      .sort((a, b) =>
        (a.due ? a.due.getTime() : Number.POSITIVE_INFINITY) -
        (b.due ? b.due.getTime() : Number.POSITIVE_INFINITY)
      );
  }, [scheduledTasksRaw]);

  const getDisplayName = (email) => {
    if (!email) return 'Unknown';
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const toggleGroupExpand = (primaryId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(primaryId)) next.delete(primaryId);
      else next.add(primaryId);
      return next;
    });
  };

  const openDetail = (ticket) => {
    setDetailTicket(ticket);
    setShowDetailModal(true);
  };

  const startJob = async (ticketId) => {
    try {
      await updateDoc(doc(db, 'maintenance_tickets', ticketId), {
        status: 'in_progress',
        startedAt: serverTimestamp(),
        assignedToUid: user.uid,
        assignedToName: techDisplayName,
        assignedTo: userData?.email || user?.uid, // legacy compat
        startedByName: techDisplayName, // legacy compat
        ...auditUpdate(user.uid),
      });
    } catch (e) {
      console.error(e);
      alert("Error starting job");
    }
  };

  const completeTask = async (id, notes, imageUrls) => {
    try {
      const updateData = {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: techDisplayName,
        resolvedByUid: user.uid,
        completedBy: user.uid,
        completionNotes: notes,
        ...auditUpdate(user.uid),
      };
      if (selectedTicket?.status === 'open') {
         // Quick Fix from open: stamp claim fields too
         updateData.startedAt = serverTimestamp();
         updateData.assignedToUid = user.uid;
         updateData.assignedToName = techDisplayName;
         updateData.assignedTo = userData?.email || user?.uid; // legacy compat
         updateData.startedByName = techDisplayName; // legacy compat
         updateData.quickFixed = true;
      }
      if (imageUrls?.length) updateData.completionImageUrls = imageUrls;
      await updateDoc(doc(db, 'maintenance_tickets', id), updateData);
    } catch (e) {
      console.error("Error completing:", e);
      throw e;
    }
  };

  const markDuplicate = async (dup, primary) => {
    if (!window.confirm(`Mark this report by ${dup.reporterName || 'Anonymous'} as a duplicate? It will be hidden from the active queue.`)) return;
    try {
      await updateDoc(doc(db, 'maintenance_tickets', dup.id), {
        status: 'duplicate',
        duplicateOf: primary.id,
        ...auditUpdate(user.uid),
      });
    } catch (e) {
      console.error(e);
      alert("Error marking duplicate");
    }
  };

  const reopenTicket = async (ticket) => {
    if (!window.confirm('Reopen this ticket? It will return to the Open Pool.')) return;
    try {
      await updateDoc(doc(db, 'maintenance_tickets', ticket.id), {
        status: 'open',
        reopenedAt: serverTimestamp(),
        reopenCount: (ticket.reopenCount || 0) + 1,
        ...auditUpdate(user.uid),
      });
    } catch (e) {
      console.error(e);
      alert("Error reopening ticket");
    }
  };

  const cancelTicket = async (ticket) => {
    const reason = window.prompt('Cancel this ticket? Enter a reason (required):');
    if (reason === null) return;
    const cancelReason = reason.trim();
    if (!cancelReason) {
      alert('A reason is required to cancel a ticket.');
      return;
    }
    try {
      await updateDoc(doc(db, 'maintenance_tickets', ticket.id), {
        status: 'cancelled',
        cancelReason,
        cancelledAt: serverTimestamp(),
        cancelledByUid: user.uid,
        cancelledByName: techDisplayName,
        ...auditUpdate(user.uid),
      });
      setShowDetailModal(false);
    } catch (e) {
      console.error(e);
      alert("Error cancelling ticket");
    }
  };

  // serverTimestamp() is not allowed inside arrayUnion — Timestamp.now()
  // (client clock) is the documented alternative for array entries.
  const addTicketNote = async (ticket, text) => {
    await updateDoc(doc(db, 'maintenance_tickets', ticket.id), {
      notesThread: arrayUnion({
        byUid: user.uid,
        byName: techDisplayName,
        text,
        at: Timestamp.now(),
      }),
      ...auditUpdate(user.uid),
    });
  };

  const hasActiveFilters = Boolean(searchQuery) || priorityFilter !== 'all' || statusView !== 'all';
  const tabLabel = tabs.find(t => t.key === activeTab)?.label || 'Active Tickets';

  // The detail modal holds a snapshot from click time; resolve it back to the
  // live subscribed ticket so note adds / cancels show up without reopening.
  const detailTicketLive = useMemo(
    () => (detailTicket ? tickets.find(t => t.id === detailTicket.id) ?? detailTicket : null),
    [tickets, detailTicket]
  );

  const renderEmptyState = () => (
    <div className="text-center py-12">
      <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
      <p className="text-slate-800 font-medium">
        {activeTab === 'my' ? 'No Jobs In Progress' : activeTab === 'pool' ? 'Open Pool Is Empty' : 'All Caught Up!'}
      </p>
      <p className="text-slate-500 text-sm">
        {activeTab === 'my'
          ? 'Claim a ticket from the Open Pool to get started.'
          : 'No pending tickets match your filters.'}
      </p>
    </div>
  );

  const renderEntries = (entries) => entries.map(entry => (
    <TicketRow
      key={entry.primary.id}
      entry={entry}
      expanded={expandedGroups.has(entry.primary.id)}
      onToggleExpand={toggleGroupExpand}
      onOpenDetail={openDetail}
      onStart={startJob}
      onQuickFix={(t) => { setSelectedTicket(t); setShowCompletionModal(true); }}
      onMarkDone={(t) => { setSelectedTicket(t); setShowCompletionModal(true); }}
      onMarkDuplicate={markDuplicate}
    />
  ));

  return (
    <div className="space-y-6">

      {/* Quick Stats Cards (clickable) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={AlertCircle}
          label="Open"
          count={stats.open}
          colorClass="bg-red-50 text-red-700"
          borderColor="border-red-200"
          onClick={() => selectTab('pool')}
        />
        <StatCard
          icon={Clock}
          label="In Progress"
          count={stats.inProgress}
          colorClass="bg-amber-50 text-amber-700"
          borderColor="border-amber-200"
          onClick={() => { setTabChoice('all'); setStatusView('in_progress'); }}
        />
        <StatCard
          icon={CheckCircle}
          label="Resolved"
          count={stats.resolved}
          colorClass="bg-emerald-50 text-emerald-700"
          borderColor="border-emerald-200"
          onClick={() => setShowResolvedHistory(true)}
        />
        <StatCard
          icon={AlertTriangle}
          label="Critical"
          count={stats.critical}
          colorClass="bg-red-600 text-white"
          borderColor="border-red-700"
          onClick={() => { setTabChoice('all'); setStatusView('all'); setPriorityFilter('critical'); }}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex gap-1">
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectTab(tab.key)}
              className={`flex-1 px-2 md:px-4 py-2 rounded-xl text-xs md:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              {tabCounts[tab.key] != null && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'insights' ? (
        <SupervisorDashboard tickets={tickets} />
      ) : (
      <>
      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search category, location, description, or reporter..."
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
            <option value="urgent">Urgent First</option>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>

          {/* Walk-order toggle */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setGroupByBuilding(false)}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                !groupByBuilding ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List size={14} /> List
            </button>
            <button
              type="button"
              onClick={() => setGroupByBuilding(true)}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                groupByBuilding ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Building2 size={14} /> Walk order
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-700">{visibleTickets.length}</span> tickets in {tabLabel}
            {statusView === 'in_progress' && activeTab === 'all' && (
              <span className="ml-2 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-semibold">
                In progress only
              </span>
            )}
            {hasActiveFilters && (
              <button
                onClick={() => { setSearchQuery(''); setPriorityFilter('all'); setStatusView('all'); }}
                className="ml-2 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Ticket Queue */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">{tabLabel}</h2>
          </div>
          <span className="text-sm text-slate-500">{visibleTickets.length} tasks</span>
        </div>

        {groupedTickets.length === 0 ? (
          renderEmptyState()
        ) : groupByBuilding && buildingSections ? (
          <div>
            {buildingSections.map(section => (
              <div key={section.key}>
                <div className="px-4 py-2 bg-slate-100/70 border-y border-slate-200 first:border-t-0 flex items-center gap-2">
                  <Building2 size={14} className="text-slate-500" />
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{section.label}</span>
                  <span className="text-[10px] font-bold text-slate-400">{section.entries.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {renderEntries(section.entries)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {renderEntries(groupedTickets)}
          </div>
        )}
      </div>
      </>
      )}

      {/* Scheduled Tasks Card */}
      {scheduledTasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" /> Upcoming Schedules
          </h3>
          <div className="grid gap-3">
            {scheduledTasks.slice(0, 3).map(({ task, due }) => {
              const dueNow = due instanceof Date && due.getTime() <= Date.now();
              return (
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
                    <p className={`text-xs font-bold uppercase ${dueNow ? 'text-red-600' : 'text-indigo-600'}`}>
                      {dueNow ? 'Due Now' : 'Next Due'}
                    </p>
                    <p className={`text-sm font-medium ${dueNow ? 'text-red-600' : 'text-slate-800'}`}>
                      {due instanceof Date ? due.toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              );
            })}
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
                {stats.resolved}
              </span>
            </div>
            {showResolvedHistory ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
          </button>

          {showResolvedHistory && (
            <div className="divide-y divide-slate-100">
              {resolvedTickets.map(ticket => {
                const canReopen = ticket.resolvedAt instanceof Date &&
                  (Date.now() - ticket.resolvedAt.getTime()) < REOPEN_WINDOW_MS;
                return (
                  <div
                    key={ticket.id}
                    className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => openDetail(ticket)}
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
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Resolved</p>
                          <p className="text-sm font-medium text-slate-600">
                            {fmtDate(ticket.resolvedAt)}
                          </p>
                        </div>
                        {canReopen && (
                          <button
                            onClick={(e) => { e.stopPropagation(); reopenTicket(ticket); }}
                            className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 flex items-center gap-1 transition-colors"
                          >
                            <RotateCcw size={12} /> Reopen
                          </button>
                        )}
                      </div>
                    </div>
                    {ticket.completionNotes && (
                      <p className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        "{ticket.completionNotes}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CompletionModal
        isOpen={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
        ticket={selectedTicket}
        onComplete={completeTask}
        technicianName={techDisplayName}
      />
      <TicketDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        ticket={detailTicketLive}
        getDisplayName={getDisplayName}
        actor={actor}
        onCancelTicket={cancelTicket}
        onAddNote={addTicketNote}
      />

    </div>
  );
}
