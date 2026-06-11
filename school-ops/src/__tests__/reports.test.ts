import { describe, expect, it } from "vitest";
import {
  staffMasterRows,
  headcountRows,
  leaveBalancesRows,
  payrollSummaryRows,
  moeTeacherRosterRows,
  dataCompletenessRows,
  joinersLeaversRows,
  emergencyContactRows,
  staffMasterReport,
  joinersLeaversReport,
} from "../hr/reports";
import type { User } from "../types";

function u(partial: Partial<User>): User {
  return { uid: "x", email: "x@afs.edu.bh", role: "staff", status: "approved", ...partial } as User;
}

describe("staffMasterRows", () => {
  const employee = u({
    uid: "a",
    displayName: "Aisha Khan",
    basicSalary: 600,
    housingAllowance: 100,
    transportAllowance: 30,
    phoneAllowance: 20,
  });

  it("excludes salary columns by default", () => {
    const t = staffMasterRows([employee]);
    expect(t.header).not.toContain("Basic Salary");
    expect(t.header).not.toContain("Gross");
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toHaveLength(t.header.length);
  });

  it("appends salary columns and gross when includeSalary is set", () => {
    const t = staffMasterRows([employee], { includeSalary: true });
    expect(t.header).toContain("Basic Salary");
    const grossIdx = t.header.indexOf("Gross");
    expect(grossIdx).toBeGreaterThan(-1);
    expect(t.rows[0][grossIdx]).toBe("750.000"); // 600 + 100 + 30 + 20
    expect(t.rows[0][t.header.indexOf("Basic Salary")]).toBe("600.000");
  });

  it("includes all statuses with a status column", () => {
    const t = staffMasterRows([employee, u({ uid: "b", status: "suspended" })]);
    expect(t.rows).toHaveLength(2);
    const statusIdx = t.header.indexOf("Status");
    expect(t.rows.map((r) => r[statusIdx])).toContain("suspended");
  });

  it("report filename stem is staff_master", () => {
    expect(staffMasterReport([employee]).filename).toMatch(/^staff_master_/);
  });
});

describe("headcountRows", () => {
  it("computes Bahrainization rate over active employees only", () => {
    const users = [
      u({ uid: "a", nationality: "Bahraini" }),
      u({ uid: "b", nationality: "Bahraini" }),
      u({ uid: "c", nationality: "Indian" }),
      u({ uid: "d", nationality: "Filipino" }),
      u({ uid: "e", nationality: "Bahraini", status: "suspended" }), // excluded
    ];
    const t = headcountRows(users);
    const row = t.rows.find((r) => r[1] === "Bahrainization rate");
    expect(row).toBeDefined();
    expect(row![2]).toBe(2);
    expect(row![3]).toBe("50.0"); // 2 of 4 active
  });

  it("reports total active headcount at 100%", () => {
    const t = headcountRows([u({ uid: "a" }), u({ uid: "b", status: "blocked" })]);
    expect(t.rows[0]).toEqual(["Total active headcount", "", 1, "100.0"]);
  });
});

describe("leaveBalancesRows", () => {
  it("derives remaining from legacy annualLeaveBalance", () => {
    const t = leaveBalancesRows([u({ uid: "a", displayName: "Omar", annualLeaveBalance: 12 })]);
    const annual = t.rows.find((r) => r[0] === "Omar" && r[2] === "Annual Leave");
    expect(annual).toBeDefined();
    expect(annual![3]).toBe(30); // entitled
    expect(annual![4]).toBe(18); // used = 30 - 12
    expect(annual![5]).toBe(12); // remaining
    expect(annual![6]).toBe(""); // no flag
  });

  it("flags LOW and EXHAUSTED annual balances", () => {
    const t = leaveBalancesRows([
      u({ uid: "low", displayName: "Low", annualLeaveBalance: 2 }),
      u({ uid: "out", displayName: "Out", annualLeaveBalance: 0 }),
    ]);
    const lowRow = t.rows.find((r) => r[0] === "Low" && r[2] === "Annual Leave");
    const outRow = t.rows.find((r) => r[0] === "Out" && r[2] === "Annual Leave");
    expect(lowRow![6]).toBe("LOW");
    expect(outRow![6]).toBe("EXHAUSTED");
  });

  it("always includes annual + sick, skips inactive other types", () => {
    const t = leaveBalancesRows([u({ uid: "a", displayName: "Omar" })]);
    const types = t.rows.map((r) => r[2]);
    expect(types).toContain("Annual Leave");
    expect(types).toContain("Sick Leave");
    expect(types).not.toContain("Study Leave"); // entitled 0, used 0
  });
});

