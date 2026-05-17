// Permissions matrix tests — mirrors the table in CLAUDE.md section 6.
// When you add a new Action, add a test for it here.

import { describe, expect, it } from "vitest";
import { can, actorFrom, assignableRoles, canSeeRoleView, type Actor } from "../permissions";

const staff: Actor = { uid: "u-staff", role: "staff", status: "approved" };
const maint: Actor = { uid: "u-maint", role: "maintenance", status: "approved" };
const hr: Actor = { uid: "u-hr", role: "hr", status: "approved" };
const admin: Actor = { uid: "u-admin", role: "admin", status: "approved" };
const viewAll: Actor = { uid: "u-vall", role: "staff", status: "approved", viewAll: true };

const someTicket = { reportedBy: "u-other", status: "open" as const };
const ownTicket = { reportedBy: "u-staff", status: "open" as const };

describe("actorFrom", () => {
  it("returns null for missing user", () => {
    expect(actorFrom(null)).toBeNull();
    expect(actorFrom(undefined)).toBeNull();
  });

  it("returns null for blocked or suspended users", () => {
    expect(actorFrom({ uid: "x", role: "staff", status: "blocked" })).toBeNull();
    expect(actorFrom({ uid: "x", role: "staff", status: "suspended" })).toBeNull();
  });

  it("returns an actor for approved users", () => {
    expect(actorFrom({ uid: "x", role: "staff", status: "approved" })).toMatchObject({ uid: "x", role: "staff" });
  });
});

describe("can() — null actor", () => {
  it("denies everything when actor is null", () => {
    expect(can(null, "ticket.view.all")).toBe(false);
    expect(can(null, "ticket.create")).toBe(false);
    expect(can(undefined, "user.invite")).toBe(false);
  });
});

describe("can() — tickets", () => {
  it("everyone can create a ticket", () => {
    expect(can(staff, "ticket.create")).toBe(true);
    expect(can(maint, "ticket.create")).toBe(true);
    expect(can(hr, "ticket.create")).toBe(true);
    expect(can(admin, "ticket.create")).toBe(true);
  });

  it("only admin/hr/maintenance can view all tickets", () => {
    expect(can(staff, "ticket.view.all")).toBe(false);
    expect(can(maint, "ticket.view.all")).toBe(true);
    expect(can(hr, "ticket.view.all")).toBe(true);
    expect(can(admin, "ticket.view.all")).toBe(true);
  });

  it("only maintenance/admin can update ticket status", () => {
    expect(can(staff, "ticket.update.status")).toBe(false);
    expect(can(hr, "ticket.update.status")).toBe(false);
    expect(can(maint, "ticket.update.status")).toBe(true);
    expect(can(admin, "ticket.update.status")).toBe(true);
  });

  it("only HR/admin can escalate priority", () => {
    expect(can(staff, "ticket.escalate")).toBe(false);
    expect(can(maint, "ticket.escalate")).toBe(false);
    expect(can(hr, "ticket.escalate")).toBe(true);
    expect(can(admin, "ticket.escalate")).toBe(true);
  });

  it("only admin can delete tickets", () => {
    expect(can(hr, "ticket.delete")).toBe(false);
    expect(can(maint, "ticket.delete")).toBe(false);
    expect(can(admin, "ticket.delete")).toBe(true);
  });

  it("ticket.view.own is true regardless of who reported", () => {
    expect(can(staff, "ticket.view.own", { type: "ticket", data: ownTicket })).toBe(true);
    expect(can(staff, "ticket.view.own", { type: "ticket", data: someTicket })).toBe(true);
  });
});

describe("can() — user profiles", () => {
  it("any user can view own profile", () => {
    expect(can(staff, "user.view.own")).toBe(true);
    expect(can(admin, "user.view.own")).toBe(true);
  });

  it("staff can only see other staff", () => {
    expect(can(staff, "user.view.profile", { type: "user", data: { uid: "x", role: "staff" } })).toBe(true);
    expect(can(staff, "user.view.profile", { type: "user", data: { uid: "x", role: "maintenance" } })).toBe(false);
    expect(can(staff, "user.view.profile", { type: "user", data: { uid: "x", role: "hr" } })).toBe(false);
    expect(can(staff, "user.view.profile", { type: "user", data: { uid: "x", role: "admin" } })).toBe(false);
  });

  it("maintenance can see staff and maintenance", () => {
    expect(can(maint, "user.view.profile", { type: "user", data: { uid: "x", role: "staff" } })).toBe(true);
    expect(can(maint, "user.view.profile", { type: "user", data: { uid: "x", role: "maintenance" } })).toBe(true);
    expect(can(maint, "user.view.profile", { type: "user", data: { uid: "x", role: "hr" } })).toBe(false);
    expect(can(maint, "user.view.profile", { type: "user", data: { uid: "x", role: "admin" } })).toBe(false);
  });

  it("HR can see everyone except admins", () => {
    expect(can(hr, "user.view.profile", { type: "user", data: { uid: "x", role: "staff" } })).toBe(true);
    expect(can(hr, "user.view.profile", { type: "user", data: { uid: "x", role: "maintenance" } })).toBe(true);
    expect(can(hr, "user.view.profile", { type: "user", data: { uid: "x", role: "hr" } })).toBe(true);
    expect(can(hr, "user.view.profile", { type: "user", data: { uid: "x", role: "admin" } })).toBe(false);
  });

  it("admin sees everyone", () => {
    for (const r of ["staff", "maintenance", "hr", "admin"] as const) {
      expect(can(admin, "user.view.profile", { type: "user", data: { uid: "x", role: r } })).toBe(true);
    }
  });

  it("anyone can see their own profile regardless of role visibility", () => {
    expect(can(staff, "user.view.profile", { type: "user", data: { uid: "u-staff", role: "staff" } })).toBe(true);
  });
});

