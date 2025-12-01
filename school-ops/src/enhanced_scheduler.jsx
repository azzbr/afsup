// Enhanced Scheduler Component for Advanced Recurring Tasks
import React, { useState, useEffect } from 'react';
import { Calendar, X, Plus, MapPin, Clock, AlertTriangle } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// --- Location Groups for Bulk Selection ---
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

// Enhanced Schedule Form with Industry-Best Features
function EnhancedScheduleForm({ isOpen, onClose, onSubmit, user }) {
  const [formData, setFormData] = useState({
    category: ISSUE_CATEGORIES[0],
    selectedLocations: [],
    priority: 'medium',
    frequencyDays: 365,
    startDate: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD
    isStartImmediately: true,
    description: '',
    locationMode: 'groups' // 'groups' or 'individual'
  });

  const [loading, setLoading] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const toggleLocation = (groupKey) => {
    if (formData.selectedLocations.includes(groupKey)) {
      setFormData(prev => ({
        ...prev,
        selectedLocations: prev.selectedLocations.filter(loc => loc !== groupKey)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        selectedLocations: [...prev.selectedLocations, groupKey]
      }));
    }
  };

  const getTotalLocations = () => {
    const selectedGroups = formData.selectedLocations
      .map(key => LOCATION_GROUPS[key])
      .filter(group => group);

    return selectedGroups.reduce((total, group) => total + group.locations.length, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.selectedLocations.length === 0) {
      alert('Please select at least one location or building group.');
      return;
    }

    if (!formData.description.trim()) {
      alert('Please enter a task description.');
      return;
    }

    setLoading(true);

    try {
      // Calculate the start date
      const startDate = formData.isStartImmediately
        ? new Date()
        : new Date(formData.startDate);

      if (!formData.isStartImmediately && startDate < new Date()) {
        alert('Start date cannot be in the past.');
        setLoading(false);
        return;
      }

      // Create individual schedules for each location
      const selectedGroups = formData.selectedLocations
        .map(key => LOCATION_GROUPS[key])
        .filter(group => group);

      const allLocations = selectedGroups.flatMap(group => group.locations);

      // Create the schedule data
      const scheduleData = {
        category: formData.category,
        locations: allLocations, // Store all locations as array
        priority: formData.priority,
        frequencyDays: parseInt(formData.frequencyDays),
        startDate: startDate.toISOString(),
        isStartImmediately: formData.isStartImmediately,
        description: formData.description.trim(),
        selectedGroups: formData.selectedLocations, // Store which groups were selected
        totalLocations: allLocations.length,
        nextRun: startDate,
        isActive: true
      };

      await onSubmit(scheduleData);
      resetForm();
      onClose();

    } catch (error) {
      console.error('Error creating schedule:', error);
      alert('Error creating schedule: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: ISSUE_CATEGORIES[0],
      selectedLocations: [],
      priority: 'medium',
      frequencyDays: 365,
      startDate: new Date().toISOString().split('T')[0],
      isStartImmediately: true,
      description: '',
      locationMode: 'groups'
    });
    setLocationSearch('');
  };

  useEffect(() => {
    if (!isOpen) resetForm();
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedCount = formData.selectedLocations.length;
  const totalLocations = getTotalLocations();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 60,
      padding: '20px'
    }}>
      <div 
        className="modal-content-wrapper"
        style={{
          backgroundColor: 'white',
          padding: '32px',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '6px',
            color: '#6b7280'
          }}
        >
          <X size={20} />
        </button>

        <div style={{ marginBottom: '24px' }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#1e293b',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Calendar style={{ height: '24px', width: '24px', color: '#4f46e5' }} />
            Create Advanced Schedule
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            Schedule recurring maintenance across multiple locations
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Task Details Row */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '16px' }}>
              1. Task Details
            </h3>

            <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Issue Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  {ISSUE_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Priority Level
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="low">Low - Routine Maintenance</option>
                  <option value="medium">Medium - Regular Check</option>
                  <option value="high">High - Important Task</option>
                  <option value="critical">Critical - Urgent Priority</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '6px'
              }}>
                Task Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe the maintenance task (e.g., 'Annual AC filter replacement and cleaning')"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  minHeight: '80px'
                }}
                required
              />
            </div>
          </div>

          {/* Location Selection */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <MapPin style={{ height: '18px', width: '18px', color: '#4f46e5' }} />
              2. Location Selection
              {selectedCount > 0 && (
                <span style={{
                  backgroundColor: '#dbeafe',
                  color: '#2563eb',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {selectedCount} groups • {totalLocations} locations
                </span>
              )}
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              {Object.entries(LOCATION_GROUPS).map(([key, group]) => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: formData.selectedLocations.includes(key) ? '#f0f9ff' : 'white',
                    borderColor: formData.selectedLocations.includes(key) ? '#3b82f6' : '#e2e8f0',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.selectedLocations.includes(key)}
                    onChange={() => toggleLocation(key)}
                    style={{ marginRight: '12px', accentColor: '#3b82f6' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', color: '#374151', marginBottom: '2px' }}>
                      {group.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {group.locations.length} locations
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {selectedCount === 0 && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '14px'
              }}>
                <AlertTriangle style={{ height: '16px', width: '16px', display: 'inline', marginRight: '8px' }} />
                Please select at least one location group.
              </div>
            )}
          </div>

          {/* Schedule Settings */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Clock style={{ height: '18px', width: '18px', color: '#4f46e5' }} />
              3. Schedule Settings
            </h3>

            <div className="responsive-grid-2" style={{ marginBottom: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Frequency
                </label>
                <select
                  value={formData.frequencyDays}
                  onChange={(e) => handleInputChange('frequencyDays', parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value={7}>Weekly (7 days)</option>
                  <option value={14}>Bi-weekly (14 days)</option>
                  <option value={30}>Monthly (30 days)</option>
                  <option value={60}>Every 2 months</option>
                  <option value={90}>Quarterly (90 days)</option>
                  <option value={180}>Semi-annually (6 months)</option>
                  <option value={365}>Annually (365 days)</option>
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Start Timing
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.isStartImmediately}
                      onChange={(e) => handleInputChange('isStartImmediately', e.target.checked)}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>Start immediately</span>
                  </label>
                  {!formData.isStartImmediately && (
                    <input
                      type="date"
                      value={formData.startDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        backgroundColor: 'white'
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{
            backgroundColor: '#f8fafc',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '24px'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Schedule Summary
            </h4>
            <div style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
              <div><strong>Task:</strong> {formData.description || 'No description'}</div>
              <div><strong>Category:</strong> {formData.category}</div>
              <div><strong>Locations:</strong> {totalLocations} locations across {selectedCount} groups</div>
              <div><strong>Frequency:</strong> Every {formData.frequencyDays} days</div>
              <div><strong>Next Due:</strong> {formData.isStartImmediately ? 'Today' : new Date(formData.startDate).toLocaleDateString()}</div>
              <div><strong>Total Scheduled Tasks:</strong> {totalLocations} individual tasks will be created</div>
            </div>
          </div>

          {/* Actions */}
          <div 
            className="modal-actions"
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              paddingTop: '20px',
              borderTop: '1px solid #e2e8f0'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedCount === 0 || !formData.description.trim()}
              style={{
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                opacity: (loading || selectedCount === 0 || !formData.description.trim()) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? 'Creating...' : `Create Schedule (${totalLocations} tasks)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EnhancedScheduleForm;
