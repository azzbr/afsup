import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// Mock the data hooks (resolved to the same modules the component imports).
vi.mock("../../data/useRiskFlags", () => ({
  useRiskFlags: () => ({
    data: [
      { id: "7_2024-2025", studentId: 7, year: "2024-2025", grade: 3, section: "B", overall: 88, progressIndex: 1.3, daysAbsent: 1, tier: "hidden_gem", signals: "progress +1.3σ; avg 88.0" },
      { id: "3_2024-2025", studentId: 3, year: "2024-2025", grade: 4, section: "A", overall: 55, progressIndex: -1.4, daysAbsent: 18, tier: "critical", signals: "progress -1.4σ; 18 absences; avg 55.0" },
      { id: "9_2024-2025", studentId: 9, year: "2024-2025", grade: 5, section: "A", overall: 62, progressIndex: 0.1, daysAbsent: 14, tier: "attendance_risk", signals: "14 absences; avg 62.0" },
    ],
    isLoading: false,
  }),
}));
vi.mock("../../data/useStudents", () => ({
  useStudents: () => ({ data: [{ studentId: 3, name: "Cara" }, { studentId: 7, name: "Gus" }, { studentId: 9, name: "Iris" }] }),
}));

import EarlyWarningTab from "../EarlyWarningTab";

const ADMIN = { uid: "a", role: "super_admin", status: "approved" };

describe("EarlyWarningTab", () => {
  it("sorts by tier priority (critical first) and joins student names", () => {
    render(<EarlyWarningTab actor={ADMIN} />);
    const rows = screen.getAllByRole("row");
    // rows[0] = header; rows[1] = highest-priority tier (critical => Cara)
    expect(within(rows[1]).getByText("Cara")).toBeInTheDocument();
  });

  it("filters the register when a tier button is toggled", () => {
    render(<EarlyWarningTab actor={ADMIN} />);
    fireEvent.click(screen.getByRole("button", { name: /Hidden Gem/ }));
    expect(screen.getByText("Gus")).toBeInTheDocument();
    expect(screen.queryByText("Cara")).not.toBeInTheDocument();
  });
});
