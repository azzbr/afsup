import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  X
} from 'lucide-react';
import { compressImage, uploadImage } from '../storage';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { signInAsAnonymous, onAuthStateChange } from '../auth';
import { ISSUE_CATEGORIES, LOCATIONS } from '../constants';

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

    // FIX: Authenticate ON SUBMIT, not before.
    if (!localUser) {
      setSubmitting(true);
      // We don't show an error here, we just show the spinner on the button
      try {
        await signInAsAnonymous();
        // Give a brief moment for state to settle
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Note: The onAuthStateChange listener will update localUser, 
        // but we might need to check auth.currentUser directly if this runs too fast.
        // For now, the loop continues.
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
      
      // Get the user ID (either from state or current auth instance)
      // We check localUser first, but if we just signed in, we might need the fresh object
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

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm border border-red-200">
          {error}
        </div>
      )}



      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Issue Category</label>
          <select
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
          <select
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'low', label: 'Low', color: 'text-slate-600' },
              { value: 'medium', label: 'Medium', color: 'text-slate-600' },
              { value: 'high', label: 'High', color: 'text-slate-600' },
              { value: 'critical', label: 'Critical', color: 'text-red-600 font-medium' }
            ].map(({ value, label, color }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
                <input
                  type="radio"
                  name="priority"
                  value={value}
                  checked={priority === value}
                  onChange={(e) => setPriority(e.target.value)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${priority === value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}>
                  {priority === value && <div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                </div>
                <span className={`text-sm ${color}`}>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Photo Evidence (Optional) - Max 5 images</label>
          <div className="space-y-3">
            <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors w-fit">
              <ImageIcon className="w-4 h-4 text-slate-600" />
              <span className="text-sm text-slate-700">Add Photos</span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
            </label>
            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-w-xs">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative">
                    <img
                      src={file}
                      alt={`Preview ${index + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-slate-500">{selectedFiles.length}/5 photos selected</div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
        <textarea
          required
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[96px] resize-y"
          placeholder="Please describe the issue in detail..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={submitting || uploadingImages}
        className={`w-full px-4 py-3 font-medium rounded-lg transition-all ${
          submitting || uploadingImages
            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'
        } flex items-center justify-center gap-2`}
      >
        {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
        {submitting ? 'Submitting...' : uploadingImages ? 'Uploading Images...' : 'Submit Report'}
      </button>
    </form>
  );
}

export default ReportForm;
