import { describe, expect, it } from "vitest";
import {
  activeStudentAvailabilityWindow,
  canSwapBetween,
  studentAvailabilityEditable,
  studentAvailabilityStatus,
} from "../src/domain/student-availability";
import type { StudentAvailabilityWindow } from "../src/domain/types";

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
