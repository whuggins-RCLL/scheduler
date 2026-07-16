/** Pure employee-profile defaults used by the user-document trigger. */

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "MANAGER", "SCHEDULER"]);
const STAFF_ROLES = new Set([...MANAGER_ROLES, "EMPLOYEE"]);

export interface UserDocument {
  email?: unknown;
  displayName?: unknown;
  state?: unknown;
  roles?: unknown;
}
export function roleNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && typeof (entry as { role?: unknown }).role === "string") {
      return [(entry as { role: string }).role];
    }
    return [];
  });
}

export function shouldHaveEmployeeProfile(userDoc: UserDocument | undefined): boolean {
  return userDoc?.state === "active" && roleNames(userDoc.roles).some((role) => STAFF_ROLES.has(role));
}

export function defaultEmployeeProfileData(userId: string, userDoc: UserDocument): Record<string, unknown> {
  const manager = roleNames(userDoc.roles).some((role) => MANAGER_ROLES.has(role));
  return {
    legalName: typeof userDoc.displayName === "string" ? userDoc.displayName : String(userDoc.email ?? userId),
    email: String(userDoc.email ?? "").trim().toLowerCase(),
    classification: manager ? "manager" : "other",
    ...(manager ? { departmentId: "dept-admin", primaryLocationId: "loc-main" } : {}),
    eligibleLocationIds: manager ? ["loc-main", "loc-desk"] : [],
    additionalManagerIds: [],
    active: true,
    setupComplete: manager,
    targetWeeklyHours: manager ? 40 : 0,
    minWeeklyHours: 0,
    maxWeeklyHours: manager ? 45 : 0,
    maxDailyHours: manager ? 8 : 0,
    earliestStart: manager ? 7 * 60 : 8 * 60,
    latestEnd: manager ? 22 * 60 : 20 * 60,
    minTurnaroundMinutes: 480,
    overtimeEligible: false,
    breakPolicyId: manager ? "exempt-v1" : "ca-nonexempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: 1,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
  };
}
