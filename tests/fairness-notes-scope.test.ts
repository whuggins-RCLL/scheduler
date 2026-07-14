import { describe, expect, it } from "vitest";
import { gini } from "../src/domain/fairness";
import { interpretNote, describeRule } from "../src/domain/note-interpreter";
import { canViewEmployee, visibleEmployees } from "../src/domain/scope";
import { buildSeed } from "../src/lib/store/seed";
import { computeScheduleFairness } from "../src/lib/store/actions";
import type { UserAccount } from "../src/domain/types";

describe("fairness", () => {
  it("gini is 0 for equal distribution and higher for skewed", () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0, 5);
    expect(gini([0, 0, 0, 20])).toBeGreaterThan(0.5);
    expect(gini([])).toBe(0);
  });

  it("computes per-employee metrics from the seed", () => {
    const db = buildSeed();
    const snap = computeScheduleFairness(db, "sched-week", "2026-07-13T00:00:00Z");
    expect(snap.metrics.length).toBe(db.employees.filter((e) => e.active).length);
    const sam = snap.metrics.find((m) => m.employeeId === "emp-sam")!;
    expect(sam.totalMinutes).toBeGreaterThan(0); // Sam has a seeded locked desk shift
    expect(snap.giniPublicService).toBeGreaterThanOrEqual(0);
  });
});

describe("note interpreter", () => {
  const db = buildSeed();
  const ctx = { employees: db.employees, positions: db.positions };

  it("interprets a consecutive-hours note into a structured rule", () => {
    const rule = interpretNote("Try not to place Maya at the desk for more than two consecutive hours.", ctx);
    expect(rule).not.toBeNull();
    expect(rule!.kind).toBe("max_consecutive_minutes");
    expect(rule!.thresholdMinutes).toBe(120);
    expect(rule!.employeeId).toBe("emp-maya");
    expect(rule!.positionId).toBe("pos-desk");
    expect(rule!.constraintClass).toBe("soft");
    expect(rule!.confirmed).toBe(false); // must be manager-confirmed
    expect(describeRule(rule!, ctx)).toContain("consecutive");
  });

  it("interprets an avoid-position note", () => {
    const rule = interpretNote("Please don't schedule Noah at the desk.", ctx);
    expect(rule?.kind).toBe("avoid_position");
    expect(rule?.positionId).toBe("pos-desk");
  });

  it("returns null for prose it cannot parse", () => {
    expect(interpretNote("The printer on level 2 is broken again.", ctx)).toBeNull();
  });
});

describe("scope-based visibility", () => {
  const db = buildSeed();
  const admin = db.users.find((u) => u.id === "admin-cadena")! as UserAccount;
  const employee = db.users.find((u) => u.id === "emp-maya")! as UserAccount;

  it("super admins see everyone", () => {
    expect(visibleEmployees(admin, db.employees).length).toBe(db.employees.length);
  });

  it("an employee can see only themselves", () => {
    const self = db.employees.find((e) => e.id === "emp-maya")!;
    const other = db.employees.find((e) => e.id === "emp-sam")!;
    expect(canViewEmployee(employee, self)).toBe(true);
    expect(canViewEmployee(employee, other)).toBe(false);
  });
});
