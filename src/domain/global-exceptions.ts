import type { Database } from "@/lib/store/types";
import type { GlobalException, ISODateTime, LeaveRecord } from "./types";

export const HOLIDAY_LEAVE_TYPE_ID = "lt-holiday";

/** Build the leave record id for a global exception on a given employee. */
export function globalLeaveId(globalExceptionId: string, employeeId: string): string {
  return `leave-global-${globalExceptionId}-${employeeId}`;
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
  const activeEmployees = db.employees.filter((e) => e.active);
  const globalById = new Map(db.globalExceptions.map((g) => [g.id, g]));
  const expectedIds = new Set<string>();

  for (const global of db.globalExceptions) {
    for (const employee of activeEmployees) {
      expectedIds.add(globalLeaveId(global.id, employee.id));
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
  for (const global of db.globalExceptions) {
    for (const employee of activeEmployees) {
      const id = globalLeaveId(global.id, employee.id);
      if (!existingIds.has(id)) {
        leave.push(leaveFromGlobal(global, employee.id, actorId, now));
      }
    }
  }

  return { ...db, leave };
}
