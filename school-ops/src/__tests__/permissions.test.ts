// Permissions matrix tests — mirrors the table in CLAUDE.md section 6.
// When you add a new Action, add a test for it here.
//
// Phase 2.9.1 HR privacy lockdown: `hr` owns people data, `admin` owns
// operations, and the two are disjoint peers under super_admin. Tests that
// previously asserted admin's old HR grants were updated deliberately.

import { describe, expect, it } from "vitest";
import { can, actorFrom, assignableRoles, canSeeRoleView, isAdminTierRole, type Actor } from "../permissions";

const staff: Actor = { uid: "u-staff", role: "staff", status: "approved" };
const maint: Actor = { uid: "u-maint", role: "maintenance", status: "approved" };
const hr: Actor = { uid: "u-hr", role: "hr", status: "approved" };
const admin: Actor = { uid: "u-admin", role: "admin", status: "approved" };
const superAdmin: Actor = { uid: "u-super", role: "super_admin", status: "approved" };
const viewAll: Actor = { uid: "u-vall", role: "staff", status: "approved", viewAll: true };

const allActors = { staff, maint, hr, admin, superAdmin, viewAll };

const someTicket = { reportedBy: "u-other", status: "open" as const };
const ownTicket = { reportedBy: "u-staff", status: "open" as const };

const target = (role: Actor["role"], uid = "x") => ({ type: "user" as const, data: { uid, role } });

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

describe("isAdminTierRole", () => {
  it("is true for admin and super_admin only", () => {
    expect(isAdminTierRole("admin")).toBe(true);
    expect(isAdminTierRole("super_admin")).toBe(true);
    expect(isAdminTierRole("staff")).toBe(false);
    expect(isAdminTierRole("maintenance")).toBe(false);
    expect(isAdminTierRole("hr")).toBe(false);
  });

  it("is false for missing or unknown roles", () => {
    expect(isAdminTierRole(null)).toBe(false);
    expect(isAdminTierRole(undefined)).toBe(false);
    expect(isAdminTierRole("")).toBe(false);
    expect(isAdminTierRole("principal")).toBe(false);
  });
});

describe("can() — null actor", () => {
  it("denies everything when actor is null", () => {
    expect(can(null, "ticket.view.all")).toBe(false);
    expect(can(null, "ticket.create")).toBe(false);
    expect(can(undefined, "user.invite")).toBe(false);
    expect(can(null, "settings.edit")).toBe(false);
    expect(can(null, "user.manageAdmins")).toBe(false);
  });
});

