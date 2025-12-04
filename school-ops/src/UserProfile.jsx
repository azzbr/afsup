import React, { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { uploadFile } from './storage';
import { NATIONALITIES, BAHRAIN_BANKS, SICK_LEAVE_TIERS } from './constants';
import { User, Calendar, CreditCard, Briefcase, Activity, AlertTriangle, Save, FileText, Eye, UploadCloud, Check } from 'lucide-react';

export default function UserProfile({ userData, user }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Derive "isBahraini" for conditional logic (KEY FEATURE)
  const isBahraini = formData.nationality === 'Bahraini';

  useEffect(() => {
    if (userData) {
      // Helper to safely format dates for HTML inputs
      const fmt = (d) => d?.toDate ? d.toDate().toISOString().split('T')[0] : (d || '');

      setFormData({
        // Identity
        firstName: userData.firstName || '',
        middleName: userData.middleName || '',
        lastName: userData.lastName || '',
        arabicName: userData.arabicName || '', // NEW: For GOSI & Ministry contracts
        nationality: userData.nationality || 'Bahraini',
        gender: userData.gender || 'Male',
        maritalStatus: userData.maritalStatus || 'Single',

        // Documents
        cprNumber: userData.cprNumber || '',
        cprExpiry: fmt(userData.cprExpiry),
        passportNumber: userData.passportNumber || '',
        passportExpiry: fmt(userData.passportExpiry),

        // Visa (Only for Expats - this is the smart conditional logic!)
        residencePermitNumber: userData.residencePermitNumber || '',
        residencePermitExpiry: fmt(userData.residencePermitExpiry),
        workPermitNumber: userData.workPermitNumber || '',

        // Banking (WPS compliance)
        iban: userData.iban || 'BH',
        bankName: userData.bankName || BAHRAIN_BANKS[0],

        // Employment & Leaves
        dateOfJoining: fmt(userData.dateOfJoining),
        sickDaysUsed: userData.sickDaysUsed || 0, // Bahrain Labor Law tracking
        annualLeaveBalance: userData.annualLeaveBalance || 30,

        // Financial & Payroll
        basicSalary: userData.basicSalary || '',
        housingAllowance: userData.housingAllowance || '',
        transportAllowance: userData.transportAllowance || '',
        phoneAllowance: userData.phoneAllowance || '',
        bankName: userData.bankName || BAHRAIN_BANKS[0],
        iban: userData.iban || 'BH',

        // Contact
        phoneNumber: userData.phoneNumber || ''
      });
    }
  }, [userData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    // Bahrain Compliance: CPR must be 9 digits (PRIMARY VALIDATION)
    if (!isBahraini && !/^\d{9}$/.test(formData.cprNumber)) {
      alert("Invalid CPR Number. Bahrain residency requires 9 digits.");
      setLoading(false);
      return;
    }

    // IBAN validation - Bahrain IBAN format: BH + 2-digit bank code + 14 digits (22 chars total)
    if (formData.iban) {
      const iban = formData.iban.toUpperCase().replace(/\s+/g, ''); // Remove spaces
      const bahrainIbanRegex = /^BH\d{2}[A-Z0-9]{14}$/; // BH + 2 digits + 14 alphanumeric

      if (!bahrainIbanRegex.test(iban) || iban.length !== 22) {
        alert("Invalid Bahrain IBAN format. Must be 22 characters: BH + Bank Code + Account Number");
        setLoading(false);
        return;
      }
    }

    // Financial Validation: Prevent negative salaries and allowances
    const basicSalary = parseFloat(formData.basicSalary);
    const housing = parseFloat(formData.housingAllowance || 0);
    const transport = parseFloat(formData.transportAllowance || 0);
    const phone = parseFloat(formData.phoneAllowance || 0);

    if (basicSalary && basicSalary < 0) {
      alert("Basic salary cannot be negative.");
      setLoading(false);
      return;
    }
    if (housing < 0 || transport < 0 || phone < 0) {
      alert("Allowances cannot be negative.");
      setLoading(false);
      return;
    }

    // Prevent unrealistically high values (potential data corruption)
    if (basicSalary > 100000 || housing > 50000 || transport > 20000 || phone > 5000) {
      if (!confirm("Warning: You entered unusually high values. Are you sure this is correct?")) {
        setLoading(false);
        return;
      }
    }

    try {
      const updates = {
        ...formData,
        // Convert date strings back to Firestore Timestamps or null
        cprExpiry: formData.cprExpiry ? new Date(formData.cprExpiry) : null,
        passportExpiry: formData.passportExpiry ? new Date(formData.passportExpiry) : null,
        residencePermitExpiry: formData.residencePermitExpiry ? new Date(formData.residencePermitExpiry) : null,
        dateOfJoining: formData.dateOfJoining ? new Date(formData.dateOfJoining) : null,
        updatedAt: new Date()
      };

      // Clean up Expat fields if user switched to Bahraini (SMART LOGIC)
      if (formData.nationality === 'Bahraini') {
        updates.residencePermitNumber = null;
        updates.residencePermitExpiry = null;
        updates.workPermitNumber = null;
      }

      await updateDoc(doc(db, 'users', user.uid), updates);
      setMessage('✅ Profile Updated Successfully! HR will be notified.');
    } catch (error) {
      console.error(error);
      setMessage('❌ Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- LEAVE REQUEST SUBMISSION ---
  const handleLeaveRequest = async () => {
    setLoading(true);
    setMessage('');

    // Validation
    if (!formData.leaveStart || !formData.leaveEnd || !formData.leaveDays) {
      alert("Please fill in all leave request fields");
      setLoading(false);
      return;
    }

    const daysRequested = parseInt(formData.leaveDays);
    const balance = parseInt(formData.annualLeaveBalance || 0);

    if (daysRequested > balance) {
      alert(`You only have ${balance} days available.`);
      setLoading(false);
      return;
    }

    try {
      // Create leave request in Firestore
      await addDoc(collection(db, 'leave_requests'), {
        userId: user.uid,
        employeeName: `${formData.firstName} ${formData.lastName}`.trim(),
        leaveStart: new Date(formData.leaveStart),
        leaveEnd: new Date(formData.leaveEnd),
        daysRequested,
        reason: formData.leaveReason || '',
        status: 'pending', // pending, approved, rejected
        submittedAt: new Date(),
        submittedBy: user.uid
      });

      // Clear form fields
      setFormData({
        ...formData,
        leaveStart: '',
        leaveEnd: '',
        leaveDays: '',
        leaveReason: ''
      });

      setMessage('✅ Leave request submitted! HR will review it soon.');
    } catch (error) {
      console.error(error);
      setMessage('❌ Error submitting leave request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- SICK LEAVE CALCULATOR: Bahrain Labor Law Implementation ---
  const calculateSickLeaveStatus = (used) => {
    let remaining = used;

    const fullPayUsed = Math.min(remaining, SICK_LEAVE_TIERS.FULL_PAY);
    remaining -= fullPayUsed;

    const halfPayUsed = Math.min(Math.max(remaining, 0), SICK_LEAVE_TIERS.HALF_PAY);
    remaining -= halfPayUsed;

    const noPayUsed = Math.min(Math.max(remaining, 0), SICK_LEAVE_TIERS.NO_PAY);

    return {
      fullPayBalance: SICK_LEAVE_TIERS.FULL_PAY - fullPayUsed,
      halfPayBalance: SICK_LEAVE_TIERS.HALF_PAY - halfPayUsed,
      noPayBalance: SICK_LEAVE_TIERS.NO_PAY - noPayUsed
    };
  };

  const slStatus = calculateSickLeaveStatus(formData.sickDaysUsed || 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* 1. SICK LEAVE DASHBOARD (Bahrain Labor Law 2012 - 55 days max) */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity size={20} className="text-emerald-600" /> Sick Leave Balance
            </h3>
            <p className="text-sm text-slate-500">Bahrain Labor Law 2012 - Cap 55 days/year</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-slate-800">{formData.sickDaysUsed}</div>
            <div className="text-xs text-slate-500">Days Used This Year</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-xl border border-emerald-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{slStatus.fullPayBalance}</div>
                <div className="text-xs text-emerald-700 font-medium">Full Pay Days Left</div>
              </div>
              <div className="text-3xl text-emerald-400">$</div>
            </div>
            <div className="text-xs text-slate-400 mt-1">First 15 days: Full salary</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-amber-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-600">{slStatus.halfPayBalance}</div>
                <div className="text-xs text-amber-700 font-medium">Half Pay Days Left</div>
              </div>
              <div className="text-3xl text-amber-400">½</div>
            </div>
            <div className="text-xs text-slate-400 mt-1">Next 20 days: Half salary</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-red-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">{slStatus.noPayBalance}</div>
                <div className="text-xs text-red-700 font-medium">Unpaid Days Left</div>
              </div>
              <div className="text-3xl text-red-400">🚫</div>
            </div>
            <div className="text-xs text-slate-400 mt-1">Last 20 days: Unpaid leave</div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-8">

        {/* 2. CORE IDENTITY SECTION */}
        <section className="space-y-4">
           <h3 className="text-xl font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
             <User size={20}/> Personal & Identity Information
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
               <label className="block text-sm font-medium text-slate-700">Full Name (English) *</label>
               <div className="grid grid-cols-3 gap-2">
                 <input
                   type="text" required
                   placeholder="First"
                   className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                   value={formData.firstName}
                   onChange={e => setFormData({...formData, firstName: e.target.value})}
                 />
                 <input
                   type="text"
                   placeholder="Middle"
                   className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                   value={formData.middleName}
                   onChange={e => setFormData({...formData, middleName: e.target.value})}
                 />
                 <input
                   type="text" required
                   placeholder="Last"
                   className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                   value={formData.lastName}
                   onChange={e => setFormData({...formData, lastName: e.target.value})}
                 />
               </div>
             </div>

             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Full Name (Arabic)</label>
               <input
                 type="text" dir="rtl"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="الاسم الكامل"
                 value={formData.arabicName}
                 onChange={e => setFormData({...formData, arabicName: e.target.value})}
               />
               <p className="text-xs text-slate-400 mt-1">Required for GOSI & official Ministry contracts</p>
             </div>

             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Nationality</label>
               <select
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 value={formData.nationality}
                 onChange={e => setFormData({...formData, nationality: e.target.value})}
               >
                 {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
               </select>
             </div>

             <div className="grid grid-cols-2 gap-2">
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                 <select
                   className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                   value={formData.gender}
                   onChange={e => setFormData({...formData, gender: e.target.value})}
                 >
                   <option>Male</option>
                   <option>Female</option>
                 </select>
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1">Marital Status</label>
                 <select
                   className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                   value={formData.maritalStatus}
                   onChange={e => setFormData({...formData, maritalStatus: e.target.value})}
                 >
                   <option>Single</option>
                   <option>Married</option>
                 </select>
               </div>
             </div>
           </div>
        </section>

        {/* 3. DOCUMENTS SECTION */}
        <section className="space-y-4">
           <h3 className="text-xl font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
             <Briefcase size={20}/> Official Documents
           </h3>

           {/* CPR - Always Required */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">
                 CPR Number {!isBahraini && '*'}</label>
               <input
                 type="text" maxLength="9"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder={isBahraini ? "9-digit CPR" : "Your Bahrain CPR"}
                 value={formData.cprNumber}
                 onChange={e => setFormData({...formData, cprNumber: e.target.value})}
               />
               <p className="text-xs text-slate-400 mt-1">Bahrain's primary ID for everything</p>
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">CPR Expiry Date</label>
               <input
                 type="date"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 value={formData.cprExpiry}
                 onChange={e => setFormData({...formData, cprExpiry: e.target.value})}
               />
             </div>
           </div>

           {/* Passport - Always Available */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Passport Number</label>
               <input
                 type="text"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="Official Passport Number"
                 value={formData.passportNumber}
                 onChange={e => setFormData({...formData, passportNumber: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Passport Expiry</label>
               <input
                 type="date"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 value={formData.passportExpiry}
                 onChange={e => setFormData({...formData, passportExpiry: e.target.value})}
               />
             </div>
           </div>

           {/* VISA SECTION - HIDDEN FOR BAHRAINIS (SMART CONDITIONAL LOGIC) */}
           {!isBahraini && (
             <>
               <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                 <div className="flex items-center gap-2 mb-2">
                   <AlertTriangle size={16} className="text-amber-600" />
                   <span className="text-sm font-medium text-amber-800">Non-Bahraini: Visa Details Required</span>
                 </div>
                 <p className="text-xs text-amber-700">Missing visa data can result in LMRA fines.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Residence Permit (RP) No</label>
                   <input
                     type="text"
                     className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                     placeholder="Usually same as CPR"
                     value={formData.residencePermitNumber}
                     onChange={e => setFormData({...formData, residencePermitNumber: e.target.value})}
                   />
                 </div>
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">RP Expiry Date *</label>
                   <input
                     type="date"
                     className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                     value={formData.residencePermitExpiry}
                     onChange={e => setFormData({...formData, residencePermitExpiry: e.target.value})}
                   />
                   <p className="text-xs text-red-500 mt-1">⚠️ Critical: Expiry causes fines</p>
                 </div>
               </div>
             </>
           )}
        </section>

        {/* 4. BANKING SECTION (WPS - Wage Protection System) */}
        <section className="space-y-4">
           <h3 className="text-xl font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
             <CreditCard size={20}/> Banking Information (WPS)
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
               <select
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 value={formData.bankName}
                 onChange={e => setFormData({...formData, bankName: e.target.value})}
               >
                 {BAHRAIN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
               </select>
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">IBAN</label>
               <input
                 type="text" maxLength="30"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm uppercase"
                 placeholder="BH1234567890..."
                 value={formData.iban}
                 onChange={e => setFormData({...formData, iban: e.target.value})}
               />
               <p className="text-xs text-slate-400 mt-1">All Bahrain IBANs start with BH</p>
             </div>
           </div>
        </section>

        {/* 5. FINANCIAL & PAYROLL - NEW: Bahrain WPS (Wage Protection System) */}
        <section className="space-y-4">
           <h3 className="text-xl font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
             <CreditCard size={20}/> Salary & Allowances (WPS Compliant)
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Basic Salary</label>
               <input
                 type="number"
                 step="0.01"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="BHD 0.00"
                 value={formData.basicSalary}
                 onChange={e => setFormData({...formData, basicSalary: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Housing Allowance</label>
               <input
                 type="number"
                 step="0.01"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="BHD 0.00"
                 value={formData.housingAllowance}
                 onChange={e => setFormData({...formData, housingAllowance: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Transport Allowance</label>
               <input
                 type="number"
                 step="0.01"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="BHD 0.00"
                 value={formData.transportAllowance}
                 onChange={e => setFormData({...formData, transportAllowance: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Phone Allowance</label>
               <input
                 type="number"
                 step="0.01"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="BHD 0.00"
                 value={formData.phoneAllowance}
                 onChange={e => setFormData({...formData, phoneAllowance: e.target.value})}
               />
             </div>
           </div>

           {/* GOSI CALCULATOR DISPLAY - WITH SAFETY CHECKS */}
           {parseFloat(formData.basicSalary) > 0 && (
             <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
               <h4 className="text-sm font-bold text-blue-800 mb-2">GOSI Calculation Preview</h4>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                 {(() => {
                   const basicSalary = parseFloat(formData.basicSalary) || 0;
                   const housing = parseFloat(formData.housingAllowance || 0);
                   const transport = parseFloat(formData.transportAllowance || 0);
                   const phone = parseFloat(formData.phoneAllowance || 0);

                   return (
                     <>
                       <div>
                         <span className="text-blue-600 font-medium">Employee Contribution:</span>
                         <div className="font-bold text-blue-800">{(basicSalary * 0.05).toFixed(2)} BHD</div>
                       </div>
                       <div>
                         <span className="text-blue-600 font-medium">Employer Contribution:</span>
                         <div className="font-bold text-blue-800">{(basicSalary * 0.12).toFixed(2)} BHD</div>
                       </div>
                       <div>
                         <span className="text-blue-600 font-medium">Monthly Total:</span>
                         <div className="font-bold text-blue-800">{(basicSalary + (basicSalary * 0.17)).toFixed(2)} BHD</div>
                       </div>
                       <div>
                         <span className="text-blue-600 font-medium">Net Pay:</span>
                         <div className="font-bold text-blue-800">
                           {(basicSalary - (basicSalary * 0.05) + housing + transport + phone).toFixed(2)} BHD
                         </div>
                       </div>
                     </>
                   );
                 })()}
               </div>
             </div>
           )}
        </section>

        {/* 6. ANNUAL LEAVE REQUEST - NEW */}
        <section className="space-y-4">
           <h3 className="text-xl font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
             <Calendar size={20}/> Annual Leave Request
           </h3>
           <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
             <div className="flex items-center justify-between mb-4">
               <div>
                 <h4 className="text-sm font-bold text-emerald-800">Available Leave Balance</h4>
                 <p className="text-xs text-emerald-600">{formData.annualLeaveBalance || 0} days remaining</p>
               </div>
               <div className="text-2xl font-bold text-emerald-600">{formData.annualLeaveBalance || 0}</div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
               <div>
                 <label className="block text-sm font-medium text-emerald-800 mb-1">From Date</label>
                 <input
                   type="date"
                   className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white"
                   value={(formData.leaveStart || '')}
                   onChange={e => setFormData({...formData, leaveStart: e.target.value})}
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-emerald-800 mb-1">To Date</label>
                 <input
                   type="date"
                   className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white"
                   value={(formData.leaveEnd || '')}
                   onChange={e => setFormData({...formData, leaveEnd: e.target.value})}
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-emerald-800 mb-1">Days Requested</label>
                 <input
                   type="number"
                   min="1" max={formData.annualLeaveBalance || 0}
                   className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white"
                   placeholder="Number of days"
                   value={(formData.leaveDays || '')}
                   onChange={e => setFormData({...formData, leaveDays: e.target.value})}
                 />
               </div>
             </div>

             <div className="mb-4">
               <label className="block text-sm font-medium text-emerald-800 mb-1">Reason (Optional)</label>
               <textarea
                 rows="2"
                 className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white"
                 placeholder="Brief reason for leave..."
                 value={(formData.leaveReason || '')}
                 onChange={e => setFormData({...formData, leaveReason: e.target.value})}
               />
             </div>

             <p className="text-xs text-emerald-600">Request will be sent to HR for approval</p>
           </div>
        </section>

        {/* 7. CONTACT & EMPLOYMENT */}
        <section className="space-y-4">
           <h3 className="text-xl font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
             <Calendar size={20}/> Contact & Employment
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
               <input
                 type="tel"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 placeholder="+973 0000 0000"
                 value={formData.phoneNumber}
                 onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Date of Joining</label>
               <input
                 type="date"
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                 value={formData.dateOfJoining}
                 onChange={e => setFormData({...formData, dateOfJoining: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Annual Leave Balance (Read Only)</label>
               <input
                 type="text"
                 readOnly
                 className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 cursor-not-allowed"
                 value={`${formData.annualLeaveBalance || 0} days available`}
               />
               <p className="text-xs text-slate-400 mt-1 text-center">Balance adjusted by HR upon leave approval</p>
             </div>
           </div>
        </section>

        {/* Submit Leave Request */}
        {formData.leaveStart && formData.leaveEnd && formData.leaveDays && (
          <button
            type="button"
            onClick={handleLeaveRequest}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Calendar size={18} /> Submit Leave Request
          </button>
        )}

        <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
          {loading ? 'Saving Records...' : <><Save size={18} /> Save HR Profile</>}
        </button>

         <div className="text-center text-sm font-medium text-emerald-600 mt-2">{message}</div>
      </form>

      {/* 6. DOCUMENT VAULT SECTION */}
      <DocumentVault user={user} />
    </div>
  );
}

// --- REUSABLE UPLOAD COMPONENT ---
const DocumentUpload = ({ label, docType, currentUrl, userId, onUpload }) => {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      alert('Only PDF, JPG, and PNG files are allowed.');
      return;
    }

    setUploading(true);
    // Create a unique path: hr-documents/USER_ID/DOC_TYPE_TIMESTAMP.ext
    const ext = file.name.split('.').pop();
    const path = `hr-documents/${userId}/${docType}_${Date.now()}.${ext}`;

    const result = await uploadFile(file, path);

    if (result.success) {
      onUpload(docType, result.downloadURL);
    } else {
      alert('Upload failed: ' + result.error);
    }
    setUploading(false);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center justify-between hover:border-indigo-300 transition-colors shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${currentUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
          {currentUrl ? <Check size={20} /> : <FileText size={20} />}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="text-xs text-slate-400">
            {currentUrl ? 'Uploaded & Saved' : 'PDF or Image (Max 5MB)'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {currentUrl && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="View Document"
          >
            <Eye size={18} />
          </a>
        )}
        <label className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${uploading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
          {uploading ? '...' : <><UploadCloud size={14} /> {currentUrl ? 'Replace' : 'Upload'}</>}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
      </div>
    </div>
  );
};

// --- DOCUMENT VAULT COMPONENT ---
const DocumentVault = ({ user }) => {
  const [documents, setDocuments] = useState({});
  const [loading, setLoading] = useState(false);

  // Load existing documents
  useEffect(() => {
    if (user) {
      const loadDocs = async () => {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setDocuments(userData.documents || {});
          }
        } catch (error) {
          console.error('Error loading documents:', error);
        }
      };
      loadDocs();
    }
  }, [user]);

  // Save document URL to Firestore immediately
  const handleDocUpload = async (docType, url) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'users', user.uid), {
        [`documents.${docType}`]: url,
        updatedAt: new Date()
      });
      // Update local state
      setDocuments(prev => ({ ...prev, [docType]: url }));
      alert("Document uploaded successfully!");
    } catch (e) {
      console.error(e);
      alert("Error saving document link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <FileText size={20} className="text-indigo-600"/> Official Documents
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Identity Docs */}
        <DocumentUpload
          label="Passport Copy" docType="passport"
          userId={user?.uid} currentUrl={documents.passport} onUpload={handleDocUpload}
        />
        <DocumentUpload
          label="CPR (Smart Card)" docType="cpr"
          userId={user?.uid} currentUrl={documents.cpr} onUpload={handleDocUpload}
        />
        <DocumentUpload
          label="IBAN Certificate" docType="iban"
          userId={user?.uid} currentUrl={documents.iban} onUpload={handleDocUpload}
        />

        {/* Education & Verification Docs */}
        <div className="col-span-1 md:col-span-2 mt-4 mb-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Education & Verification</h4>
        </div>

        <DocumentUpload
          label="University Degree" docType="degree"
          userId={user?.uid} currentUrl={documents.degree} onUpload={handleDocUpload}
        />
        <DocumentUpload
          label="University Transcripts" docType="transcripts"
          userId={user?.uid} currentUrl={documents.transcripts} onUpload={handleDocUpload}
        />
        <DocumentUpload
          label="QuadraBay Verification" docType="quadrabay"
          userId={user?.uid} currentUrl={documents.quadrabay} onUpload={handleDocUpload}
        />
        <DocumentUpload
          label="MOE Teacher Approval" docType="moe_approval"
          userId={user?.uid} currentUrl={documents.moe_approval} onUpload={handleDocUpload}
        />
      </div>
    </div>
  );
};
