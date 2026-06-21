// Canonical SIS early-warning risk tiers. Defined inside the SIS module so the
// metrics engine (ported into the import Cloud Function) has ZERO dependency on
// the client constants barrel — keeping the whole sis/ subtree self-contained.
// school-ops/src/constants.ts re-exports these for the UI.

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
