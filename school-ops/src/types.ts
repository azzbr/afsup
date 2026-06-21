// Shared domain types — see CLAUDE.md section 5 for canonical schemas.
//
// These describe data as it exists on the client AFTER reading from Firestore.
// Timestamp fields are typed as `Date | null` because data hooks convert
// Firestore Timestamps to JS Dates at the read boundary.

import type {
  Role,
  UserStatus,
  Nationality,
  BahrainBank,
  IssueCategory,
  LocationName,
  Priority,
  TicketStatus,
  Department,
  ContractType,
  MoeApprovalStatus,
  Subject,
  Grade,
  BloodType,
  StudentRiskTier,
} from "./constants";

// ============================================================================
// AUDIT FIELDS (every collection has these)
// ============================================================================

export interface AuditFields {
  createdAt: Date | null;
  createdBy: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

// ============================================================================
// USERS
// ============================================================================

export interface User extends Partial<AuditFields> {
  // Identity
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  arabicName?: string;

  // Access control
  role: Role;
  status: UserStatus;
  viewAll?: boolean;
  isActive?: boolean;

  // Demographics
  nationality?: Nationality;
  gender?: "Male" | "Female";
  maritalStatus?: "Single" | "Married";

  // Bahrain identity documents
  cprNumber?: string;
  cprExpiry?: Date | null;
  passportNumber?: string;
  passportExpiry?: Date | null;
  residencePermitNumber?: string;
  residencePermitExpiry?: Date | null;
  workPermitNumber?: string;

  // Banking — WPS compliance
  iban?: string;
  bankName?: BahrainBank;

  // Compensation — HR/admin-writable only
  basicSalary?: number | string;
  housingAllowance?: number | string;
  transportAllowance?: number | string;
  phoneAllowance?: number | string;

  // Employment & leave — HR/admin-writable only
  dateOfJoining?: Date | null;
  sickDaysUsed?: number;          // LEGACY — derived into leaveBalances.sick.used
  annualLeaveBalance?: number;    // LEGACY — derived into leaveBalances.annual.{entitled,used}
  /** Per-type leave tracking. Synthesized from legacy fields when missing. */
  leaveBalances?: Partial<Record<import("./constants").LeaveType, { entitled: number; used: number }>>;

  // Contact
  phoneNumber?: string;

  // Document vault — { docType: downloadURL }
  documents?: Record<string, string>;

  // ============================================================================
  // PHASE 2.5 — HR DOMAIN EXTENSION
  // Flat field layout so existing firestore.rules cover them automatically.
  // ============================================================================

  // Personal
  dateOfBirth?: Date | null;

  // Employment
  employeeNumber?: string;            // Human-readable e.g. "AFS-0142"
  position?: string;                   // Free text e.g. "Math Teacher"
  department?: Department;
  reportingManagerUid?: string | null;
  contractType?: ContractType;
  contractStartDate?: Date | null;
  contractEndDate?: Date | null;
  probationEndDate?: Date | null;
  separationDate?: Date | null;
  separationReason?: string;

  // Teacher-specific (only meaningful if isTeacher === true)
  isTeacher?: boolean;
  subjects?: Subject[];
  gradesTaught?: Grade[];
  homeroomClass?: string;
  moeApprovalStatus?: MoeApprovalStatus;
  moeApprovalExpiry?: Date | null;
  teachingLicenseNumber?: string;
  teachingLicenseExpiry?: Date | null;
  yearsExperienceTotal?: number;
  yearsAtAFS?: number;

  // Emergency contact (local / primary)
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactAltPhone?: string;

  // Medical
  bloodType?: BloodType;
  allergies?: string;
  medicalConditions?: string;
  healthIssues?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;

  // ============================================================================
  // EXPANDED EMPLOYEE INFO (HR data collection form)
  // All optional. Self-editable. Home-country fields only meaningful for
  // non-Bahrainis; UI hides them otherwise instead of asking for "N/A".
  // ============================================================================

