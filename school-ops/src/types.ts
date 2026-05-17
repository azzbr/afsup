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

  // Emergency contact
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyContactAltPhone?: string;

  // Medical
  bloodType?: BloodType;
  allergies?: string;
  medicalConditions?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
}

// ============================================================================
// MAINTENANCE TICKETS
// ============================================================================

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
  | "ticket_sla"
  | "ticket_assigned"
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
