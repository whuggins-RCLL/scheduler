import type {
  EmployeeProfile,
  EmploymentClassification,
  ISODate,
  Role,
  RoleGrant,
  RoleScope,
  StudentAvailabilityWindow,
  UserAccount,
} from "./types";
import { isStudentWorker, studentAvailabilityEditable } from "./student-availability";

/** Highest-privilege role held, for coarse UI gating. */
export function primaryRole(user: Pick<UserAccount, "roles">): Role {
  const order: Role[] = ["SUPER_ADMIN", "MANAGER", "SCHEDULER", "AUDITOR", "VIEWER", "LIBRARY_STAFF"];
  for (const r of order) if (user.roles.some((g) => g.role === r)) return r;
  return "LIBRARY_STAFF";
}

export function hasRole(user: Pick<UserAccount, "roles">, role: Role): boolean {
  return user.roles.some((g) => g.role === role);
}

export function isAdmin(user: Pick<UserAccount, "roles">): boolean {
  return hasRole(user, "SUPER_ADMIN");
}

export function canManage(user: Pick<UserAccount, "roles">): boolean {
  return hasRole(user, "SUPER_ADMIN") || hasRole(user, "MANAGER") || hasRole(user, "SCHEDULER");
}

function scopeMatches(scope: RoleScope | undefined, target: EmployeeProfile): boolean {
  if (!scope) return true; // org-wide
  const { locationIds, departmentIds, teamIds } = scope;
  if (locationIds?.length && !locationIds.includes(target.primaryLocationId ?? "")) {
    if (!target.eligibleLocationIds.some((l) => locationIds.includes(l))) return false;
  }
  if (departmentIds?.length && !departmentIds.includes(target.departmentId ?? "")) return false;
  if (teamIds?.length && !teamIds.includes(target.teamId ?? "")) return false;
  return true;
}

/**
 * Whether `viewer` may see/manage `target`'s profile.
 * Super admins see everyone. Managers see employees in their scope OR anyone
 * reporting to them. Everyone can see themselves.
 */
export function canViewEmployee(
  viewer: UserAccount,
  target: EmployeeProfile,
): boolean {
  if (viewer.id === target.id) return true;
  if (isAdmin(viewer)) return true;
  if (!canManage(viewer)) return false;
  const reportsToViewer =
    target.primaryManagerId === viewer.id || target.additionalManagerIds.includes(viewer.id);
  if (reportsToViewer) return true;
  return viewer.roles
    .filter((g: RoleGrant) => g.role === "MANAGER" || g.role === "SCHEDULER")
    .some((g) => scopeMatches(g.scope, target));
}

/** Filter an employee list to those the viewer may manage/see. */
export function visibleEmployees(viewer: UserAccount, all: EmployeeProfile[]): EmployeeProfile[] {
  return all.filter((e) => canViewEmployee(viewer, e));
}

export function canEditRoles(viewer: UserAccount): boolean {
  return isAdmin(viewer);
}

export function canPublishSchedule(viewer: UserAccount): boolean {
  return isAdmin(viewer) || hasRole(viewer, "MANAGER");
}

export function canOverrideCompliance(viewer: UserAccount): boolean {
  return isAdmin(viewer) || hasRole(viewer, "MANAGER");
}

/** Employment types that may view the pooled student-availability grid. */
const STAFF_CLASSIFICATIONS: EmploymentClassification[] = [
  "non_exempt_staff",
  "exempt_staff",
  "manager",
  "temporary",
  "casual",
  "other",
];

/**
 * Whether the viewer may see the combined student-availability grid.
 *
 * Schedulers, managers, and admins always may. Library-staff accounts may too.
 * Student workers and view-only accounts (VIEWER) may NOT — they never see the
 * pooled student schedule. Classification is authoritative: a LIBRARY_STAFF-role
 * account that is a `student_worker` is still hidden. Unknown classification
 * defaults to deny for library-staff-tier accounts.
 */
export { isStudentWorker } from "./student-availability";

/** Whether `actor` may edit `target`'s desk-availability grid. */
export function canEditDeskAvailability(
  actor: UserAccount,
  target: EmployeeProfile,
  window: StudentAvailabilityWindow | undefined,
  today: ISODate,
  options?: { onBehalf?: boolean },
): boolean {
  if (options?.onBehalf && canManage(actor)) return true;
  if (actor.id !== target.id) return false;
  if (!isStudentWorker(target.classification)) return true;
  return studentAvailabilityEditable(window, today);
}

/** Whether `actor` may submit an availability exception for `target`. */
export function canSubmitAvailabilityException(
  actor: UserAccount,
  target: EmployeeProfile,
  options?: { onBehalf?: boolean },
): boolean {
  if (isStudentWorker(target.classification)) {
    return !!options?.onBehalf && canManage(actor);
  }
  return actor.id === target.id || canManage(actor);
}

/** Whether `actor` may approve student availability hours for `target`. */
export function canApproveStudentAvailability(
  actor: UserAccount,
  target: EmployeeProfile,
): boolean {
  return isStudentWorker(target.classification) && (isAdmin(actor) || hasRole(actor, "MANAGER"));
}

export function canViewStudentAvailability(
  viewer: Pick<UserAccount, "roles">,
  classification?: EmploymentClassification,
): boolean {
  if (canManage(viewer)) return true; // scheduler / manager / super admin
  if (classification === "student_worker") return false;
  if (hasRole(viewer, "VIEWER")) return false;
  if (hasRole(viewer, "AUDITOR")) return true;
  if (!hasRole(viewer, "LIBRARY_STAFF")) return false;
  return classification !== undefined && STAFF_CLASSIFICATIONS.includes(classification);
}
