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
  return `${accounts}::${globals}`;
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

export function isGlobalSyncedLeave(record: LeaveRecord): boolean {
  return !!record.globalExceptionId || record.leaveTypeId === HOLIDAY_LEAVE_TYPE_ID;
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
  const globalExceptions = db.globalExceptions ?? [];
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
  if (!isActiveAccountHolder(db, accountId)) return [];
  const globals = db.globalExceptions ?? [];
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
