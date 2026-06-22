import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutTab from "../AboutTab";

describe("AboutTab", () => {
  it("renders the glossary and reuses the risk-tier badges (same labels as Early Warning)", () => {
    render(<AboutTab />);
    expect(screen.getByRole("heading", { name: /Risk tiers/ })).toBeInTheDocument();
    // RiskBadge labels (the exact badge text nodes) for all five tiers.
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Attendance Risk")).toBeInTheDocument();
    expect(screen.getByText("Slipping")).toBeInTheDocument();
    expect(screen.getByText("Hidden Gem")).toBeInTheDocument();
    expect(screen.getByText("On Track")).toBeInTheDocument();
  });
});
