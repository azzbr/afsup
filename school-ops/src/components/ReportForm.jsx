import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle,
  Camera,
  FileText,
  MapPin,
  Tag,
  Loader2,
  Plus,
  Search,
  ChevronDown
} from 'lucide-react';
import { compressImage, uploadImage } from '../storage';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { signInAsAnonymous, onAuthStateChange } from '../auth';
import { CATEGORY_GROUPS, IMPACT_LEVELS, LOCATIONS } from '../constants';
import {
  groupForCategory,
  categoryGroupLabel,
  buildingOf,
  BUILDING_LABELS,
  shortRef
} from '../maintenance/ticketUtils';
import { auditCreate, auditUpdate } from '../data/audit';

// ============================================================================
// IMPACT CHIP COMPONENT (replaces raw priority chips)
// ============================================================================

const IMPACT_STYLES = {
  safety: 'bg-red-50 border-red-400 text-red-700',
  blocking: 'bg-orange-50 border-orange-300 text-orange-700',
  annoying: 'bg-blue-50 border-blue-300 text-blue-700',
  cosmetic: 'bg-slate-100 border-slate-300 text-slate-700'
};

const ImpactChip = ({ label, hint, isSelected, onClick, colorClass }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-left transition-all duration-200 border-2
        ${isSelected
          ? `${colorClass} shadow-sm`
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }`}
    >
      <span className={`block text-xs font-bold uppercase tracking-wide ${isSelected ? '' : 'text-slate-600'}`}>
        {label}
      </span>
      <span className={`block text-[11px] mt-0.5 ${isSelected ? 'opacity-80' : 'text-slate-400'}`}>
        {hint}
      </span>
    </button>
  );
};

// Optgroup order for the location select.
const BUILDING_ORDER = ['B3', 'B4', 'B5', 'Admin', 'Other'];

// ============================================================================
// MAIN REPORT FORM COMPONENT
// ============================================================================

function ReportForm({ user, onSuccess }) {
  const [localUser, setLocalUser] = useState(user);

  // Issue picker state
  const [category, setCategory] = useState(null);
  const [categoryGroup, setCategoryGroup] = useState(null);
  const [isCustomIssue, setIsCustomIssue] = useState(false);
  const [issueQuery, setIssueQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseGroup, setBrowseGroup] = useState(null);
  const pickerRef = useRef(null);

  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [submitted, setSubmitted] = useState(null);

  // Listen for auth changes in this component
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (u) => {
      setLocalUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Update local user when prop changes
  useEffect(() => {
    setLocalUser(user);
  }, [user]);

  // Close the suggestion panel when clicking outside it
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ==========================================================================
  // ISSUE PICKER
  // ==========================================================================

  const suggestionGroups = useMemo(() => {
    const text = issueQuery.trim().toLowerCase();
    if (!text) return [];
    return CATEGORY_GROUPS
      .map((group) => ({
        key: group.key,
        label: group.label,
        items: group.items.filter((item) => item.toLowerCase().includes(text))
      }))
      .filter((group) => group.items.length > 0);
  }, [issueQuery]);

  const showCustomOption = useMemo(() => {
    const text = issueQuery.trim();
    if (text.length < 4) return false;
    const lower = text.toLowerCase();
    return !CATEGORY_GROUPS.some((group) =>
      group.items.some((item) => item.toLowerCase() === lower)
    );
  }, [issueQuery]);

  const selectIssue = (item) => {
    setCategory(item);
    setCategoryGroup(groupForCategory(item));
    setIsCustomIssue(false);
    setIssueQuery('');
    setPickerOpen(false);
    setBrowseOpen(false);
    setBrowseGroup(null);
  };

  const selectCustomIssue = () => {
    const text = issueQuery.trim();
    if (!text) return;
    setCategory(text);
    setCategoryGroup('other');
    setIsCustomIssue(true);
    setIssueQuery('');
    setPickerOpen(false);
    setBrowseOpen(false);
    setBrowseGroup(null);
  };

  const clearIssue = () => {
    setCategory(null);
    setCategoryGroup(null);
    setIsCustomIssue(false);
  };

  // ==========================================================================
  // LOCATION GROUPS (optgroup per building)
  // ==========================================================================

  const locationGroups = useMemo(() => {
    return BUILDING_ORDER
      .map((key) => ({
        key,
        label: BUILDING_LABELS[key],
        locations: LOCATIONS.filter((l) => buildingOf(l) === key)
      }))
      .filter((group) => group.locations.length > 0);
  }, []);

  // ==========================================================================
  // DUPLICATE GUARD — non-blocking heads-up when an active ticket already
  // exists for the same issue + location. Skips silently on any error.
  // ==========================================================================

  useEffect(() => {
    let cancelled = false;
    if (!category || !location) {
      setDuplicateCount(0);
      return undefined;
    }
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'maintenance_tickets'),
          where('category', '==', category),
          where('location', '==', location)
        ));
        if (cancelled) return;
        const active = snap.docs.filter((d) => {
          const status = d.data().status;
          return status === 'open' || status === 'in_progress';
        });
        setDuplicateCount(active.length);
      } catch {
        if (!cancelled) setDuplicateCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, location]);

  // ==========================================================================
  // PHOTOS
  // ==========================================================================

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files);
    await processFiles(files);
    e.target.value = null;
  };

  const processFiles = async (files) => {
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
  };

  const removeImage = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ==========================================================================
  // SUBMIT
  // ==========================================================================

  const resetForm = () => {
    setCategory(null);
    setCategoryGroup(null);
    setIsCustomIssue(false);
    setIssueQuery('');
    setPickerOpen(false);
    setBrowseOpen(false);
    setBrowseGroup(null);
    setLocation('');
    setDescription('');
    setImpact(null);
    setSelectedFiles([]);
    setDuplicateCount(0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!category) {
      setError("Please choose an issue from the list or describe your own.");
      return;
    }
    if (!location) {
      setError("Please select a location.");
      return;
    }
    if (!impact) {
      setError("Please select how this issue affects you.");
      return;
    }
    if (!description.trim() && selectedFiles.length === 0) {
      setError("Please describe the issue, or attach a photo instead.");
      return;
    }

    setSubmitting(true);

    try {
      // Capture the signed-in user in a local const. NEVER rely on the
      // localUser state variable updating within this same handler run —
      // setState is async, so it would still be null (stale closure).
      let activeUser = localUser;
      if (!activeUser) {
        const result = await signInAsAnonymous();
        if (!result.success || !result.user) {
          throw new Error(result.error || 'Anonymous sign-in failed');
        }
        activeUser = result.user;
      }
      const actorUid = activeUser?.uid || 'anonymous';
      const impactLevel = IMPACT_LEVELS.find((lvl) => lvl.key === impact);

      const ticketData = {
        category,
        categoryGroup: categoryGroup || groupForCategory(category),
        location,
        description: description.trim(),
        impact,
        priority: impactLevel ? impactLevel.priority : 'medium',
        status: 'open',
        reportedBy: activeUser?.uid,
        reporterName: activeUser?.displayName || activeUser?.email || (activeUser?.isAnonymous ? "Anonymous User" : "Staff Member"),
        submittedBy: (!activeUser?.isAnonymous && activeUser?.email) ? activeUser.email : null,
        warnings: 0,
        notes: [],
        ...(isCustomIssue ? { customCategory: true } : {}),
        ...auditCreate(actorUid)
      };

      const docRef = await addDoc(collection(db, 'maintenance_tickets'), ticketData);

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
              imageUrls: imageUrls,
              ...auditUpdate(actorUid)
            });
          }
        } catch (error) {
          console.error("Multiple image upload error:", error);
        }
        setUploadingImages(false);
      }

      setSubmitted({ id: docRef.id, category, location });
      resetForm();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Error submitting:", err);
      setError("Failed to submit ticket: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToMyReports = () => {
    const el = document.getElementById('my-reports');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // ==========================================================================
  // SUCCESS STATE
  // ==========================================================================

  if (submitted) {
    return (
      <div className="space-y-5">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-800">
                Report {shortRef(submitted.id)} submitted
              </p>
              <p className="text-sm text-emerald-700 mt-1.5 flex items-center gap-1.5">
                <Tag size={13} className="shrink-0" />
                {submitted.category}
              </p>
              <p className="text-sm text-emerald-700 mt-0.5 flex items-center gap-1.5">
                <MapPin size={13} className="shrink-0" />
                {submitted.location}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setSubmitted(null)}
            className="flex-1 px-6 py-3 bg-slate-900 text-white font-semibold rounded-xl text-sm
              hover:bg-slate-800 hover:shadow-md active:scale-[0.99] transition-all duration-200 shadow-sm
              flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Submit another report
          </button>
          {localUser && !localUser.isAnonymous && (
            <button
              type="button"
              onClick={scrollToMyReports}
              className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm
                hover:bg-slate-50 hover:border-slate-300 transition-all duration-200
                flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              View my reports
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // FORM
  // ==========================================================================

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Error</p>
            <p className="text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Issue Picker */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          <span className="flex items-center gap-1.5">
            <Tag size={12} className="text-indigo-500" />
            Issue
            <span className="text-red-500">*</span>
          </span>
        </label>

        {category ? (
          <div className="flex items-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 pl-3 pr-1.5 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
              <Tag size={14} className="text-indigo-500 shrink-0" />
              <span className="font-medium">{category}</span>
              <button
                type="button"
                onClick={clearIssue}
                aria-label="Clear selected issue"
                className="w-5 h-5 rounded-full hover:bg-indigo-100 flex items-center justify-center
                  text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </span>
            <span className="text-xs text-slate-400">{categoryGroupLabel(categoryGroup)}</span>
          </div>
        ) : (
          <div ref={pickerRef} className="relative">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={issueQuery}
                onChange={(e) => {
                  setIssueQuery(e.target.value);
                  setPickerOpen(e.target.value.trim().length > 0);
                }}
                onFocus={() => {
                  if (issueQuery.trim().length > 0) setPickerOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPickerOpen(false);
                }}
                placeholder="What's the issue? Type to search or describe it..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800
                  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                  focus:bg-white transition-all"
              />
            </div>

            {pickerOpen && issueQuery.trim().length > 0 && (
              <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {suggestionGroups.map((group) => (
                  <div key={group.key}>
                    <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => selectIssue(item)}
                        className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ))}

                {suggestionGroups.length === 0 && !showCustomOption && (
                  <p className="px-3.5 py-3 text-sm text-slate-400">
                    No matching categories — keep typing to use your own description.
                  </p>
                )}

                {showCustomOption && (
                  <button
                    type="button"
                    onClick={selectCustomIssue}
                    className="w-full text-left px-3.5 py-2.5 text-sm text-indigo-600 font-medium hover:bg-indigo-50
                      border-t border-slate-100 flex items-center gap-2 transition-colors"
                  >
                    <Plus size={14} className="shrink-0" />
                    <span>Use "{issueQuery.trim()}" as the issue</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Browse categories */}
        {!category && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => {
                setBrowseOpen((open) => !open);
                setBrowseGroup(null);
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
            >
              <ChevronDown size={13} className={`transition-transform ${browseOpen ? 'rotate-180' : ''}`} />
              Browse categories
            </button>

            {browseOpen && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORY_GROUPS.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setBrowseGroup((k) => (k === group.key ? null : group.key))}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border text-left transition-all
                        ${browseGroup === group.key
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                {browseGroup && (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
                    {(CATEGORY_GROUPS.find((g) => g.key === browseGroup)?.items || []).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => selectIssue(item)}
                        className="px-3 py-1.5 rounded-full text-xs bg-white border border-slate-200 text-slate-700
                          hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Row: Location & Photos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Location */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} className="text-indigo-500" />
              Location
              <span className="text-red-500">*</span>
            </span>
          </label>
          <select
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white
              transition-all cursor-pointer"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="" disabled>Select location...</option>
            {locationGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.locations.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Compact Photo Upload */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <Camera size={12} className="text-indigo-500" />
              Photos
              <span className="font-normal text-slate-400">(Optional)</span>
            </span>
          </label>

          <div className="flex items-center gap-3">
            {/* Upload Button */}
            <label className="relative cursor-pointer">
              <div className={`w-12 h-12 rounded-xl border-2 border-dashed flex items-center justify-center transition-all
                ${selectedFiles.length >= 5
                  ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
                  : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'
                }`}>
                <Plus size={20} className={selectedFiles.length >= 5 ? 'text-slate-300' : 'text-slate-400'} />
              </div>
              <input
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageSelect}
                disabled={selectedFiles.length >= 5}
              />
            </label>

            {/* Image Previews (inline) */}
            {selectedFiles.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative shrink-0 group">
                    <img
                      src={file}
                      alt={`Preview ${index + 1}`}
                      className="w-12 h-12 object-cover rounded-xl border-2 border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white
                        rounded-full flex items-center justify-center shadow-md transition-colors"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <span className="text-xs text-slate-400 shrink-0">{selectedFiles.length}/5</span>
              </div>
            ) : (
              <span className="text-xs text-slate-400">Add up to 5 photos</span>
            )}
          </div>
        </div>
      </div>

      {/* Duplicate Guard Banner (non-blocking) */}
      {duplicateCount > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          <p className="text-sm">
            {duplicateCount === 1
              ? '1 open report already exists'
              : `${duplicateCount} open reports already exist`} for this issue at this location —
            maintenance may already know. Submit anyway if yours is different or adds new info.
          </p>
        </div>
      )}

      {/* Impact (maps to priority) */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-indigo-500" />
            How does this affect you?
            <span className="text-red-500">*</span>
          </span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {IMPACT_LEVELS.map((lvl) => (
            <ImpactChip
              key={lvl.key}
              label={lvl.label}
              hint={lvl.hint}
              isSelected={impact === lvl.key}
              onClick={() => setImpact(lvl.key)}
              colorClass={IMPACT_STYLES[lvl.key]}
            />
          ))}
        </div>
      </div>

      {/* Description (required only when no photos attached) */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          <span className="flex items-center gap-1.5">
            <FileText size={12} className="text-indigo-500" />
            Description
            {selectedFiles.length === 0 && <span className="text-red-500">*</span>}
          </span>
        </label>
        <textarea
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800
            placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            focus:bg-white transition-all min-h-[140px] resize-y"
          placeholder={selectedFiles.length > 0
            ? "(Optional — photos attached)"
            : "Please describe the issue in detail. Include any relevant information that would help the maintenance team..."}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={submitting || uploadingImages}
        className={`w-full px-6 py-3.5 font-semibold rounded-xl transition-all duration-200
          flex items-center justify-center gap-2 text-sm shadow-sm
          ${submitting || uploadingImages
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md active:scale-[0.99]'
          }`}
      >
        {submitting || uploadingImages ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {uploadingImages ? 'Uploading Photos...' : 'Submitting...'}
          </>
        ) : (
          <>
            <CheckCircle className="w-4 h-4" />
            Submit Report
          </>
        )}
      </button>
    </form>
  );
}

export default ReportForm;
