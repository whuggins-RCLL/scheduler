import type { EmployeeProfile, Role, UserAccount } from "@/domain/types";
import { DEFAULT_MANAGER_DEPARTMENT_ID } from "./departments";

const MANAGER_ROLES: Role[] = ["SUPER_ADMIN", "MANAGER", "SCHEDULER"];
const STAFF_ROLES: Role[] = [...MANAGER_ROLES, "LIBRARY_STAFF"];

export function hasStaffRole(user: Pick<UserAccount, "roles">): boolean {
  return user.roles.some((grant) => STAFF_ROLES.includes(grant.role));
}
export function hasManagerRole(user: Pick<UserAccount, "roles">): boolean {
  return user.roles.some((grant) => MANAGER_ROLES.includes(grant.role));
}

/**
 * Produce a safe draft profile for an active staff account.
 *
 * Managers have known bootstrap defaults. Everyone else starts with zero
 * schedulable hours until an administrator completes onboarding, preventing the
 * scheduling engine from guessing employment terms.
 */
export function defaultEmployeeProfile(
  user: Pick<UserAccount, "id" | "email" | "displayName" | "roles" | "state">,
): EmployeeProfile {
  const manager = hasManagerRole(user);
  return {
    id: user.id,
    legalName: user.displayName,
    email: user.email.toLowerCase(),
    classification: manager ? "manager" : "other",
    departmentId: manager ? DEFAULT_MANAGER_DEPARTMENT_ID : undefined,
    primaryLocationId: manager ? "loc-main" : undefined,
    eligibleLocationIds: manager ? ["loc-main", "loc-desk"] : [],
    primaryManagerId: undefined,
    additionalManagerIds: [],
    active: user.state === "active" && hasStaffRole(user),
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
