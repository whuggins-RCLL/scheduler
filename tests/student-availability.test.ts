import { describe, expect, it } from "vitest";
import {
  activeStudentAvailabilityWindow,
  canSwapBetween,
  schedulingBlocks,
  studentAvailabilityEditable,
  studentAvailabilityStatus,
  STUDENT_MAX_WEEKLY_MINUTES,
  validateStudentWeeklyCap,
  weeklyApprovedMinutes,
  weeklySignUpMinutes,
} from "../src/domain/student-availability";
import { canEditDeskAvailability } from "../src/domain/scope";
import type { EmployeeProfile, AvailabilityPattern, StudentAvailabilityWindow, UserAccount } from "../src/domain/types";

const window: StudentAvailabilityWindow = {
  id: "w1",
  scheduleId: "s1",
  label: "Fall quarter",
  submissionOpens: "2026-09-01",
  submissionCloses: "2026-09-15",
  enabled: true,
  frozen: false,
  updatedBy: "admin",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("student availability window", () => {
  it("is closed when disabled", () => {
    expect(studentAvailabilityStatus({ ...window, enabled: false }, "2026-09-10")).toBe("disabled");
    expect(studentAvailabilityEditable({ ...window, enabled: false }, "2026-09-10")).toBe(false);
  });

  it("is not yet open before the start date", () => {
    expect(studentAvailabilityStatus(window, "2026-08-31")).toBe("not_yet_open");
  });

  it("is open within the window", () => {
    expect(studentAvailabilityStatus(window, "2026-09-10")).toBe("open");
    expect(studentAvailabilityEditable(window, "2026-09-10")).toBe(true);
  });

  it("is frozen when manually locked", () => {
    expect(studentAvailabilityStatus({ ...window, frozen: true }, "2026-09-10")).toBe("frozen");
  });

  it("auto-locks after the close date", () => {
    expect(studentAvailabilityStatus(window, "2026-09-16")).toBe("closed");
  });

  it("picks the most recently updated enabled window", () => {
    const older: StudentAvailabilityWindow = { ...window, id: "old", updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer: StudentAvailabilityWindow = { ...window, id: "new", updatedAt: "2026-06-01T00:00:00.000Z" };
    expect(activeStudentAvailabilityWindow([older, newer])?.id).toBe("new");
    // Order-independent: same result whichever way the list is passed in.
    expect(activeStudentAvailabilityWindow([newer, older])?.id).toBe("new");
  });

  it("falls back to the most recently updated window when none are enabled", () => {
    const older: StudentAvailabilityWindow = { ...window, id: "old", enabled: false, updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer: StudentAvailabilityWindow = { ...window, id: "new", enabled: false, updatedAt: "2026-06-01T00:00:00.000Z" };
    expect(activeStudentAvailabilityWindow([older, newer])?.id).toBe("new");
    expect(activeStudentAvailabilityWindow([newer, older])?.id).toBe("new");
    expect(activeStudentAvailabilityWindow([])).toBeUndefined();
  });
});

describe("swap classification rules", () => {
  it("allows students to swap only with students", () => {
    expect(canSwapBetween("student_worker", "student_worker")).toBe(true);
    expect(canSwapBetween("student_worker", "non_exempt_staff")).toBe(false);
  });

  it("allows staff to swap with students and staff", () => {
    expect(canSwapBetween("non_exempt_staff", "student_worker")).toBe(true);
    expect(canSwapBetween("exempt_staff", "non_exempt_staff")).toBe(true);
  });
});

describe("weekly hour caps", () => {
  it("enforces the 15-hour student weekly maximum", () => {
    expect(STUDENT_MAX_WEEKLY_MINUTES).toBe(900);
    expect(validateStudentWeeklyCap(900, "sign-up")).toBeNull();
    expect(validateStudentWeeklyCap(960, "sign-up")).toMatch(/15 hours/);
  });

  it("counts sign-up and approved minutes", () => {
    const blocks = [{ weekday: 1, start: 480, end: 960, kind: "available" as const }];
    expect(weeklySignUpMinutes(blocks)).toBe(480);
    expect(weeklyApprovedMinutes(blocks)).toBe(480);
  });

  it("schedules students from approved blocks only", () => {
    const pattern: AvailabilityPattern = {
      id: "a1",
      employeeId: "e1",
      blocks: [{ weekday: 1, start: 480, end: 960, kind: "available" }],
      approvedBlocks: [{ weekday: 1, start: 480, end: 720, kind: "available" }],
      updatedBy: "m",
      updatedAt: "",
    };
    expect(schedulingBlocks(pattern, "student_worker")).toHaveLength(1);
    expect(schedulingBlocks(pattern, "student_worker")[0].end).toBe(720);
    expect(schedulingBlocks(pattern, "non_exempt_staff")).toEqual(pattern.blocks);
  });
});

describe("edit permissions", () => {
  const today = "2026-09-10";
  const window: StudentAvailabilityWindow = {
    id: "w1",
    scheduleId: "s1",
    label: "Fall",
    submissionOpens: "2026-09-01",
    submissionCloses: "2026-09-15",
    enabled: true,
    frozen: false,
    updatedBy: "admin",
    updatedAt: "",
  };
  const student: EmployeeProfile = {
    id: "emp-student",
    legalName: "Student",
    email: "s@test",
    classification: "student_worker",
    eligibleLocationIds: [],
    additionalManagerIds: [],
    active: true,
    targetWeeklyHours: 10,
    minWeeklyHours: 0,
    maxWeeklyHours: 15,
    maxDailyHours: 8,
    earliestStart: 480,
    latestEnd: 1260,
    minTurnaroundMinutes: 480,
    overtimeEligible: false,
    breakPolicyId: "ca-student-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: 0.5,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: false, calendar: false, digest: false },
  };
  const studentUser: UserAccount = {
    id: "emp-student",
    email: "s@test",
    displayName: "Student",
    state: "active",
    roles: [{ role: "LIBRARY_STAFF" }],
    createdAt: "",
    updatedAt: "",
  };
  const adminUser: UserAccount = {
    id: "admin",
    email: "a@test",
    displayName: "Admin",
    state: "active",
    roles: [{ role: "SUPER_ADMIN" }],
    createdAt: "",
    updatedAt: "",
  };

  it("respects submission window for students including view-as", () => {
    const closed = { ...window, enabled: false };
    expect(canEditDeskAvailability(studentUser, student, closed, today)).toBe(false);
    expect(canEditDeskAvailability(adminUser, student, closed, today)).toBe(false);
    expect(canEditDeskAvailability(adminUser, student, closed, today, { onBehalf: true })).toBe(true);
  });
});