describe("can() — tickets", () => {
  it("everyone can create a ticket", () => {
    for (const actor of Object.values(allActors)) {
      expect(can(actor, "ticket.create")).toBe(true);
    }
  });

  it("only admin/hr/maintenance can view all tickets", () => {
    expect(can(staff, "ticket.view.all")).toBe(false);
    expect(can(maint, "ticket.view.all")).toBe(true);
    expect(can(hr, "ticket.view.all")).toBe(true);
    expect(can(admin, "ticket.view.all")).toBe(true);
    expect(can(superAdmin, "ticket.view.all")).toBe(true);
  });

  it("only maintenance/admin can update ticket status", () => {
    expect(can(staff, "ticket.update.status")).toBe(false);
    expect(can(hr, "ticket.update.status")).toBe(false);
    expect(can(maint, "ticket.update.status")).toBe(true);
    expect(can(admin, "ticket.update.status")).toBe(true);
    expect(can(superAdmin, "ticket.update.status")).toBe(true);
  });

  it("only HR/admin can escalate priority", () => {
    expect(can(staff, "ticket.escalate")).toBe(false);
    expect(can(maint, "ticket.escalate")).toBe(false);
    expect(can(hr, "ticket.escalate")).toBe(true);
    expect(can(admin, "ticket.escalate")).toBe(true);
    expect(can(superAdmin, "ticket.escalate")).toBe(true);
  });

  it("only admin can delete tickets", () => {
    expect(can(staff, "ticket.delete")).toBe(false);
    expect(can(hr, "ticket.delete")).toBe(false);
    expect(can(maint, "ticket.delete")).toBe(false);
    expect(can(admin, "ticket.delete")).toBe(true);
    expect(can(superAdmin, "ticket.delete")).toBe(true);
  });

  it("ticket.cancel is admin-equivalent", () => {
    expect(can(staff, "ticket.cancel")).toBe(false);
    expect(can(maint, "ticket.cancel")).toBe(false);
    expect(can(hr, "ticket.cancel")).toBe(false);
    expect(can(admin, "ticket.cancel")).toBe(true);
    expect(can(superAdmin, "ticket.cancel")).toBe(true);
    expect(can(viewAll, "ticket.cancel")).toBe(true);
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
    expect(can(superAdmin, "user.view.own")).toBe(true);
  });

  it("staff can only see other staff", () => {
    expect(can(staff, "user.view.profile", target("staff"))).toBe(true);
    expect(can(staff, "user.view.profile", target("maintenance"))).toBe(false);
    expect(can(staff, "user.view.profile", target("hr"))).toBe(false);
    expect(can(staff, "user.view.profile", target("admin"))).toBe(false);
    expect(can(staff, "user.view.profile", target("super_admin"))).toBe(false);
  });

  it("maintenance can see staff and maintenance", () => {
    expect(can(maint, "user.view.profile", target("staff"))).toBe(true);
    expect(can(maint, "user.view.profile", target("maintenance"))).toBe(true);
    expect(can(maint, "user.view.profile", target("hr"))).toBe(false);
    expect(can(maint, "user.view.profile", target("admin"))).toBe(false);
    expect(can(maint, "user.view.profile", target("super_admin"))).toBe(false);
  });

  it("HR can see everyone except the admin tier", () => {
    expect(can(hr, "user.view.profile", target("staff"))).toBe(true);
    expect(can(hr, "user.view.profile", target("maintenance"))).toBe(true);
    expect(can(hr, "user.view.profile", target("hr"))).toBe(true);
    expect(can(hr, "user.view.profile", target("admin"))).toBe(false);
    expect(can(hr, "user.view.profile", target("super_admin"))).toBe(false);
  });

  it("plain admin sees staff/maintenance/admin-peer targets — hr and super_admin are out", () => {
    expect(can(admin, "user.view.profile", target("staff"))).toBe(true);
    expect(can(admin, "user.view.profile", target("maintenance"))).toBe(true);
    expect(can(admin, "user.view.profile", target("admin"))).toBe(true);
    expect(can(admin, "user.view.profile", target("hr"))).toBe(false);
    expect(can(admin, "user.view.profile", target("super_admin"))).toBe(false);
    expect(can(admin, "user.view.profile", target("admin", "u-admin"))).toBe(true);
  });

  it("super_admin sees every profile", () => {
    for (const r of ["staff", "maintenance", "hr", "admin", "super_admin"] as const) {
      expect(can(superAdmin, "user.view.profile", target(r))).toBe(true);
    }
  });

  it("anyone can see their own profile regardless of role visibility", () => {
    expect(can(staff, "user.view.profile", target("staff", "u-staff"))).toBe(true);
    expect(can(admin, "user.view.profile", target("admin", "u-admin"))).toBe(true);
  });
});

