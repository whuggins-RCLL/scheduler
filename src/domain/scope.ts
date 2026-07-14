import type { EmployeeProfile, Role, RoleGrant, RoleScope, UserAccount } from "./types";

/** Highest-privilege role held, for coarse UI gating. */
export function primaryRole(user: Pick<UserAccount, "roles">): Role {
  const order: Role[] = ["SUPER_ADMIN", "MANAGER", "SCHEDULER", "AUDITOR", "VIEWER", "EMPLOYEE"];
  for (const r of order) if (user.roles.some((g) => g.role === r)) return r;
  return "EMPLOYEE";
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