  // Extended identity
  personalEmail?: string;          // distinct from the official school email
  fatherName?: string;             // as written in CPR
  religion?: string;
  secondaryPhone?: string;         // "Phone Number (2)"

  // Bahrain address — structured (Bahrain addressing model)
  bahrainAddressHouse?: string;
  bahrainAddressFlat?: string;
  bahrainAddressRoad?: string;
  bahrainAddressBlock?: string;
  bahrainAddressArea?: string;

  // Home country address — free text (varies wildly by country)
  homeCountryAddress?: string;

  // Two home-country emergency contacts (non-Bahrainis)
  homeCountryEmergency1Name?: string;
  homeCountryEmergency1Phone?: string;
  homeCountryEmergency1Relationship?: string;

  homeCountryEmergency2Name?: string;
  homeCountryEmergency2Phone?: string;
  homeCountryEmergency2Relationship?: string;

  // Family
  spouseName?: string;
  spouseCprNumber?: string;
  spouseJobTitle?: string;
  spouseCompanyName?: string;
  spouseCompanyLocation?: string;
  /** Free text — e.g. "Sara (8, in Bahrain), Omar (5, with grandparents)" */
  childrenInfo?: string;
  /** Free text — list of CPRs */
  childrenCprNumbers?: string;
}

// ============================================================================
// MAINTENANCE TICKETS
// ============================================================================

export interface TicketNote {
  byUid: string;
  byName: string;
  text: string;
  at: Date | null;
}

export interface Ticket extends Partial<AuditFields> {
  id: string;
  category: IssueCategory | string;
  location: LocationName | string;
  description: string;
  priority: Priority;
  status: TicketStatus;

  // Reporter
  reportedBy?: string;
  reporterName?: string;
  submittedBy?: string | null;

  // Photos
  imageUrls?: string[];
  completionImageUrls?: string[];

  // Assignment & resolution
  assignedTo?: string;
  startedAt?: Date | null;
  startedByName?: string;
  resolvedAt?: Date | null;
  resolvedBy?: string;
  completedBy?: string;
  completionNotes?: string;
  quickFixed?: boolean;

  // Admin
  adminNotes?: string;
  lastNoteBy?: string;
  lastNoteAt?: Date | null;
  escalated?: boolean;
  originalPriority?: Priority;
  warnings?: number;
  notes?: string[];

  // Phase 2.8 — additive, optional. Legacy tickets (~43 live) lack all of
  // these; every reader must tolerate their absence.
  categoryGroup?: string;
  impact?: string;
  assignedToUid?: string;
  assignedToName?: string;
  resolvedByUid?: string;
  duplicateOf?: string;
  reopenedAt?: Date | null;
  reopenCount?: number;