describe("can() — privileged edits", () => {
  it("only hr/super_admin can edit salary or leave balance (no target probe)", () => {
    expect(can(staff, "user.edit.salary")).toBe(false);
    expect(can(maint, "user.edit.salary")).toBe(false);
    expect(can(admin, "user.edit.salary")).toBe(false);
    expect(can(viewAll, "user.edit.salary")).toBe(false);
    expect(can(hr, "user.edit.salary")).toBe(true);
    expect(can(superAdmin, "user.edit.salary")).toBe(true);

    expect(can(staff, "user.edit.leaveBalance")).toBe(false);
    expect(can(admin, "user.edit.leaveBalance")).toBe(false);
    expect(can(hr, "user.edit.leaveBalance")).toBe(true);
  });

  it("plain admin and viewAll can NEVER edit salary or leave balance of any target", () => {
    for (const action of ["user.edit.salary", "user.edit.leaveBalance"] as const) {
      for (const r of ["staff", "maintenance", "hr", "admin", "super_admin"] as const) {
        expect(can(admin, action, target(r))).toBe(false);
        expect(can(viewAll, action, target(r))).toBe(false);
      }
    }
  });

  it("salary/leave balance of admin-tier targets is super_admin only", () => {
    for (const action of ["user.edit.salary", "user.edit.leaveBalance"] as const) {
      for (const tier of ["admin", "super_admin"] as const) {
        expect(can(hr, action, target(tier))).toBe(false);
        expect(can(superAdmin, action, target(tier))).toBe(true);
      }
      expect(can(hr, action, target("staff"))).toBe(true);
      expect(can(hr, action, target("hr"))).toBe(true);
      expect(can(superAdmin, action, target("staff"))).toBe(true);
    }
  });

  it("no one may edit their OWN salary or leave balance", () => {
    for (const action of ["user.edit.salary", "user.edit.leaveBalance"] as const) {
      expect(can(hr, action, target("hr", "u-hr"))).toBe(false);
      expect(can(admin, action, target("admin", "u-admin"))).toBe(false);
      expect(can(superAdmin, action, target("super_admin", "u-super"))).toBe(false);
      expect(can(viewAll, action, target("staff", "u-vall"))).toBe(false);
    }
  });

  it("HR cannot change role/status of admins or super_admins", () => {
    for (const tier of ["admin", "super_admin"] as const) {
      expect(can(hr, "user.edit.role", target(tier))).toBe(false);
      expect(can(hr, "user.edit.status", target(tier))).toBe(false);
    }
  });

  it("HR can change role/status of non-admins", () => {
    expect(can(hr, "user.edit.role", target("staff"))).toBe(true);
    expect(can(hr, "user.edit.role", target("maintenance"))).toBe(true);
    expect(can(hr, "user.edit.role", target("hr"))).toBe(true);
  });

  it("plain admin changes role/status of staff/maintenance only", () => {
    expect(can(admin, "user.edit.role", target("staff"))).toBe(true);
    expect(can(admin, "user.edit.role", target("maintenance"))).toBe(true);
    expect(can(admin, "user.edit.status", target("staff"))).toBe(true);
    expect(can(admin, "user.edit.role", target("hr"))).toBe(false);
    expect(can(admin, "user.edit.status", target("hr"))).toBe(false);
    for (const tier of ["admin", "super_admin"] as const) {
      expect(can(admin, "user.edit.role", target(tier))).toBe(false);
      expect(can(admin, "user.edit.status", target(tier))).toBe(false);
      expect(can(viewAll, "user.edit.role", target(tier))).toBe(false);
    }
  });

  it("super_admin can change role/status of anyone", () => {
    for (const r of ["staff", "maintenance", "hr", "admin", "super_admin"] as const) {
      expect(can(superAdmin, "user.edit.role", target(r))).toBe(true);
      expect(can(superAdmin, "user.edit.status", target(r))).toBe(true);
    }
  });

  it("role/status capability probe (no target) is manager-level", () => {
    expect(can(staff, "user.edit.role")).toBe(false);
    expect(can(maint, "user.edit.role")).toBe(false);
    expect(can(hr, "user.edit.role")).toBe(true);
    expect(can(admin, "user.edit.status")).toBe(true);
    expect(can(superAdmin, "user.edit.status")).toBe(true);
  });

  it("only HR/admin can invite users", () => {
    expect(can(staff, "user.invite")).toBe(false);
    expect(can(maint, "user.invite")).toBe(false);
    expect(can(hr, "user.invite")).toBe(true);
    expect(can(admin, "user.invite")).toBe(true);
    expect(can(superAdmin, "user.invite")).toBe(true);
  });

  it("only admin can delete users (capability probe)", () => {
    expect(can(staff, "user.delete")).toBe(false);
    expect(can(hr, "user.delete")).toBe(false);
    expect(can(admin, "user.delete")).toBe(true);
    expect(can(superAdmin, "user.delete")).toBe(true);
  });

  it("plain admin deletes staff/maintenance targets only", () => {
    expect(can(admin, "user.delete", target("staff"))).toBe(true);
    expect(can(admin, "user.delete", target("maintenance"))).toBe(true);
    expect(can(admin, "user.delete", target("hr"))).toBe(false);
    expect(can(viewAll, "user.delete", target("hr"))).toBe(false);
  });

  it("deleting an hr, admin or super_admin user is super_admin only", () => {
    for (const r of ["hr", "admin", "super_admin"] as const) {
      expect(can(admin, "user.delete", target(r))).toBe(false);
      expect(can(viewAll, "user.delete", target(r))).toBe(false);
      expect(can(hr, "user.delete", target(r))).toBe(false);
      expect(can(superAdmin, "user.delete", target(r))).toBe(true);
    }
  });

  it("user.manageAdmins is super_admin only", () => {
    expect(can(staff, "user.manageAdmins")).toBe(false);
    expect(can(maint, "user.manageAdmins")).toBe(false);
    expect(can(hr, "user.manageAdmins")).toBe(false);
    expect(can(admin, "user.manageAdmins")).toBe(false);
    expect(can(viewAll, "user.manageAdmins")).toBe(false);
    expect(can(superAdmin, "user.manageAdmins")).toBe(true);
  });
});

