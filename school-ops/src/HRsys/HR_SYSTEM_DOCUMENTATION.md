# HR System - User Information Directory

## Complete Structure & Content Guide

---

## 📁 System Architecture

```
HR System
├── HRSystem.jsx              # Main container & dashboard
│   ├── Dashboard View        # Overview with stats & widgets
│   ├── Directory View        # Staff listing (HRDirectory.jsx)
│   └── Employee Detail View  # Individual profiles (EmployeeDetailView.jsx)
├── HRDirectory.jsx           # Staff directory with search/filter
└── EmployeeDetailView.jsx    # Detailed employee profile management
```

---

## 🏠 1. HR Dashboard (Default View)

### Quick Stats Bar
| Stat | Description | Color | Action |
|------|-------------|-------|--------|
| Total Staff | Count of all employees | Slate | Opens Directory |
| Active | Approved employees | Emerald | Opens filtered Directory |
| Pending | Awaiting approval | Amber | Opens filtered Directory |
| Bahraini | Local employees | Indigo | - |
| Expat | Foreign employees | Indigo | - |
| Alerts | Compliance issues | Red | Opens alerts |

### Widgets

#### 1. Compliance Alert Banner
- **Critical Alerts** (Red): Expired CPR, Expired Visa
- **Warning Alerts** (Amber): Expiring soon (within 3 months)
- **Info Alerts** (Blue): Missing IBAN, Missing Arabic name

#### 2. Pending Approvals Widget
- Shows new user registrations awaiting approval
- Quick actions: View Profile, Approve
- Empty state when no pending users

#### 3. Leave Requests Widget
- Pending leave applications from staff
- Shows: Employee name, dates, days requested, reason
- Quick actions: Approve, Reject

#### 4. Workforce Diversity Chart
- Visual breakdown by nationality
- Progress bars with percentages

#### 5. Quick Actions
- View Full Directory
- Export HR Report
- HR Settings

---

## 📋 2. Staff Directory (HRDirectory.jsx)

### Features

#### Search Bar
- Search by: Name, Email, CPR, Phone number
- Real-time filtering

#### Filter Sidebar
Contains:
1. **Quick Stats Cards**
   - Active count
   - Pending count
   - Total count
   - Compliance alerts count

2. **Role Filter**
   - All Roles
   - Administrators
   - HR Managers
   - Maintenance
   - Staff

3. **Status Filter**
   - All Status
   - Active (Approved)
   - Pending Approval
   - Suspended

4. **Nationality Filter**
   - All Nationalities
   - Bahraini
   - Indian
   - Filipino
   - British
   - Egyptian
   - Jordanian
   - Pakistani
   - Other

5. **Compliance Issues Only** (Checkbox)

6. **Reset All Filters** button

#### View Modes

**Grid View (Default)**
- Card layout with employee avatar
- Shows: Initials, Name (English & Arabic), Email, Role badge, Status badge
- Quick info: Nationality, CPR number, Phone
- Hover reveals "View Full Profile" action
- Red dot indicator for compliance issues

**Table View**
- Columns: Employee, Role & Status, Nationality, CPR, Phone, Joined Date, Actions
- Sortable headers
- Row click opens detail view

#### Sorting Options
- Name (A-Z, Z-A)
- Email
- Role
- Join Date

#### Export Button
- Downloads employee data

---

## 👤 3. Employee Detail View (EmployeeDetailView.jsx)

### Header Section
- **Avatar**: Initials with gradient background
- **Name**: English name (large) + Arabic name (if available)
- **Status Badge**: Active/Pending/Suspended/Terminated
- **Quick Info**: Email, Phone, Tenure
- **Role Badge**: Current system role
- **Actions**: Edit Profile, Print

### Navigation Tabs
1. **Overview** - Personal & document info
2. **Documents** - HR document vault
3. **Employment** - Job details & history
4. **Leave & Attendance** - Leave balances
5. **Admin Actions** - Status/role management (HR/Admin only)

---

### Tab 1: Overview

