import type { EmployeeProfile, EmploymentClassification, UserAccount } from "./types";

/** Infer classification for synthetic view-as personas that lack a stored profile. */
export function inferClassificationForUser(
  user: Pick<UserAccount, "id">,
  viewAs?: "self" | "student" | "staff",
): EmploymentClassification {
  if (user.id.startsWith("view-student") || viewAs === "student") return "student_worker";
  if (user.id.startsWith("view-staff") || viewAs === "staff") return "non_exempt_staff";
  return "student_worker";
}

/**
 * Resolve an employee profile for break reminders and other employee-facing UI.
 * Falls back to a synthetic profile when the signed-in user has no Firestore
 * employee record yet (common for view-as previews and freshly approved accounts).
 */
export function resolveEmployeeProfile(
  employees: EmployeeProfile[],
  user: UserAccount,
  viewAs: "self" | "student" | "staff" = "self",
): EmployeeProfile {
  const existing = employees.find((e) => e.id === user.id);
  if (existing) return existing;

  const classification = inferClassificationForUser(user, viewAs);
  return {
    id: user.id,
    legalName: user.displayName,
    preferredName: user.displayName,
    email: user.email,
    classification,
    eligibleLocationIds: [],
    additionalManagerIds: [],
    active: true,
    targetWeeklyHours: classification === "student_worker" ? 10 : 20,
    minWeeklyHours: 0,
    maxWeeklyHours: classification === "student_worker" ? 20 : 40,
    maxDailyHours: 8,
    earliestStart: 8 * 60,
    latestEnd: 21 * 60,
    minTurnaroundMinutes: 480,
    overtimeEligible: classification !== "exempt_staff",
    breakPolicyId: classification === "student_worker" ? "ca-student-v1" : "ca-nonexempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: classification === "student_worker" ? 0.5 : 1,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
  };
}
