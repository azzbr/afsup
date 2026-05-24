// ============================================================================
// MAINTENANCE DOMAIN
// ============================================================================

export const ISSUE_CATEGORIES = [
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
  "Staircases anti slip/yellow tape",
  "Water coolers",
  "Clock",
  "Benches",
  "Canopy",
  "Artificial green grass",
  "Tree branches",
  "AC hose",
  "Rubber/soft mat",
  "Iron Fences",
  "Others",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const LOCATIONS = [
  "B3 Hall Ground", "B3 Hall Up", "B3 KG1", "B3 KG2A", "B3 KG2B", "B3 KG3A", "B3 KG3B", "B3 KG3C", "B3 UnMark Room",
  "B4 Art Room", "B4 Computer Lab", "B4- G4A", "B4- G4B", "B4- G5A", "B4 Hall Ground", "B4 Hall Up", "B4 Library",
  "B4 Multimedia Room", "B4- Remedial Class", "B5 G1A", "B5 G1B", "B5 G2A", "B5 G2B", "B5 G3A", "B5 G3B",
  "B5 G3C", "B5 Hall Ground", "B5 Hall Up", "B5 Teachers Room", "B5 UnMark Room", "B1 Admin Hall Ground",
  "B1 Admin Hall Up", "Principal Office", "Academics Office", "HR Office", "HOA Office", "Accounting Office",
  "Consulor Office", "Registration Office", "Registration Waiting Area", "PE Hall", "Teachers Cabin Eng",
  "Teachers Cabin Arb",
  "Book storeroom", "Security room", "Building #6 first floor", "Building #6 ground floor", "P. E. Hall underground",
  "Multi-Purpose Building", "Science Lab", "Canteen",
] as const;

export type LocationName = (typeof LOCATIONS)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// ============================================================================
// ROLES & USER STATUS
// ============================================================================

export const ROLES = {
  STAFF: "staff",
  MAINTENANCE: "maintenance",
  HR: "hr",
  ADMIN: "admin",
  /** Head Admin — see CLAUDE.md §6 and PHASES.md Phase 2.6. */
  SUPER_ADMIN: "super_admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// User account lifecycle — see CLAUDE.md section 7a
export const USER_STATUSES = ["invited", "pending", "approved", "suspended", "blocked"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// ============================================================================
// BAHRAIN HRIS CONSTANTS
// ============================================================================

export const NATIONALITIES = [
  "Bahraini", "Indian", "Filipino", "British", "Egyptian", "Jordanian", "Pakistani", "Other",
] as const;

export type Nationality = (typeof NATIONALITIES)[number];

export const BAHRAIN_BANKS = [
  "Bank of Bahrain and Kuwait (BBK)",
  "National Bank of Bahrain (NBB)",
  "Ila Bank",
  "Ahli United Bank (AUB)",
  "Kuwait Finance House (KFH)",
  "BenefitPay (IBAN only)",
] as const;

export type BahrainBank = (typeof BAHRAIN_BANKS)[number];

// Bahrain Labor Law 2012 — sick leave tiers (cap 55 days/year)
export const SICK_LEAVE_TIERS = {
  FULL_PAY: 15,
  HALF_PAY: 20,
  NO_PAY: 20,
} as const;

// ============================================================================
// ORGANIZATION STRUCTURE
// ============================================================================

export const DEPARTMENTS = [
  "academic",
  "administration",
  "operations",
  "support",
  "it",
  "maintenance",
  "health",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  academic: "Academic / Teaching",
  administration: "Administration",
  operations: "Operations / Facilities",
  support: "Support Staff",
  it: "IT",
  maintenance: "Maintenance",
  health: "Health Services",
};

// Common school positions. Free-text in the UI; this list is for suggestions.
export const POSITION_SUGGESTIONS = [
  "Principal",
  "Vice Principal",
  "Head of Department",
  "Coordinator",
  "Subject Teacher",
  "Homeroom Teacher",
  "Teaching Assistant",
  "Substitute Teacher",
  "Counselor",
  "Librarian",
  "Administrator",
  "Secretary",
  "Receptionist",
  "IT Support",
  "Accountant",
  "HR Officer",
  "Maintenance Technician",
  "Security Guard",
  "Cleaner",
  "Driver",
  "Nurse",
] as const;

// ============================================================================
// EMPLOYMENT CONTRACTS
// ============================================================================

export const CONTRACT_TYPES = ["permanent", "fixed_term", "part_time", "consultant"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  permanent: "Permanent",
  fixed_term: "Fixed-Term",
  part_time: "Part-Time",
  consultant: "Consultant",
};

// ============================================================================
// TEACHING (school-specific)
// ============================================================================

export const MOE_APPROVAL_STATUSES = [
  "not_required",
  "pending",
  "approved",
  "expired",
  "rejected",
] as const;
export type MoeApprovalStatus = (typeof MOE_APPROVAL_STATUSES)[number];

export const MOE_APPROVAL_LABELS: Record<MoeApprovalStatus, string> = {
  not_required: "Not Required",
  pending: "Pending Review",
  approved: "Approved",
  expired: "Expired",
  rejected: "Rejected",
};

export const SUBJECTS = [
  "Arabic",
  "Islamic Studies",
  "Quran",
  "English",
  "Math",
  "Science",
  "Biology",
  "Chemistry",
  "Physics",
  "Social Studies",
  "ICT / Computer Science",
  "Art",
  "Physical Education",
  "Music",
  "French",
  "Bahraini Civics",
  "Other",
] as const;
export type Subject = (typeof SUBJECTS)[number];

export const GRADES = [
  "KG1", "KG2", "KG3",
  "G1", "G2", "G3", "G4", "G5", "G6",
  "G7", "G8", "G9", "G10", "G11", "G12",
] as const;
export type Grade = (typeof GRADES)[number];

// ============================================================================
// MEDICAL
// ============================================================================

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

// ============================================================================
// LEAVE TYPES (placeholder for Phase 2.5 follow-up; only annual + sick are
// fully wired today — keep the list canonical so UI can grow into it).
// ============================================================================

export const LEAVE_TYPES = [
  "annual",
  "sick",
  "maternity",
  "paternity",
  "hajj",
  "bereavement",
  "study",
  "unpaid",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  hajj: "Hajj Leave",
  bereavement: "Bereavement Leave",
  study: "Study Leave",
  unpaid: "Unpaid Leave",
};