  // Threaded notes + cancellation (additive, optional — legacy tickets lack them)
  notesThread?: TicketNote[];
  cancelledAt?: Date | null;
  cancelledByUid?: string;
  cancelledByName?: string;
  cancelReason?: string;
}

// ============================================================================
// LEAVE REQUESTS
// ============================================================================

export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest extends Partial<AuditFields> {
  id: string;
  userId: string;
  employeeName: string;
  leaveStart: Date | null;
  leaveEnd: Date | null;
  daysRequested: number;
  /** Phase 2.7 — defaults to "annual" for back-compat with pre-2.7 requests. */
  leaveType?: import("./constants").LeaveType;
  reason?: string;
  status: LeaveStatus;
  submittedAt: Date | null;
  submittedBy: string;
  processedAt?: Date | null;
  processedBy?: string;
}

// ============================================================================
// SCHEDULED MAINTENANCE TASKS
// ============================================================================

export interface ScheduledTask extends Partial<AuditFields> {
  id: string;
  category: IssueCategory | string;
  description: string;
  priority: Priority;
  locations: string[];
  frequencyDays: number;
  isActive: boolean;
  lastRun?: Date | null;
  nextRun?: Date | null;
  nextDue?: Date | null;
  totalLocations?: number;
  isStartImmediately?: boolean;
}

// ============================================================================
// NOTIFICATIONS — added in Phase 1 design (CLAUDE.md section 5)
// ============================================================================

export type NotificationType =
  | "compliance"
  | "leave_request"
  | "leave_decision"
  | "ticket_sla"
  | "ticket_assigned"
  | "ticket_update"
  | "system";

export type NotificationPriority = "critical" | "warning" | "info";

export interface NotificationDoc extends Partial<AuditFields> {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  /** Either a uid or a broadcast target like "role:hr" / "role:admin". */
  targetUid: string;
  subject: string;
  body: string;
  link?: string;
  readAt?: Date | null;
}

// ============================================================================
// SCHOOL SETTINGS — singleton doc school_settings/current (CLAUDE.md section 5)
// All fields optional: the doc may not exist yet, and partial docs deep-merge
// over DEFAULT_SCHOOL_SETTINGS via effectiveSettings().
// ============================================================================

export interface SchoolSettings {
  schoolNameEn?: string;
  schoolNameAr?: string;
  domain?: string;
  academicYearStart?: Date | null;
  academicYearEnd?: Date | null;
  workingDays?: string[];
  weeklyOffDays?: string[];
  publicHolidays?: { date: Date | null; label: string }[];
  defaultAnnualLeaveDays?: number;
  sickLeaveTiers?: { fullPay: number; halfPay: number; noPay: number };
  gosi?: {
    bahraini?: { employerRate?: number; employeeRate?: number };
    expat?: { employerRate?: number; employeeRate?: number };
  };
  wps?: { employerCR?: string; bankRoutingCode?: string };
  notifyOnCriticalCompliance?: string[];
  updatedAt?: Date | null;
  updatedBy?: string | null;
}

// ============================================================================
// STUDENT SYSTEM (SIS) — see SIS/CLAUDE.md for the Firestore-native data model.
//
// Each collection uses a deterministic document id (shown per interface) that
// stands in for the original spec's SQL UNIQUE(...) constraint: re-importing the
// same logical record overwrites in place (idempotent upsert). Fields here are
// the minimal Phase-0 shape; they are refined in Phase 1 alongside the metrics
// port (and its oracle). All writes are server-side (import Cloud Function);
// clients only read (admin tier).
// ============================================================================

/** sis_students/{studentId} */
export interface Student extends Partial<AuditFields> {
  studentId: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: Date | null;
}

/** sis_enrollments/{studentId}_{year} */
export interface Enrollment extends Partial<AuditFields> {
  studentId: string;
  year: string;
  grade?: Grade | string;
  homeroomClass?: string;
}

/** sis_academic_records/{studentId}_{year}_{subject}_{term} */
export interface AcademicRecord extends Partial<AuditFields> {
  studentId: string;
  year: string;
  subject: Subject | string;
  term: string;
  score?: number;
  grade?: string;
}

/** sis_attendance/{studentId}_{year}_{term} */
export interface AttendanceRecord extends Partial<AuditFields> {
  studentId: string;
  year: string;
  term: string;
  present?: number;
  absent?: number;
  late?: number;
}

/** sis_student_year_metrics/{studentId}_{year} (computed) */
export interface StudentYearMetrics extends Partial<AuditFields> {
  studentId: string;
  year: string;
  attainmentAvg?: number;
  attendanceRate?: number;
}

/** sis_progress_metrics/{studentId}_{transition} (computed, e.g. "2024-2025") */
export interface ProgressMetric extends Partial<AuditFields> {
  studentId: string;
  transition: string;
  delta?: number;
}

/** sis_risk_flags/{studentId}_{year} (computed) */
export interface RiskFlag extends Partial<AuditFields> {
  studentId: string;
  year: string;
  tier?: StudentRiskTier;
  reasons?: string[];
}

/** sis_import_batches/{autoId} */
export interface ImportBatch extends Partial<AuditFields> {
  id: string;
  fileName?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  rowsProcessed?: number;
  error?: string;
}