describe("payrollSummaryRows", () => {
  it("applies GOSI rates by nationality and totals the roster", () => {
    const users = [
      u({ uid: "bh", displayName: "Bahraini Emp", nationality: "Bahraini", basicSalary: 1000, housingAllowance: 100 }),
      u({ uid: "ex", displayName: "Expat Emp", nationality: "Indian", basicSalary: 500 }),
    ];
    const t = payrollSummaryRows(users);
    const bh = t.rows.find((r) => r[0] === "Bahraini Emp")!;
    expect(bh[2]).toBe("Bahraini");
    expect(bh[7]).toBe("1100.000"); // gross
    expect(bh[8]).toBe("80.000"); // employee GOSI 8% of basic
    expect(bh[9]).toBe("1020.000"); // net
    expect(bh[10]).toBe("170.000"); // employer GOSI 17% of basic
    expect(bh[11]).toBe("1270.000"); // total cost

    const ex = t.rows.find((r) => r[0] === "Expat Emp")!;
    expect(ex[2]).toBe("Expat");
    expect(ex[8]).toBe("5.000"); // 1% of 500
    expect(ex[9]).toBe("495.000");
    expect(ex[10]).toBe("15.000"); // 3% of 500
    expect(ex[11]).toBe("515.000");

    const totals = t.rows[t.rows.length - 1];
    expect(totals[0]).toBe("TOTAL");
    expect(totals[3]).toBe("1500.000"); // basic
    expect(totals[11]).toBe("1785.000"); // 1270 + 515
  });

  it("skips employees without a basic salary", () => {
    const t = payrollSummaryRows([u({ uid: "a", displayName: "No Pay" })]);
    expect(t.rows.find((r) => r[0] === "No Pay")).toBeUndefined();
  });
});

describe("moeTeacherRosterRows", () => {
  it("includes only active teachers, sorted by name", () => {
    const users = [
      u({ uid: "t2", displayName: "Zara", isTeacher: true, moeApprovalStatus: "approved" }),
      u({ uid: "t1", displayName: "Ali", isTeacher: true }),
      u({ uid: "n1", displayName: "Not Teacher" }),
      u({ uid: "t3", displayName: "Suspended Teacher", isTeacher: true, status: "suspended" }),
    ];
    const t = moeTeacherRosterRows(users);
    expect(t.rows.map((r) => r[0])).toEqual(["Ali", "Zara"]);
    const zara = t.rows.find((r) => r[0] === "Zara")!;
    expect(zara[9]).toBe("Approved"); // MOE_APPROVAL_LABELS
  });
});

describe("dataCompletenessRows", () => {
  it("flags a missing or non-BH IBAN", () => {
    const t = dataCompletenessRows([
      u({ uid: "a", displayName: "No Iban" }),
      u({ uid: "b", displayName: "Bad Iban", iban: "AE070331234567890123456" }),
    ]);
    const noIban = t.rows.find((r) => r[0] === "No Iban")!;
    const badIban = t.rows.find((r) => r[0] === "Bad Iban")!;
    expect(String(noIban[4])).toContain("IBAN");
    expect(String(badIban[4])).toContain("IBAN");
  });

  it("excludes employees with nothing missing", () => {
    const complete = u({
      uid: "ok",
      displayName: "Complete",
      nationality: "Bahraini",
      arabicName: "Arabic",
      iban: "BH67BMAG00001299123456",
      cprNumber: "880101123",
      cprExpiry: new Date("2027-01-01"),
      passportNumber: "P1234567",
      passportExpiry: new Date("2028-01-01"),
      dateOfBirth: new Date("1988-01-01"),
      emergencyContactName: "Contact",
      emergencyContactPhone: "33001100",
      department: "academic",
      position: "Teacher Aide",
      dateOfJoining: new Date("2022-09-01"),
      documents: { cpr: "https://example.com/cpr.pdf" },
    });
    const t = dataCompletenessRows([complete, u({ uid: "bad", displayName: "Incomplete" })]);
    expect(t.rows.find((r) => r[0] === "Complete")).toBeUndefined();
    expect(t.rows.find((r) => r[0] === "Incomplete")).toBeDefined();
  });
});

