import type { Database } from "@/lib/store/types";
import type { GlobalException, ISODateTime, LeaveRecord } from "./types";

export const HOLIDAY_LEAVE_TYPE_ID = "lt-holiday";

/** Build the leave record id for a global exception on a given employee. */
export function globalLeaveId(globalExceptionId: string, employeeId: string): string {
  return `leave-global-${globalExceptionId}-${employeeId}`;
}

/** Fingerprint of active accounts + global exceptions — used to trigger re-sync. */
export function globalSyncFingerprint(db: Database): string {
  const accounts = activeAccountHolderIds(db).join(",");
  const globals = (db.globalExceptions ?? [])
    .map((g) => `${g.id}:${g.startDate}:${g.endDate}:${g.name}`)
    .sort()
    .join("|");
  const deduped = activeGlobalExceptions(db).map((g) => g.id).sort().join(",");
  return `${accounts}::${globals}::${deduped}`;
}

/** Every signed-in account that should receive university-wide exceptions. */
export function activeAccountHolderIds(db: Database): string[] {
  const ids = new Set<string>();
  for (const user of db.users) {
    if (user.state === "active") ids.add(user.id);
  }
  for (const employee of db.employees) {
    if (employee.active) ids.add(employee.id);
  }
  return [...ids].sort();
}

export function isActiveAccountHolder(db: Database, accountId: string): boolean {
  const user = db.users.find((u) => u.id === accountId);
  if (user?.state === "active") return true;
  const employee = db.employees.find((e) => e.id === accountId);
  return employee?.active === true;
}

/**
 * True only when the account is *known and inactive* (archived/suspended). An id
 * with no user and no employee record (e.g. an admin's "view as" preview persona,
 * or a client that has only loaded its own minimal roster) is NOT treated as
 * inactive — university holidays still apply to it. This is intentionally more
 * permissive than {@link isActiveAccountHolder}, which gates the persisted sync.
 */
export function isKnownInactiveAccount(db: Database, accountId: string): boolean {
  const user = db.users.find((u) => u.id === accountId);
  const employee = db.employees.find((e) => e.id === accountId);
  if (!user && !employee) return false; // unknown to this client — show globals
  return user?.state !== "active" && employee?.active !== true;
}

export function isGlobalSyncedLeave(record: LeaveRecord): boolean {
  return !!record.globalExceptionId || record.leaveTypeId === HOLIDAY_LEAVE_TYPE_ID;
}

/**
 * When multiple years of the same holiday name exist, keep one row per name —
 * preferring the instance in the reference calendar year, otherwise the nearest year.
 */
export function dedupeGlobalsByName(globals: GlobalException[], asOf: string): GlobalException[] {
  const year = Number(asOf.slice(0, 4));
  const byName = new Map<string, GlobalException>();
  for (const global of globals) {
    const existing = byName.get(global.name);
    if (!existing) {
      byName.set(global.name, global);
      continue;
    }
    const startYear = Number(global.startDate.slice(0, 4));
    const existingYear = Number(existing.startDate.slice(0, 4));
    if (existingYear !== year && startYear === year) {
      byName.set(global.name, global);
    } else if (existingYear !== year && startYear !== year) {
      const existingDistance = Math.abs(existingYear - year);
      const nextDistance = Math.abs(startYear - year);
      if (nextDistance < existingDistance) byName.set(global.name, global);
    }
  }
  return [...byName.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Globals that should appear on user exceptions lists (deduped by holiday name). */
export function activeGlobalExceptions(db: Database, asOf?: string): GlobalException[] {
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  return dedupeGlobalsByName(db.globalExceptions ?? [], today);
}

function leaveFromGlobal(
  global: GlobalException,
  employeeId: string,
  actorId: string,
  now: ISODateTime,
): LeaveRecord {
  return {
    id: globalLeaveId(global.id, employeeId),
    employeeId,
    leaveTypeId: HOLIDAY_LEAVE_TYPE_ID,
    startDate: global.startDate,
    endDate: global.endDate,
    partialDay: false,
    status: "recorded",
    note: global.name,
    globalExceptionId: global.id,
    enteredBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ensure every active employee has an all-day leave record for each global
 * exception, and remove stale records for deleted or updated globals.
 */
export function syncGlobalExceptionsToLeave(
  db: Database,
  actorId: string,
  now: ISODateTime,
): Database {
  const accountIds = activeAccountHolderIds(db);
  const globalExceptions = activeGlobalExceptions(db);
  const globalById = new Map(globalExceptions.map((g) => [g.id, g]));
  const expectedIds = new Set<string>();

  for (const global of globalExceptions) {
    for (const accountId of accountIds) {
      expectedIds.add(globalLeaveId(global.id, accountId));
    }
  }

  const leave = db.leave
    .filter((record) => {
      if (!record.globalExceptionId) return true;
      return expectedIds.has(record.id);
    })
    .map((record) => {
      if (!record.globalExceptionId) return record;
      const global = globalById.get(record.globalExceptionId);
      if (!global) return record;
      return {
        ...record,
        leaveTypeId: HOLIDAY_LEAVE_TYPE_ID,
        startDate: global.startDate,
        endDate: global.endDate,
        partialDay: false,
        start: undefined,
        end: undefined,
        status: "recorded" as const,
        note: global.name,
        updatedAt: now,
      };
    });

  const existingIds = new Set(leave.map((record) => record.id));
  for (const global of globalExceptions) {
    for (const accountId of accountIds) {
      const id = globalLeaveId(global.id, accountId);
      if (!existingIds.has(id)) {
        leave.push(leaveFromGlobal(global, accountId, actorId, now));
      }
    }
  }

  return { ...db, leave };
}

/** University-wide exceptions for one account — always derived from global config. */
export function globalLeaveRecordsForEmployee(db: Database, accountId: string): LeaveRecord[] {
  // University holidays apply to everyone; only suppress them for accounts we
  // know to be archived/inactive. Unknown ids (preview personas, minimal client
  // rosters) still receive them so students always see the closure calendar.
  if (isKnownInactiveAccount(db, accountId)) return [];
  const globals = activeGlobalExceptions(db);
  if (globals.length === 0) return [];
  return globals
    .map((global) => {
      const existing = db.leave.find(
        (record) =>
          record.id === globalLeaveId(global.id, accountId) && record.status !== "cancelled",
      );
      return existing ?? leaveFromGlobal(global, accountId, "system", "");
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** Personal exceptions only — excludes university-wide synced records. */
export function personalLeaveRecordsForEmployee(db: Database, employeeId: string): LeaveRecord[] {
  return db.leave
    .filter(
      (record) =>
        record.employeeId === employeeId &&
        record.status !== "cancelled" &&
        !isGlobalSyncedLeave(record),
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** All exceptions for scheduling and display — globals plus personal records. */
export function leaveRecordsForEmployee(db: Database, employeeId: string): LeaveRecord[] {
  const globals = globalLeaveRecordsForEmployee(db, employeeId);
  const personal = personalLeaveRecordsForEmployee(db, employeeId);
  return [...globals, ...personal].sort((a, b) => b.startDate.localeCompare(a.startDate));
}
