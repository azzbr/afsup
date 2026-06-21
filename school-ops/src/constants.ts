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

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "duplicate", "cancelled"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Two-level category taxonomy (Phase 2.8). Every legacy ISSUE_CATEGORIES
// string appears in exactly one group so old tickets resolve to a group.
// New report UI picks group -> item; old flat strings remain valid.
export const CATEGORY_GROUPS = [
  {
    key: "climate",
    label: "AC & Climate",
    items: [
      "Air conditioners not cooling properly",
      "AC hose",
      "AC noise or vibration",
      "Thermostat or AC remote not working",
    ],
  },
  {
    key: "electrical",
    label: "Electrical & Lighting",
    items: [
      "Lights not working",
      "Damaged electrical sockets",
      "Exposed wiring or electrical hazard",
      "Fan not working",
    ],
  },
  {
    key: "plumbing",
    label: "Plumbing & Water",
    items: [
      "Water leakage (AC or ceiling)",
      "Water coolers",
      "Toilet or bathroom issue",
      "Blocked drain",
      "Low water pressure",
    ],
  },
  {
    key: "furniture",
    label: "Furniture & Fittings",
    items: [
      "Broken furniture (chairs, tables, shelves)",
      "Benches",
      "Broken blinds or curtains",
      "Broken or loose door handles",
      "Clock",
      "Missing or damaged classroom supplies",
    ],
  },
  {
    key: "building",
    label: "Building & Finishes",
    items: [
      "Peeling paint or damaged walls",
      "Loose or hanging ceiling tiles",
      "Staircases anti slip/yellow tape",
      "Rubber/soft mat",
      "Iron Fences",
      "Canopy",
      "Window or glass damage",
      "Door or lock problem",
    ],
  },
  {
    key: "technology",
    label: "Technology",
    items: [
      "Smartboard not functioning",
      "Projector issue",
      "Computer or printer issue",
      "Internet or network problem",
      "PA system or school bell issue",
    ],
  },
  {
    key: "cleaning",
    label: "Cleaning & Hygiene",
    items: [
      "Dirty or unclean areas",
      "Unpleasant odors",
      "Presence of insects or pests",
      "Waste removal needed",
    ],
  },
  {
    key: "grounds",
    label: "Grounds & Outdoor",
    items: [
      "Artificial green grass",
      "Tree branches",
      "Playground equipment",
    ],
  },
  {
    key: "safety",
    label: "Safety Hazard",
    items: ["Safety Hazard (General)"],
  },
  {
    key: "other",
    label: "Other",
    items: ["Others"],
  },
] as const;

export type CategoryGroupKey = (typeof CATEGORY_GROUPS)[number]["key"];

// Reporter-facing severity hints that map to ticket priority (Phase 2.8).
export const IMPACT_LEVELS = [
  { key: "safety", label: "Safety risk", hint: "Someone could get hurt", priority: "high" },
  { key: "blocking", label: "Blocks teaching / work", hint: "A class or task cannot proceed", priority: "high" },
  { key: "annoying", label: "Disruptive but manageable", hint: "Works partially or workaround exists", priority: "medium" },
  { key: "cosmetic", label: "Cosmetic / minor", hint: "Looks bad, nothing blocked", priority: "low" },
] as const;

export type ImpactKey = (typeof IMPACT_LEVELS)[number]["key"];

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

// UI display names. `super_admin` renders as "Head Admin" everywhere — the
// role string stays the internal identifier (CLAUDE.md section 1 naming note).
export const ROLE_LABELS: Record<Role, string> = {
  staff: "Staff",
  maintenance: "Maintenance",
  hr: "HR",
  admin: "Admin",
  super_admin: "Head Admin",
};

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

// ============================================================================
// STUDENT SYSTEM (SIS) — see SIS/CLAUDE.md. Phase 0 defines the risk-tier
// vocabulary so later phases can map flags onto badge colors. Thresholds that
// assign a student to a tier are NOT defined here — they belong to the Phase 1
// metrics port and its oracle.
// ============================================================================

export const STUDENT_RISK_TIERS = [
  "critical",
  "attendance_risk",
  "slipping",
  "hidden_gem",
  "on_track",
] as const;
export type StudentRiskTier = (typeof STUDENT_RISK_TIERS)[number];

export const STUDENT_RISK_LABELS: Record<StudentRiskTier, string> = {
  critical: "Critical",
  attendance_risk: "Attendance Risk",
  slipping: "Slipping",
  hidden_gem: "Hidden Gem",
  on_track: "On Track",
};