#### Section A: Personal Information
| Field | Type | Notes |
|-------|------|-------|
| Full Name (English) | Text | First + Middle + Last |
| Arabic Name (GOSI) | Text RTL | Required for Bahraini employees |
| Nationality | Dropdown | Bahraini, Indian, Filipino, etc. |
| Gender | Dropdown | Male, Female |
| Marital Status | Dropdown | Single, Married, Divorced, Widowed |
| Phone Number | Tel | Format: +973 XXXX XXXX |
| Email Address | Email | Read-only (from registration) |

#### Section B: Identity Documents
| Field | Type | Validation |
|-------|------|------------|
| CPR Number | Text (9 digits) | Required for Bahrain residents |
| CPR Expiry Date | Date | Triggers alert if < 3 months |
| Passport Number | Text | - |
| Passport Expiry | Date | Triggers alert if < 3 months |

**For Non-Bahrainis Only:**
| Field | Type | Notes |
|-------|------|-------|
| Residence Permit # | Text | LMRA requirement |
| RP Expiry Date | Date | Critical - triggers alert if < 1 month |
| Work Permit # | Text | Required for employment |

#### Section C: Banking & Payroll (WPS)
| Field | Type | Validation |
|-------|------|------------|
| Bank Name | Dropdown | NBB, BBK, Ila Bank, AUB, KFH, BenefitPay |
| IBAN | Text (22 chars) | Must start with "BH" |

---

### Tab 2: Documents

#### Document Vault
Each document shows:
- Icon (checkmark if uploaded)
- Document name
- Upload status
- View/Download button (if uploaded)

| Document Type | Key | Required For |
|---------------|-----|--------------|
| Passport Copy | `passport` | All employees |
| CPR (Smart Card) | `cpr` | All employees |
| IBAN Certificate | `iban` | WPS compliance |
| University Degree | `degree` | Teaching staff |
| Transcripts | `transcripts` | Teaching staff |
| QuadraBay Verification | `quadrabay` | Teaching staff |
| MOE Teacher Approval | `moe_approval` | Teachers |
| Employment Contract | `contract` | All employees |

---

### Tab 3: Employment

#### Employment Details
| Field | Description |
|-------|-------------|
| Date of Joining | First day of employment |
| Tenure | Calculated years/months |
| Current Role | System role (Staff/Maintenance/HR/Admin) |
| Account Status | Approved/Pending/Suspended/Terminated |
| Created At | Account creation date |
| Last Updated | Most recent profile update |

---

### Tab 4: Leave & Attendance

#### Leave Balance Cards
Three cards showing:

1. **Annual Leave** (Indigo)
   - Days remaining out of 30
   - Standard 30 days/year per Bahrain Labor Law

2. **Sick Leave - Full Pay** (Emerald)
   - Days remaining out of 15
   - First 15 days at full salary

3. **Sick Leave - Half Pay** (Amber)
   - Days remaining out of 20
   - Next 20 days at 50% salary

#### Leave History
- Table of past leave requests
- Shows: Type, Dates, Status, Approved By

---

### Tab 5: Admin Actions (HR/Admin Only)

#### Account Status Management
Four action buttons:
| Action | Color | Result |
|--------|-------|--------|
| Approve | Emerald | Activates account |
| Set Pending | Amber | Returns to pending state |
| Suspend | Orange | Temporarily disables access |
| Terminate | Red | Ends employment |

#### Role Assignment (Admin Only)
Four role options:
- **Staff** - Basic access, can submit reports
- **Maintenance** - Can view/update tickets
- **HR** - Can manage staff profiles
- **Admin** - Full system access

#### Danger Zone (Admin Only)
- **Delete Permanently** button
- Requires double confirmation
- Irreversible action

---

## 🔒 Permission Matrix