describe("can() — schedules", () => {
  it("only admin manages scheduled tasks", () => {
    for (const action of ["schedule.create", "schedule.update", "schedule.delete"] as const) {
      expect(can(staff, action)).toBe(false);
      expect(can(maint, action)).toBe(false);
      expect(can(hr, action)).toBe(false);
      expect(can(admin, action)).toBe(true);
      expect(can(superAdmin, action)).toBe(true);
    }
  });
});

describe("can() — leave requests", () => {
  it("anyone can submit own leave", () => {
    expect(can(staff, "leave.submit")).toBe(true);
    expect(can(admin, "leave.submit")).toBe(true);
    expect(can(superAdmin, "leave.submit")).toBe(true);
  });

  it("only hr/super_admin approve leave — plain admin is out", () => {
    expect(can(staff, "leave.approve")).toBe(false);
    expect(can(maint, "leave.approve")).toBe(false);
    expect(can(admin, "leave.approve")).toBe(false);
    expect(can(viewAll, "leave.approve")).toBe(false);
    expect(can(hr, "leave.approve")).toBe(true);
    expect(can(superAdmin, "leave.approve")).toBe(true);
  });

  it("only hr/super_admin view all leave requests — plain admin is out", () => {
    expect(can(staff, "leave.view.all")).toBe(false);
    expect(can(maint, "leave.view.all")).toBe(false);
    expect(can(admin, "leave.view.all")).toBe(false);
    expect(can(viewAll, "leave.view.all")).toBe(false);
    expect(can(hr, "leave.view.all")).toBe(true);
    expect(can(superAdmin, "leave.view.all")).toBe(true);
  });

  it("everyone can view their own leave", () => {
    expect(can(staff, "leave.view.own")).toBe(true);
    expect(can(admin, "leave.view.own")).toBe(true);
  });
});

