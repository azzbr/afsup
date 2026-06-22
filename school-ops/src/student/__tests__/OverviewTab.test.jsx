import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../data/useSisAnalytics", () => ({
  useSisAnalytics: () => ({
    data: {
      id: "current",
      latestYear: "2024-2025",
      years: ["2023-2024", "2024-2025"],
      kpis: { totalStudents: 3, trackedCohort: 3, atRisk: 1, avgAttainment: 75 },
      cohortTrajectory: [],
      bottleneckGrid: [],
      bottleneckDrops: [{ subject: "ENGLISH", hardestStepIntoGrade: 4, dropPoints: -5 }],
      sectionSpread: [],
      termSlump: [],
      attendanceSummary: { available: false },
      attendanceBands: [],
      subjectProgress: [],
    },
    isLoading: false,
  }),
}));
vi.mock("../../data/useStudentYearMetrics", () => ({
  useStudentYearMetrics: () => ({
    data: [
      { studentId: 1, year: "2023-2024", overall: 70 },
      { studentId: 1, year: "2024-2025", overall: 75 },
    ],
  }),
}));
vi.mock("../../data/useRiskFlags", () => ({
  useRiskFlags: () => ({
    data: [
      { id: "1", studentId: 1, progressIndex: 2.0, tier: "hidden_gem" },
      { id: "2", studentId: 2, progressIndex: -1.8, tier: "slipping" },
    ],
  }),
}));
vi.mock("../../data/useStudents", () => ({
  useStudents: () => ({ data: [{ studentId: 1, name: "TopMover" }, { studentId: 2, name: "Decliner" }] }),
}));

import OverviewTab from "../OverviewTab";

describe("OverviewTab", () => {
  it("renders the biggest bottleneck and Progress-Index movers", () => {
    render(<OverviewTab actor={{ uid: "a", role: "super_admin", status: "approved" }} />);
    expect(screen.getByText(/into Grade 4/)).toBeInTheDocument();
    // Progress Index (not raw delta) drives the movers list.
    expect(screen.getAllByText("+2.00σ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("TopMover").length).toBeGreaterThan(0);
  });
});