describe("can() — privileged edits", () => {
  it("only HR/admin can edit salary or leave balance", () => {
    expect(can(staff, "user.edit.salary")).toBe(false);
    expect(can(maint, "user.edit.salary")).toBe(false);
    expect(can(hr, "user.edit.salary")).toBe(true);
    expect(can(admin, "user.edit.salary")).toBe(true);

    expect(can(staff, "user.edit.leaveBalance")).toBe(false);
    expect(can(hr, "user.edit.leaveBalance")).toBe(true);
  });

  it("HR cannot change role/status of an admin", () => {
    expect(can(hr, "user.edit.role", { type: "user", data: { uid: "x", role: "admin" } })).toBe(false);
    expect(can(hr, "user.edit.status", { type: "user", data: { uid: "x", role: "admin" } })).toBe(false);
  });

  it("HR can change role/status of non-admins", () => {
    expect(can(hr, "user.edit.role", { type: "user", data: { uid: "x", role: "staff" } })).toBe(true);
    expect(can(hr, "user.edit.role", { type: "user", data: { uid: "x", role: "maintenance" } })).toBe(true);
    expect(can(hr, "user.edit.role", { type: "user", data: { uid: "x", role: "hr" } })).toBe(true);
  });

  it("admin can change anyone", () => {
    expect(can(admin, "user.edit.role", { type: "user", data: { uid: "x", role: "admin" } })).toBe(true);
  });

  it("only HR/admin can invite users", () => {
    expect(can(staff, "user.invite")).toBe(false);
    expect(can(maint, "user.invite")).toBe(false);
    expect(can(hr, "user.invite")).toBe(true);
    expect(can(admin, "user.invite")).toBe(true);
  });

  it("only admin can delete users", () => {
    expect(can(hr, "user.delete")).toBe(false);
    expect(can(admin, "user.delete")).toBe(true);
  });
});

describe("can() — schedules", () => {
  it("only admin manages scheduled tasks", () => {
    for (const action of ["schedule.create", "schedule.update", "schedule.delete"] as const) {
      expect(can(staff, action)).toBe(false);
      expect(can(maint, action)).toBe(false);
      expect(can(hr, action)).toBe(false);
      expect(can(admin, action)).toBe(true);
    }
  });
});

describe("can() — leave requests", () => {
  it("anyone can submit own leave", () => {
    expect(can(staff, "leave.submit")).toBe(true);
    expect(can(admin, "leave.submit")).toBe(true);
  });

  it("only HR/admin approve leave", () => {
    expect(can(staff, "leave.approve")).toBe(false);
    expect(can(maint, "leave.approve")).toBe(false);
    expect(can(hr, "leave.approve")).toBe(true);
    expect(can(admin, "leave.approve")).toBe(true);
  });
});

describe("can() — viewAll override", () => {
  it("viewAll grants admin-equivalent UI access", () => {
    expect(can(viewAll, "ticket.delete")).toBe(true);
    expect(can(viewAll, "user.view.profile", { type: "user", data: { uid: "x", role: "admin" } })).toBe(true);
  });
});

describe("canSeeRoleView", () => {
  it("everyone sees the staff submit-ticket tab", () => {
    expect(canSeeRoleView(staff, "staff")).toBe(true);
    expect(canSeeRoleView(maint, "staff")).toBe(true);
    expect(canSeeRoleView(hr, "staff")).toBe(true);
    expect(canSeeRoleView(admin, "staff")).toBe(true);
  });

  it("maintenance tab visible to maintenance/hr/admin", () => {
    expect(canSeeRoleView(staff, "maintenance")).toBe(false);
    expect(canSeeRoleView(maint, "maintenance")).toBe(true);
    expect(canSeeRoleView(hr, "maintenance")).toBe(true);
    expect(canSeeRoleView(admin, "maintenance")).toBe(true);
  });

  it("HR tab visible to hr and admin only", () => {
    expect(canSeeRoleView(staff, "hr")).toBe(false);
    expect(canSeeRoleView(maint, "hr")).toBe(false);
    expect(canSeeRoleView(hr, "hr")).toBe(true);
    expect(canSeeRoleView(admin, "hr")).toBe(true);
  });

  it("admin tab visible to admin only", () => {
    expect(canSeeRoleView(hr, "admin")).toBe(false);
    expect(canSeeRoleView(maint, "admin")).toBe(false);
    expect(canSeeRoleView(admin, "admin")).toBe(true);
  });

  it("viewAll grants admin-tab access", () => {
    expect(canSeeRoleView(viewAll, "admin")).toBe(true);
  });

  it("denies everything when actor is null", () => {
    expect(canSeeRoleView(null, "staff")).toBe(false);
    expect(canSeeRoleView(null, "admin")).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("admin can assign any role", () => {
    expect(assignableRoles(admin)).toEqual(["staff", "maintenance", "hr", "admin"]);
  });

  it("HR can assign non-admin roles only", () => {
    expect(assignableRoles(hr)).toEqual(["staff", "maintenance", "hr"]);
  });

  it("staff/maintenance cannot assign roles", () => {
    expect(assignableRoles(staff)).toEqual([]);
    expect(assignableRoles(maint)).toEqual([]);
  });

  it("returns empty for null actor", () => {
    expect(assignableRoles(null)).toEqual([]);
  });
});