describe("can() — audit & settings", () => {
  it("audit.read is hr/super_admin only — plain admin is out", () => {
    expect(can(staff, "audit.read")).toBe(false);
    expect(can(maint, "audit.read")).toBe(false);
    expect(can(admin, "audit.read")).toBe(false);
    expect(can(viewAll, "audit.read")).toBe(false);
    expect(can(hr, "audit.read")).toBe(true);
    expect(can(superAdmin, "audit.read")).toBe(true);
  });

  it("audit.readAll is super_admin only", () => {
    expect(can(staff, "audit.readAll")).toBe(false);
    expect(can(maint, "audit.readAll")).toBe(false);
    expect(can(hr, "audit.readAll")).toBe(false);
    expect(can(admin, "audit.readAll")).toBe(false);
    expect(can(superAdmin, "audit.readAll")).toBe(true);
  });

  it("settings.read is manager-level", () => {
    expect(can(staff, "settings.read")).toBe(false);
    expect(can(maint, "settings.read")).toBe(false);
    expect(can(hr, "settings.read")).toBe(true);
    expect(can(admin, "settings.read")).toBe(true);
    expect(can(superAdmin, "settings.read")).toBe(true);
  });

  it("settings.edit is super_admin only", () => {
    expect(can(staff, "settings.edit")).toBe(false);
    expect(can(maint, "settings.edit")).toBe(false);
    expect(can(hr, "settings.edit")).toBe(false);
    expect(can(admin, "settings.edit")).toBe(false);
    expect(can(superAdmin, "settings.edit")).toBe(true);
  });
});

describe("can() — student system (SIS)", () => {
  it("student.view is admin tier only (incl. viewAll); hr/maint/staff are out", () => {
    expect(can(staff, "student.view")).toBe(false);
    expect(can(maint, "student.view")).toBe(false);
    expect(can(hr, "student.view")).toBe(false);
    expect(can(admin, "student.view")).toBe(true);
    expect(can(superAdmin, "student.view")).toBe(true);
    expect(can(viewAll, "student.view")).toBe(true);
    expect(can(null, "student.view")).toBe(false);
  });

  it("student.import is Head Admin only — plain admin and viewAll are out", () => {
    expect(can(staff, "student.import")).toBe(false);
    expect(can(maint, "student.import")).toBe(false);
    expect(can(hr, "student.import")).toBe(false);
    expect(can(admin, "student.import")).toBe(false);
    expect(can(viewAll, "student.import")).toBe(false);
    expect(can(superAdmin, "student.import")).toBe(true);
  });
});

describe("can() — viewAll override", () => {
  it("viewAll grants admin-equivalent OPERATIONS access", () => {
    expect(can(viewAll, "ticket.delete")).toBe(true);
    expect(can(viewAll, "schedule.create")).toBe(true);
    expect(can(viewAll, "user.edit.role", target("staff"))).toBe(true);
    expect(can(viewAll, "user.view.profile", target("maintenance"))).toBe(true);
  });

  it("viewAll never grants super-admin-only actions", () => {
    expect(can(viewAll, "settings.edit")).toBe(false);
    expect(can(viewAll, "audit.readAll")).toBe(false);
    expect(can(viewAll, "user.manageAdmins")).toBe(false);
  });

  it("viewAll never grants HR data access", () => {
    expect(canSeeRoleView(viewAll, "hr")).toBe(false);
    expect(can(viewAll, "leave.approve")).toBe(false);
    expect(can(viewAll, "leave.view.all")).toBe(false);
    expect(can(viewAll, "audit.read")).toBe(false);
    expect(can(viewAll, "user.edit.salary")).toBe(false);
    expect(can(viewAll, "user.edit.salary", target("staff"))).toBe(false);
    expect(can(viewAll, "user.edit.leaveBalance", target("staff"))).toBe(false);
    expect(can(viewAll, "user.view.profile", target("hr"))).toBe(false);
    expect(can(viewAll, "user.edit.role", target("hr"))).toBe(false);
    expect(can(viewAll, "user.delete", target("hr"))).toBe(false);
  });

  it("viewAll does not grant settings.read (rules have no viewAll concept)", () => {
    expect(can(viewAll, "settings.read")).toBe(false);
  });

  it("viewAll sees admin peers (admin-equivalent) but cannot manage the tier or see super_admin", () => {
    expect(can(viewAll, "user.view.profile", target("admin"))).toBe(true);
    expect(can(viewAll, "user.view.profile", target("super_admin"))).toBe(false);
    expect(can(viewAll, "user.edit.role", target("admin"))).toBe(false);
    expect(can(viewAll, "user.edit.role", target("super_admin"))).toBe(false);
    expect(can(viewAll, "user.delete", target("admin"))).toBe(false);
    expect(can(viewAll, "user.delete", target("super_admin"))).toBe(false);
  });
});

