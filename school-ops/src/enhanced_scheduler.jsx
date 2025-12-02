import React, { useState, useEffect } from 'react';
import { Calendar, X, MapPin, Clock, AlertTriangle, Check, Layers } from 'lucide-react';
import { ISSUE_CATEGORIES } from './constants'; // Importing shared data

// Location Groups specific to the Scheduler logic
const LOCATION_GROUPS = {
  'whole_school': {
    name: 'Whole School',
    locations: [
      "B3 Hall Ground", "B3 Hall Up", "B3 KG1", "B3 KG2A", "B3 KG2B", "B3 KG3A", "B3 KG3B", "B3 KG3C", "B3 UnMark Room",
      "B4 Art Room", "B4 Computer Lab", "B4- G4A", "B4- G4B", "B4- G5A", "B4 Hall Ground", "B4 Hall Up", "B4 Library",
      "B4 Multimedia Room", "B4- Remedial Class", "B5 G1A", "B5 G1B", "B5 G2A", "B5 G2B", "B5 G3A", "B5 G3B",
      "B5 G3C", "B5 Hall Ground", "B5 Hall Up", "B5 Teachers Room", "B5 UnMark Room", "B1 Admin Hall Ground",
      "B1 Admin Hall Up", "Principal Office", "Academics Office", "HR Office", "HOA Office", "Accounting Office",
      "Consulor Office", "Registration Office", "Registration Waiting Area", "PE Hall", "Teachers Cabin Eng",
      "Teachers Cabin Arb"
    ]
  },
  'building3': {
    name: 'Building 3 (KG-G3)',
    locations: ["B3 Hall Ground", "B3 Hall Up", "B3 KG1", "B3 KG2A", "B3 KG2B", "B3 KG3A", "B3 KG3B", "B3 KG3C", "B3 UnMark Room"]
  },
  'building4': {
    name: 'Building 4 (G4-G5)',
    locations: ["B4 Art Room", "B4 Computer Lab", "B4- G4A", "B4- G4B", "B4- G5A", "B4 Hall Ground", "B4 Hall Up", "B4 Library", "B4 Multimedia Room", "B4- Remedial Class"]
  },
  'building5': {
    name: 'Building 5 (G1-G3)',
    locations: ["B5 G1A", "B5 G1B", "B5 G2A", "B5 G2B", "B5 G3A", "B5 G3B", "B5 G3C", "B5 Hall Ground", "B5 Hall Up", "B5 Teachers Room", "B5 UnMark Room"]
  },
  'admin_areas': {
    name: 'Admin Areas',
    locations: ["Principal Office", "Academics Office", "HR Office", "HOA Office", "Accounting Office", "Consulor Office", "Registration Office", "Registration Waiting Area"]
  },
  'other_buildings': {
    name: 'Other Areas',
    locations: ["PE Hall", "Teachers Cabin Eng", "Teachers Cabin Arb", "B1 Admin Hall Ground", "B1 Admin Hall Up"]
  }
};

