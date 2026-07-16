import { BOOTSTRAP_ADMINS, ORGANIZATION_ID } from "@/lib/config";
import type { EmployeeProfile, GlobalException, LeaveType, Location, OperatingHours, UserAccount } from "@/domain/types";
import { DEFAULT_MANAGER_DEPARTMENT_ID, DEPARTMENTS } from "./departments";
import { syncGlobalExceptionsToLeave } from "@/domain/global-exceptions";
import { defaultCaliforniaPolicy } from "@/domain/compliance";
import { addDays, parseTime } from "@/domain/time";
import { type Database, emptyDatabase } from "./types";

const T = (hhmm: string) => parseTime(hhmm);

/** Monday (ISO) of the week containing `date`. */
function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function user(id: string, name: string, email: string, roles: UserAccount["roles"], now: string): UserAccount {
  return { id, email: email.toLowerCase(), displayName: name, state: "active", roles, createdAt: now, updatedAt: now };
}

function adminProfile(id: string, name: string, email: string): EmployeeProfile {
  return {
    id,
    legalName: name,
    email: email.toLowerCase(),
    classification: "manager",
    departmentId: DEFAULT_MANAGER_DEPARTMENT_ID,
    teamId: undefined,
    primaryLocationId: "loc-main",
    eligibleLocationIds: ["loc-main", "loc-desk"],
    primaryManagerId: undefined,
    additionalManagerIds: [],
    active: true,
    setupComplete: true,
    targetWeeklyHours: 40,
    minWeeklyHours: 0,
    maxWeeklyHours: 45,
    maxDailyHours: 8,
    earliestStart: T("07:00"),
    latestEnd: T("22:00"),
    minTurnaroundMinutes: 480,
    overtimeEligible: false,
    breakPolicyId: "exempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: 1,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
  };
}

export function seedLocations(): Location[] {
  // Schedule types (formerly "locations"). Each is its own board. Only the
  // Borrowing Services Desk (and opening/closing duties) is must-cover; Stacks,
  // Breaks & Lunches, and any future types (e.g. special events) are not.
  // LibCal location id 2457 maps the staffed desk.
  const tz = "America/Los_Angeles";
  return [
    { id: "loc-main", name: "Main Library", shortName: "Main", timeZone: tz, minStaffing: 1, openBufferMinutes: 15, closeBufferMinutes: 15, libcalId: "2457", active: true },
    { id: "loc-desk", name: "Borrowing Services Desk", shortName: "Desk", description: "Public service desk — minimum one person whenever open.", timeZone: tz, minStaffing: 1, openBufferMinutes: 15, closeBufferMinutes: 15, libcalId: "2457", active: true },
    { id: "loc-stacks", name: "Stacks", shortName: "Stacks", description: "Shelving and stacks maintenance. Not required coverage.", timeZone: tz, minStaffing: 0, openBufferMinutes: 0, closeBufferMinutes: 0, active: true },
    { id: "loc-breaks", name: "Breaks & Lunches", shortName: "Breaks", description: "Scheduled meal and rest breaks. Not required coverage.", timeZone: tz, minStaffing: 0, openBufferMinutes: 0, closeBufferMinutes: 0, active: true },
  ];
}

function operatingHours(): OperatingHours[] {
  // Manual default until LibCal is synced from the Integrations screen.
  const weekly: Record<number, { start: number; end: number }[]> = {
    0: [], 1: [{ start: T("09:00"), end: T("17:00") }], 2: [{ start: T("09:00"), end: T("17:00") }],
    3: [{ start: T("09:00"), end: T("17:00") }], 4: [{ start: T("09:00"), end: T("17:00") }],
    5: [{ start: T("09:00"), end: T("17:00") }], 6: [],
  };
  return seedLocations().map((l) => ({ locationId: l.id, weekly, exceptions: [] }));
}

function leaveTypes(): LeaveType[] {
  const c = { eligibleClassifications: [] as EmployeeProfile["classification"][], active: true };
  // The platform tracks only availability exceptions — no paid-leave categories.
  // Staff mark when they are unavailable; managers may record the same on an
  // employee's behalf when they call out. There is no approval queue and no
  // leave-balance accounting of any kind.
  return [
    { ...c, id: "lt-unavailable", name: "Unavailable", paid: false, approvalRequired: false, countsAgainstBalance: false, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: true },
    { ...c, id: "lt-holiday", name: "University holiday", paid: true, approvalRequired: false, countsAgainstBalance: false, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: false },
  ];
}