describe("canSeeRoleView", () => {
  it("everyone sees the staff submit-ticket tab", () => {
    expect(canSeeRoleView(staff, "staff")).toBe(true);
    expect(canSeeRoleView(maint, "staff")).toBe(true);
    expect(canSeeRoleView(hr, "staff")).toBe(true);
    expect(canSeeRoleView(admin, "staff")).toBe(true);
    expect(canSeeRoleView(superAdmin, "staff")).toBe(true);
  });

  it("maintenance tab visible to maintenance/hr/admin", () => {
    expect(canSeeRoleView(staff, "maintenance")).toBe(false);
    expect(canSeeRoleView(maint, "maintenance")).toBe(true);
    expect(canSeeRoleView(hr, "maintenance")).toBe(true);
    expect(canSeeRoleView(admin, "maintenance")).toBe(true);
    expect(canSeeRoleView(superAdmin, "maintenance")).toBe(true);
  });

  it("HR tab visible to hr and super_admin only — plain admin and viewAll are out", () => {
    expect(canSeeRoleView(staff, "hr")).toBe(false);
    expect(canSeeRoleView(maint, "hr")).toBe(false);
    expect(canSeeRoleView(admin, "hr")).toBe(false);
    expect(canSeeRoleView(viewAll, "hr")).toBe(false);
    expect(canSeeRoleView(hr, "hr")).toBe(true);
    expect(canSeeRoleView(superAdmin, "hr")).toBe(true);
  });

  it("admin tab visible to admin only", () => {
    expect(canSeeRoleView(hr, "admin")).toBe(false);
    expect(canSeeRoleView(maint, "admin")).toBe(false);
    expect(canSeeRoleView(admin, "admin")).toBe(true);
    expect(canSeeRoleView(superAdmin, "admin")).toBe(true);
  });

  it("viewAll grants admin-tab access", () => {
    expect(canSeeRoleView(viewAll, "admin")).toBe(true);
  });

  it("student tab visible to admin tier only — hr/maintenance/staff are out", () => {
    expect(canSeeRoleView(staff, "student")).toBe(false);
    expect(canSeeRoleView(maint, "student")).toBe(false);
    expect(canSeeRoleView(hr, "student")).toBe(false);
    expect(canSeeRoleView(admin, "student")).toBe(true);
    expect(canSeeRoleView(superAdmin, "student")).toBe(true);
    expect(canSeeRoleView(viewAll, "student")).toBe(true);
  });

  it("denies everything when actor is null", () => {
    expect(canSeeRoleView(null, "staff")).toBe(false);
    expect(canSeeRoleView(null, "admin")).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("super_admin can assign every role including super_admin", () => {
    expect(assignableRoles(superAdmin)).toEqual(["staff", "maintenance", "hr", "admin", "super_admin"]);
  });

  it("admin assigns staff/maintenance only — hr is people data", () => {
    expect(assignableRoles(admin)).toEqual(["staff", "maintenance"]);
  });

  it("viewAll is admin-equivalent for operations; hr keeps the wider hr scope", () => {
    // Matches can()'s user.edit.role and the server's canAssignRole: a
    // viewAll actor gets the operations (staff/maintenance) scope, never
    // hr-role or admin-tier assignment.
    expect(assignableRoles(viewAll)).toEqual(["staff", "maintenance"]);
    expect(assignableRoles({ uid: "u-vh", role: "hr", status: "approved", viewAll: true })).toEqual([
      "staff",
      "maintenance",
      "hr",
    ]);
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