export default function EnhancedScheduleForm({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    category: ISSUE_CATEGORIES[0],
    selectedLocations: [],
    priority: 'medium',
    frequencyDays: 30, // Default monthly
    startDate: new Date().toISOString().split('T')[0],
    isStartImmediately: true,
    description: '',
  });

  const [loading, setLoading] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleLocation = (groupKey) => {
    setFormData(prev => ({
      ...prev,
      selectedLocations: prev.selectedLocations.includes(groupKey)
        ? prev.selectedLocations.filter(loc => loc !== groupKey)
        : [...prev.selectedLocations, groupKey]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.selectedLocations.length === 0) return alert('Please select at least one location group.');
    if (!formData.description.trim()) return alert('Please enter a task description.');

    setLoading(true);
    try {
      const selectedGroups = formData.selectedLocations.map(key => LOCATION_GROUPS[key]).filter(Boolean);
      const allLocations = selectedGroups.flatMap(group => group.locations);

      const scheduleData = {
        category: formData.category,
        locations: allLocations,
        priority: formData.priority,
        frequencyDays: parseInt(formData.frequencyDays),
        startDate: formData.isStartImmediately ? new Date().toISOString() : new Date(formData.startDate).toISOString(),
        isStartImmediately: formData.isStartImmediately,
        description: formData.description.trim(),
        selectedGroups: formData.selectedLocations,
      };

      await onSubmit(scheduleData);
      onClose();
    } catch (error) {
      console.error(error);
      alert('Error creating schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        category: ISSUE_CATEGORIES[0],
        selectedLocations: [],
        priority: 'medium',
        frequencyDays: 30,
        startDate: new Date().toISOString().split('T')[0],
        isStartImmediately: true,
        description: '',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedCount = formData.selectedLocations.length;
  const totalLocations = formData.selectedLocations.reduce((acc, key) => acc + (LOCATION_GROUPS[key]?.locations.length || 0), 0);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="text-indigo-600" /> Create Advanced Schedule
            </h2>
            <p className="text-sm text-slate-500 mt-1">Automate recurring maintenance tasks</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-8">

          {/* Section 1: Task Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 uppercase tracking-wide">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</span>
              Task Details
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Issue Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="low">Low - Routine</option>
                  <option value="medium">Medium - Standard</option>
                  <option value="high">High - Priority</option>
                  <option value="critical">Critical - Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="E.g. Annual AC Filter Cleaning & Gas Check"
                rows={2}
                className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
          </section>

          {/* Section 2: Locations */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 uppercase tracking-wide">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</span>
                Target Locations
              </div>
              {selectedCount > 0 && (
                <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-medium">
                  {totalLocations} rooms selected
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(LOCATION_GROUPS).map(([key, group]) => {
                const isSelected = formData.selectedLocations.includes(key);
                return (
                  <div
                    key={key}
                    onClick={() => toggleLocation(key)}
                    className={`cursor-pointer border rounded-xl p-3 flex items-start gap-3 transition-all ${
                      isSelected ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'
                    }`}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {group.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {group.locations.length} Units
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedCount === 0 && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg text-sm">
                <AlertTriangle size={16} /> Select at least one location group above.
              </div>
            )}
          </section>

          {/* Section 3: Timing */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 uppercase tracking-wide">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">3</span>
              Schedule Settings
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Repetition</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                  <select
                    value={formData.frequencyDays}
                    onChange={(e) => handleInputChange('frequencyDays', e.target.value)}
                    className="w-full pl-9 p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none"
                  >
                    <option value={7}>Weekly (7 Days)</option>
                    <option value={14}>Bi-Weekly (14 Days)</option>
                    <option value={30}>Monthly (30 Days)</option>
                    <option value={90}>Quarterly (90 Days)</option>
                    <option value={180}>Semi-Annually (6 Months)</option>
                    <option value={365}>Yearly (365 Days)</option>
                  </select>
                </div>
              </div>

              <div>
                 <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Start Date</label>
                 <div className="space-y-2">
                   <label className="flex items-center gap-2 cursor-pointer">
                     <input
                       type="checkbox"
                       checked={formData.isStartImmediately}
                       onChange={(e) => handleInputChange('isStartImmediately', e.target.checked)}
                       className="rounded text-indigo-600 focus:ring-indigo-500"
                     />
                     <span className="text-sm text-slate-700">Start Immediately</span>
                   </label>

                   {!formData.isStartImmediately && (
                     <input
                       type="date"
                       value={formData.startDate}
                       onChange={(e) => handleInputChange('startDate', e.target.value)}
                       min={new Date().toISOString().split('T')[0]}
                       className="w-full p-2 border border-slate-200 rounded-lg text-sm outline-none"
                     />
                   )}
                 </div>
              </div>
            </div>
          </section>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || selectedCount === 0}
            className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
          >
            {loading ? 'Creating...' : `Create Schedule (${totalLocations} Tasks)`}
          </button>
        </div>
      </div>
    </div>
  );
}