| Feature | Staff | Maintenance | HR | Admin |
|---------|-------|-------------|----|----- |
| View own profile | ✅ | ✅ | ✅ | ✅ |
| View directory | ❌ | ✅ (limited) | ✅ | ✅ |
| View other profiles | ❌ | ❌ | ✅ | ✅ |
| Edit other profiles | ❌ | ❌ | ✅ | ✅ |
| Change user status | ❌ | ❌ | ✅ | ✅ |
| Change user role | ❌ | ❌ | ❌ | ✅ |
| Delete users | ❌ | ❌ | ❌ | ✅ |
| View compliance alerts | ❌ | ❌ | ✅ | ✅ |
| Process leave requests | ❌ | ❌ | ✅ | ✅ |

### Who Can See Whom
- **Admin**: Sees everyone
- **HR**: Sees Staff, Maintenance, HR (cannot see Admin)
- **Maintenance**: Sees Staff, Maintenance only
- **Staff**: Cannot access directory (only own profile)

---

## 🚨 Compliance Alerts System

### Alert Types & Priorities

| Alert | Priority | Trigger | Action Required |
|-------|----------|---------|-----------------|
| CPR Expired | 🔴 Critical | Past expiry date | Immediate |
| Visa Expired | 🔴 Critical | Past expiry date (Non-Bahraini) | LMRA violation |
| CPR Expiring | 🟡 Warning | < 3 months | Schedule renewal |
| Visa Expiring | 🟡 Warning | < 1 month (Non-Bahraini) | Start renewal process |
| Passport Expiring | 🟡 Warning | < 3 months | Notify employee |
| Missing IBAN | 🔵 Info | Empty or invalid | WPS compliance |
| Missing Arabic Name | 🔵 Info | Bahraini without Arabic name | GOSI requirement |

---

## 📱 Responsive Design

### Desktop (> 1024px)
- Full sidebar filters visible
- 4-column grid for cards
- Full table view with all columns

### Tablet (768px - 1024px)
- Collapsible filter sidebar
- 2-column grid for cards
- Scrollable table

### Mobile (< 768px)
- Filters in modal/drawer
- Single column grid
- Card-only view (no table)
- Stacked form fields

---

## 🎨 Design System

### Colors
- **Primary**: Indigo-600 (#4F46E5)
- **Success**: Emerald-500 (#10B981)
- **Warning**: Amber-500 (#F59E0B)
- **Error**: Red-500 (#EF4444)
- **Neutral**: Slate-50 to Slate-900

### Typography
- **Headings**: Bold, Slate-900
- **Body**: Regular, Slate-700
- **Labels**: Uppercase, Slate-500, tracking-wider
- **Arabic**: RTL direction, font-arabic class

### Components
- **Cards**: rounded-2xl, border, shadow-sm
- **Buttons**: rounded-xl, font-medium
- **Inputs**: rounded-xl, border-slate-200
- **Badges**: rounded-full, text-xs, font-semibold

---

## 🔗 Integration Points

### With Existing App.jsx
```jsx
// In App.jsx, when activeRole === 'user_info' or HR system
import HRSystem from './HRSystem';

// Replace:
{activeRole === 'user_info' && (
  <AdminView ... />
)}

// With:
{activeRole === 'user_info' && (
  <HRSystem user={user} userData={userData} />
)}
```

### Firebase Collections Used
- `users` - Employee profiles
- `leave_requests` - Leave applications
- `hr-documents/` - Storage path for uploaded documents

---

## 📄 File List for Implementation

1. **HRSystem.jsx** - Main container (created)
2. **HRDirectory.jsx** - Directory component (created)
3. **EmployeeDetailView.jsx** - Profile view (created)

### To Integrate
Copy these files to your project's `src/` folder and update `App.jsx` to use `HRSystem` instead of `AdminView` for the HR/Directory views.

---

## 🛠️ Future Enhancements

1. **Payroll Module** - Salary calculations, WPS export
2. **Attendance Tracking** - Clock in/out, timesheet
3. **Performance Reviews** - Annual evaluations
4. **Training Records** - Certifications, courses
5. **Onboarding Workflow** - New hire checklist
6. **Offboarding Process** - Exit procedures
7. **Reporting Dashboard** - HR analytics
8. **Document Expiry Notifications** - Email/SMS alerts
9. **Bulk Import/Export** - CSV/Excel support
10. **Audit Log** - Track all HR changes