describe("joinersLeaversRows", () => {
  const from = new Date("2026-01-01");
  const to = new Date("2026-01-31");

  it("filters joiners and leavers to the inclusive range", () => {
    const users = [
      u({ uid: "j1", displayName: "Jan Joiner", dateOfJoining: new Date("2026-01-15"), contractType: "permanent" }),
      u({ uid: "j2", displayName: "Boundary Joiner", dateOfJoining: new Date("2026-01-31") }),
      u({ uid: "j3", displayName: "Feb Joiner", dateOfJoining: new Date("2026-02-02") }),
      u({
        uid: "l1",
        displayName: "Jan Leaver",
        status: "blocked",
        dateOfJoining: new Date("2024-09-01"),
        separationDate: new Date("2026-01-10"),
        separationReason: "Resigned",
      }),
    ];
    const t = joinersLeaversRows(users, from, to);
    const joined = t.rows.filter((r) => r[0] === "JOINED" && r[1] !== "TOTAL");
    const left = t.rows.filter((r) => r[0] === "LEFT" && r[1] !== "TOTAL");
    expect(joined.map((r) => r[1])).toEqual(["Jan Joiner", "Boundary Joiner"]);
    expect(left.map((r) => r[1])).toEqual(["Jan Leaver"]);
    expect(left[0][5]).toBe("Resigned"); // detail = separation reason
    expect(joined[0][5]).toBe("Permanent"); // detail = contract type label

    const joinedTotal = t.rows.find((r) => r[0] === "JOINED" && r[1] === "TOTAL")!;
    const leftTotal = t.rows.find((r) => r[0] === "LEFT" && r[1] === "TOTAL")!;
    expect(joinedTotal[5]).toBe(2);
    expect(leftTotal[5]).toBe(1);
  });

  it("report filename stem is joiners_leavers", () => {
    expect(joinersLeaversReport([], from, to).filename).toMatch(/^joiners_leavers_/);
  });
});

describe("emergencyContactRows", () => {
  it("fills home-country columns for expats only", () => {
    const users = [
      u({
        uid: "bh",
        displayName: "Bahraini Emp",
        nationality: "Bahraini",
        homeCountryEmergency1Name: "Should Not Show",
        homeCountryEmergency1Phone: "000",
      }),
      u({
        uid: "ex",
        displayName: "Expat Emp",
        nationality: "Indian",
        homeCountryEmergency1Name: "Ravi",
        homeCountryEmergency1Phone: "+91 98765",
        homeCountryEmergency1Relationship: "Brother",
      }),
    ];
    const t = emergencyContactRows(users);
    const nameIdx = t.header.indexOf("Home Country Contact");
    const bh = t.rows.find((r) => r[0] === "Bahraini Emp")!;
    const ex = t.rows.find((r) => r[0] === "Expat Emp")!;
    expect(bh[nameIdx]).toBe("");
    expect(bh[nameIdx + 1]).toBe("");
    expect(ex[nameIdx]).toBe("Ravi");
    expect(ex[nameIdx + 2]).toBe("Brother");
  });

  it("sorts by department then name and includes active employees only", () => {
    const users = [
      u({ uid: "b", displayName: "Zed", department: "academic" }),
      u({ uid: "a", displayName: "Amal", department: "academic" }),
      u({ uid: "c", displayName: "Adm", department: "administration" }),
      u({ uid: "d", displayName: "Gone", status: "blocked" }),
    ];
    const t = emergencyContactRows(users);
    expect(t.rows.map((r) => r[0])).toEqual(["Amal", "Zed", "Adm"]);
  });
});
