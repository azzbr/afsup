import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  X,
  Upload,
  AlertTriangle,
  CheckCircle,
  Camera,
  FileText,
  MapPin,
  Tag,
  Loader2,
  Plus
} from 'lucide-react';
import { compressImage, uploadImage } from '../storage';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { signInAsAnonymous, onAuthStateChange } from '../auth';
import { ISSUE_CATEGORIES, LOCATIONS } from '../constants';

// ============================================================================
// PRIORITY CHIP COMPONENT (HR-Style)
// ============================================================================

const PriorityChip = ({ value, label, isSelected, onClick, colorClass }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all duration-200 border-2 
        ${isSelected 
          ? `${colorClass} shadow-sm scale-105` 
          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
        }`}
    >
      {label}
    </button>
  );
};

// ============================================================================
// MAIN REPORT FORM COMPONENT
// ============================================================================

function ReportForm({ user, onSuccess }) {
  const [localUser, setLocalUser] = useState(user);
  const [category, setCategory] = useState(ISSUE_CATEGORIES[0]);
  const [location, setLocation] = useState(LOCATIONS[0]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!localUser) {
      setSubmitting(true);
      try {
        await signInAsAnonymous();
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        setError("Failed to authenticate: " + error.message);
        setSubmitting(false);
        return;
      }
    }

    if (!description.trim()) {
      setError("Please enter a description.");
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    try {
      const collectionRef = collection(db, 'maintenance_tickets');
      const currentUser = localUser; 

      const ticketData = {
        category,
        location,
        description: description.trim(),
        priority,
        status: 'open',
        reportedBy: currentUser?.uid, 
        reporterName: (currentUser?.isAnonymous) ? "Anonymous User" : "Staff Member",
        submittedBy: (!currentUser?.isAnonymous && currentUser?.email) ? currentUser.email : null,
        createdAt: serverTimestamp(),
        warnings: 0,
        notes: []
      };

      const docRef = await addDoc(collectionRef, ticketData);

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

  // Priority options with HR-style colors
  const priorityOptions = [
    { value: 'low', label: 'Low', colorClass: 'bg-slate-100 border-slate-300 text-slate-700' },
    { value: 'medium', label: 'Medium', colorClass: 'bg-blue-50 border-blue-300 text-blue-700' },
    { value: 'high', label: 'High', colorClass: 'bg-orange-50 border-orange-300 text-orange-700' },
    { value: 'critical', label: 'Critical', colorClass: 'bg-red-50 border-red-400 text-red-700' }
  ];

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

      {/* Row 1: Category & Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <Tag size={12} className="text-indigo-500" />
              Issue Category
            </span>
          </label>
          <select
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white 
              transition-all cursor-pointer"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} className="text-indigo-500" />
              Location
            </span>
          </label>
          <select
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white 
              transition-all cursor-pointer"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2: Priority + Photo Upload (Side by Side) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Priority Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-indigo-500" />
              Priority
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {priorityOptions.map((opt) => (
              <PriorityChip
                key={opt.value}
                value={opt.value}
                label={opt.label}
                isSelected={priority === opt.value}
                onClick={() => setPriority(opt.value)}
                colorClass={opt.colorClass}
              />
            ))}
          </div>
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

      {/* Row 3: Description (Full Width) */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          <span className="flex items-center gap-1.5">
            <FileText size={12} className="text-indigo-500" />
            Description
            <span className="text-red-500">*</span>
          </span>
        </label>
        <textarea
          required
          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 
            placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
            focus:bg-white transition-all min-h-[140px] resize-y"
          placeholder="Please describe the issue in detail. Include any relevant information that would help the maintenance team..."
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