/** Stanford university holidays from the Cardinal at Work schedule (2026). */
function universityGlobalExceptions(now: string, actorId: string): GlobalException[] {
  const base = (id: string, name: string, startDate: string, endDate: string): GlobalException => ({
    id,
    name,
    startDate,
    endDate,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  return [
    base("ge-ny-2026", "New Year's Day", "2026-01-01", "2026-01-01"),
    base("ge-mlk-2026", "Martin Luther King, Jr. Day", "2026-01-19", "2026-01-19"),
    base("ge-pres-2026", "Presidents' Day", "2026-02-16", "2026-02-16"),
    base("ge-mem-2026", "Memorial Day", "2026-05-25", "2026-05-25"),
    base("ge-july4-2026", "Independence Day", "2026-07-03", "2026-07-03"),
    base("ge-labor-2026", "Labor Day", "2026-09-07", "2026-09-07"),
    base("ge-thanks-2026", "Thanksgiving; Friday after Thanksgiving", "2026-11-26", "2026-11-27"),
    base("ge-winter-2026", "Winter Holidays", "2026-12-24", "2026-12-25"),
    base("ge-winter-closure-2026", "University Winter Closure", "2026-12-21", "2027-01-01"),
  ];
}

/**
 * Production seed. Contains ONLY real data: the five bootstrap administrators
 * and baseline configuration (locations, leave types, break policies, and an
 * empty current-week schedule). Positions, tasks, and staff are created by
 * admins/managers from the admin portal — nothing fictional is shipped.
 */
export function buildSeed(): Database {
  const db = emptyDatabase();
  const now = new Date().toISOString();
  const weekStart = mondayOf(new Date());

  const adminIds = ["admin-whuggins", "admin-cadena", "admin-blalfaro", "admin-gwilson", "admin-bwilli"];
  BOOTSTRAP_ADMINS.forEach((admin, i) => {
    const id = adminIds[i];
    db.users.push(user(id, admin.name, admin.email, [{ role: "SUPER_ADMIN" }, { role: "MANAGER" }], now));
    db.employees.push(adminProfile(id, admin.name, admin.email));
  });

  db.departments = DEPARTMENTS.map((d) => ({ ...d }));

  db.locations = seedLocations();
  db.operatingHours = operatingHours();
  db.leaveTypes = leaveTypes();

  db.breakPolicies.push(
    defaultCaliforniaPolicy("non_exempt_staff"),
    { ...defaultCaliforniaPolicy("student_worker"), id: "ca-student-v1", name: "Student worker (California)" },
    {
      id: "exempt-v1",
      name: "Exempt (no meal/rest scheduling constraints)",
      classification: "exempt_staff",
      restPerHoursWorked: [],
      mealRequiredAfterMinutes: 100000,
      mealMinDurationMinutes: 0,
      mealMustStartByMinutesWorked: 100000,
      secondMealAfterMinutes: 100000,
      minTurnaroundMinutes: 0,
      dailyOvertimeMinutes: 100000,
      weeklyOvertimeMinutes: 100000,
      splitShiftGapMinutes: 100000,
      maxContinuousPublicServiceMinutes: 100000,
      version: 1,
    },
  );

  // An empty current-week schedule so the workspace has a canvas to build on.
  const scheduleId = "sched-week";
  db.schedules.push({
    id: scheduleId,
    name: `Week of ${weekStart}`,
    startDate: weekStart,
    endDate: addDays(weekStart, 6),
    status: "draft",
    version: 1,
    createdBy: adminIds[0],
    createdAt: now,
    updatedAt: now,
  });

  // Default student availability window — disabled until a manager opens it.
  const quarterEnd = addDays(weekStart, 84);
  db.studentAvailabilityWindows.push({
    id: "saw-default",
    scheduleId,
    label: "Current quarter",
    submissionOpens: weekStart,
    submissionCloses: quarterEnd,
    enabled: false,
    frozen: false,
    updatedBy: adminIds[0],
    updatedAt: now,
  });

  db.globalExceptions = universityGlobalExceptions(now, adminIds[0]);
  return syncGlobalExceptionsToLeave(db, adminIds[0], now);
}

export { ORGANIZATION_ID };
