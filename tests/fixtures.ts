/**
 * Test-only fixture data. This is the rich, fictional dataset the engine and
 * workflow tests exercise. It is intentionally NOT shipped in the application
 * seed (which contains only the real bootstrap administrators and
 * configuration) — keeping example people out of the product while still
 * proving the domain logic end-to-end.
 */
import type {
  AvailabilityPattern,
  EmployeeProfile,
  LeaveType,
  Location,
  OperatingHours,
  Position,
  Shift,
  Task,
  UserAccount,
} from "@/domain/types";
import { defaultCaliforniaPolicy } from "@/domain/compliance";
import type { CoverageRequirement } from "@/domain/scheduling";
import { addDays, parseTime } from "@/domain/time";
import { type Database, emptyDatabase } from "@/lib/store/types";

export const FIXTURE_NOW = "2026-07-13T08:00:00.000Z";
export const FIXTURE_WEEK_START = "2026-07-13";
// Back-compat alias so existing tests keep working.
export const SEED_WEEK_START = FIXTURE_WEEK_START;

const T = (hhmm: string) => parseTime(hhmm);

function user(id: string, name: string, email: string, roles: UserAccount["roles"]): UserAccount {
  return { id, email: email.toLowerCase(), displayName: name, state: "active", roles, createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW };
}

function baseProfile(over: Partial<EmployeeProfile> & Pick<EmployeeProfile, "id" | "legalName" | "email" | "classification">): EmployeeProfile {
  return {
    preferredName: undefined,
    pronouns: undefined,
    departmentId: "dept-access",
    teamId: "team-desk",
    primaryLocationId: "loc-main",
    eligibleLocationIds: ["loc-main", "loc-desk", "loc-reading"],
    primaryManagerId: "admin-whuggins",
    additionalManagerIds: [],
    startDate: "2025-09-01",
    active: true,
    targetWeeklyHours: 20,
    minWeeklyHours: 0,
    maxWeeklyHours: 30,
    maxDailyHours: 8,
    earliestStart: T("07:00"),
    latestEnd: T("22:00"),
    minTurnaroundMinutes: 480,
    overtimeEligible: false,
    breakPolicyId: "ca-nonexempt-v1",
    qualifiedPositionIds: ["pos-desk", "pos-project", "pos-learning", "pos-admin"],
    qualifiedTaskIds: ["task-shelving", "task-shelfread", "task-dusting", "task-walkthrough", "task-opening", "task-closing"],
    employmentPercentage: 0.5,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
    ...over,
  } as EmployeeProfile;
}

function locations(): Location[] {
  return [
    { id: "loc-main", name: "Main Library", shortName: "Main", timeZone: "America/Los_Angeles", minStaffing: 1, openBufferMinutes: 15, closeBufferMinutes: 15, libcalId: "2457", active: true },
    { id: "loc-desk", name: "Borrowing Services Desk", shortName: "Desk", timeZone: "America/Los_Angeles", minStaffing: 1, openBufferMinutes: 15, closeBufferMinutes: 15, libcalId: "2457", active: true },
    { id: "loc-reading", name: "Reading Room", shortName: "Reading", timeZone: "America/Los_Angeles", minStaffing: 0, openBufferMinutes: 0, closeBufferMinutes: 0, active: true },
    { id: "loc-workroom", name: "Staff Workroom", shortName: "Workroom", timeZone: "America/Los_Angeles", minStaffing: 0, openBufferMinutes: 0, closeBufferMinutes: 0, active: true },
  ];
}

function operatingHours(): OperatingHours[] {
  const weekly: Record<number, { start: number; end: number }[]> = {
    0: [], 1: [{ start: T("08:00"), end: T("20:00") }], 2: [{ start: T("08:00"), end: T("20:00") }],
    3: [{ start: T("08:00"), end: T("20:00") }], 4: [{ start: T("08:00"), end: T("20:00") }],
    5: [{ start: T("08:00"), end: T("18:00") }], 6: [{ start: T("10:00"), end: T("17:00") }],
  };
  return locations().map((l) => ({ locationId: l.id, weekly, exceptions: [] }));
}

function positions(): Position[] {
  const common = {
    minAssignmentMinutes: 60, maxContinuousMinutes: 240, requiresPhysicalPresence: false,
    blocksOtherAssignments: true, countsAsPublicService: false, selfClaimable: false, swapsAllowed: true,
    eligibleClassifications: [] as EmployeeProfile["classification"][], active: true, description: undefined,
  };
  return [
    { ...common, id: "pos-desk", name: "Borrowing Services Desk", shortLabel: "Desk", colorToken: "position-desk", icon: "desk", locationId: "loc-desk", requiredQualification: "desk", minStaffing: 1, preferredStaffing: 1, maxStaffing: 2, requiresPhysicalPresence: true, countsAsPublicService: true, selfClaimable: true, maxContinuousMinutes: 120, order: 0 },
    { ...common, id: "pos-admin", name: "Admin Time", shortLabel: "Admin", colorToken: "position-admin", icon: "clipboard", minStaffing: 0, preferredStaffing: 0, maxStaffing: 5, blocksOtherAssignments: false, order: 1 },
    { ...common, id: "pos-project", name: "Project Time", shortLabel: "Project", colorToken: "position-project", icon: "box", locationId: "loc-workroom", minStaffing: 0, preferredStaffing: 1, maxStaffing: 4, order: 2 },
    { ...common, id: "pos-meetings", name: "Meetings", shortLabel: "Mtg", colorToken: "position-meetings", icon: "users", minStaffing: 0, preferredStaffing: 0, maxStaffing: 10, blocksOtherAssignments: false, order: 3 },
    { ...common, id: "pos-learning", name: "Learning Time", shortLabel: "Learn", colorToken: "position-learning", icon: "book", locationId: "loc-reading", minStaffing: 0, preferredStaffing: 1, maxStaffing: 3, order: 4 },
  ];
}

function tasks(): Task[] {
  const common = {
    requiredQualification: undefined, applicableLocationIds: ["loc-main", "loc-desk", "loc-reading"],
    priority: "normal" as const, minAssignees: 1, maxAssignees: 2, allowedDuringPosition: true,
    requiresAcknowledgement: false, checklist: [] as string[], openingDependency: false, closingDependency: false,
    active: true, description: undefined,
  };
  return [
    { ...common, id: "task-shelving", name: "Shelving", category: "Collections", colorToken: "task-neutral", icon: "book", estimatedMinutes: 60, order: 0 },
    { ...common, id: "task-shelfread", name: "Shelf-reading", category: "Collections", colorToken: "task-neutral", icon: "search", estimatedMinutes: 45, order: 1 },
    { ...common, id: "task-dusting", name: "Dusting", category: "Facilities", colorToken: "task-neutral", icon: "sparkle", estimatedMinutes: 30, order: 2 },
    { ...common, id: "task-walkthrough", name: "Building walkthroughs", category: "Facilities", colorToken: "task-neutral", icon: "walk", estimatedMinutes: 20, order: 3 },
    { ...common, id: "task-opening", name: "Opening duties", category: "Operations", colorToken: "task-warn", icon: "sunrise", estimatedMinutes: 30, openingDependency: true, requiresAcknowledgement: true, checklist: ["Unlock service points"], order: 4 },
    { ...common, id: "task-closing", name: "Closing duties", category: "Operations", colorToken: "task-warn", icon: "sunset", estimatedMinutes: 30, closingDependency: true, requiresAcknowledgement: true, checklist: ["Secure service points"], order: 5 },
  ];
}

function leaveTypes(): LeaveType[] {
  const c = { eligibleClassifications: [] as EmploymentType[], active: true };
  return [
    { ...c, id: "lt-sick", name: "Sick", paid: true, approvalRequired: false, countsAgainstBalance: true, visibility: "manager", blocksScheduling: true, requiresNote: false, employeeSelectable: false },
    { ...c, id: "lt-vacation", name: "Vacation", paid: true, approvalRequired: true, countsAgainstBalance: true, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: true },
    { ...c, id: "lt-pto", name: "PTO", paid: true, approvalRequired: true, countsAgainstBalance: true, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: true },
    { ...c, id: "lt-rdo", name: "Regular day off", paid: false, approvalRequired: false, countsAgainstBalance: false, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: true },
    { ...c, id: "lt-floating", name: "Floating holiday", paid: true, approvalRequired: true, countsAgainstBalance: true, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: true },
    { ...c, id: "lt-holiday", name: "Holiday", paid: true, approvalRequired: false, countsAgainstBalance: false, visibility: "team_generic", blocksScheduling: true, requiresNote: false, employeeSelectable: true },
  ];
}

type EmploymentType = EmployeeProfile["classification"];

function weekdayAvailability(id: string, employeeId: string, windows: { days: number[]; start: string; end: string; kind: "preferred" | "available" | "unavailable" }[]): AvailabilityPattern {
  const blocks = windows.flatMap((w) => w.days.map((weekday) => ({ weekday, start: T(w.start), end: T(w.end), kind: w.kind })));
  return { id, employeeId, label: "Summer term", blocks, updatedBy: employeeId, updatedAt: FIXTURE_NOW };
}

export function buildFixture(): Database {
  const db = emptyDatabase();
  const admins = [
    { id: "admin-whuggins", name: "Will Huggins", email: "whuggins@law.stanford.edu" },
    { id: "admin-cadena", name: "Kay Cadena", email: "cadena@law.stanford.edu" },
  ];
  for (const a of admins) {
    db.users.push(user(a.id, a.name, a.email, [{ role: "SUPER_ADMIN" }, { role: "MANAGER" }]));
    db.employees.push(baseProfile({ id: a.id, legalName: a.name, email: a.email, classification: "manager", primaryManagerId: undefined, targetWeeklyHours: 40, maxWeeklyHours: 45, employmentPercentage: 1, breakPolicyId: "exempt-v1", qualifiedPositionIds: ["pos-desk", "pos-admin", "pos-project", "pos-meetings", "pos-learning"] }));
  }

  const fic: Array<Partial<EmployeeProfile> & Pick<EmployeeProfile, "id" | "legalName" | "email" | "classification">> = [
    { id: "emp-maya", legalName: "Maya Chen", preferredName: "Maya", email: "maya.chen@example.test", classification: "student_worker", pronouns: "she/her", employmentPercentage: 0.375, targetWeeklyHours: 15 },
    { id: "emp-jordan", legalName: "Jordan Lee", preferredName: "Jordan", email: "jordan.lee@example.test", classification: "student_worker", pronouns: "they/them", employmentPercentage: 0.375, targetWeeklyHours: 15 },
    { id: "emp-sam", legalName: "Sam Rivera", preferredName: "Sam", email: "sam.rivera@example.test", classification: "non_exempt_staff", employmentPercentage: 1, targetWeeklyHours: 40, maxWeeklyHours: 40, maxDailyHours: 8 },
    { id: "emp-avery", legalName: "Avery Patel", preferredName: "Avery", email: "avery.patel@example.test", classification: "non_exempt_staff", employmentPercentage: 0.75, targetWeeklyHours: 30 },
    { id: "emp-noah", legalName: "Noah Kim", preferredName: "Noah", email: "noah.kim@example.test", classification: "student_worker", employmentPercentage: 0.25, targetWeeklyHours: 10, qualifiedPositionIds: ["pos-project", "pos-admin"] },
    { id: "emp-riley", legalName: "Riley Osei", preferredName: "Riley", email: "riley.osei@example.test", classification: "casual", employmentPercentage: 0.25, targetWeeklyHours: 10 },
  ];
  for (const f of fic) {
    db.users.push(user(f.id, f.preferredName ?? f.legalName, f.email, [{ role: "EMPLOYEE" }]));
    db.employees.push(baseProfile(f));
  }

  db.departments.push({ id: "dept-access", name: "Access Services", active: true }, { id: "dept-collections", name: "Collections", active: true });
  db.teams.push({ id: "team-desk", name: "Public Services", departmentId: "dept-access", active: true }, { id: "team-stacks", name: "Stacks", departmentId: "dept-collections", active: true });
  db.locations = locations();
  db.operatingHours = operatingHours();
  db.positions = positions();
  db.tasks = tasks();
  db.leaveTypes = leaveTypes();
  db.breakPolicies.push(
    defaultCaliforniaPolicy("non_exempt_staff"),
    { ...defaultCaliforniaPolicy("student_worker"), id: "ca-student-v1", name: "Student worker (California)" },
    { id: "exempt-v1", name: "Exempt", classification: "exempt_staff", restPerHoursWorked: [], mealRequiredAfterMinutes: 100000, mealMinDurationMinutes: 0, mealMustStartByMinutesWorked: 100000, secondMealAfterMinutes: 100000, minTurnaroundMinutes: 0, dailyOvertimeMinutes: 100000, weeklyOvertimeMinutes: 100000, splitShiftGapMinutes: 100000, maxContinuousPublicServiceMinutes: 100000, version: 1 },
  );

  db.availability.push(
    weekdayAvailability("avail-maya", "emp-maya", [{ days: [1, 3], start: "09:00", end: "14:00", kind: "preferred" }, { days: [2, 4], start: "12:00", end: "17:00", kind: "available" }, { days: [5], start: "09:00", end: "13:00", kind: "available" }]),
    weekdayAvailability("avail-jordan", "emp-jordan", [{ days: [1, 2, 3, 4], start: "13:00", end: "20:00", kind: "preferred" }, { days: [5], start: "13:00", end: "18:00", kind: "available" }]),
    weekdayAvailability("avail-sam", "emp-sam", [{ days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00", kind: "preferred" }]),
    weekdayAvailability("avail-avery", "emp-avery", [{ days: [1, 2, 3], start: "10:00", end: "18:00", kind: "preferred" }, { days: [4, 5], start: "10:00", end: "16:00", kind: "available" }]),
    weekdayAvailability("avail-noah", "emp-noah", [{ days: [2, 4], start: "09:00", end: "13:00", kind: "available" }]),
    weekdayAvailability("avail-riley", "emp-riley", [{ days: [3, 6], start: "10:00", end: "17:00", kind: "available" }]),
  );

  db.schedules.push({ id: "sched-week", name: `Week of ${FIXTURE_WEEK_START}`, startDate: FIXTURE_WEEK_START, endDate: addDays(FIXTURE_WEEK_START, 6), status: "draft", version: 1, createdBy: "admin-whuggins", createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW });
  db.coverage = buildCoverage();
  db.shifts.push(...buildExampleShifts());
  db.leave.push({ id: "leave-avery-thu", employeeId: "emp-avery", leaveTypeId: "lt-vacation", startDate: addDays(FIXTURE_WEEK_START, 3), endDate: addDays(FIXTURE_WEEK_START, 3), partialDay: false, status: "approved", enteredBy: "emp-avery", decidedBy: "admin-whuggins", createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW });
  db.notes.push({ id: "note-maya-desk", type: "employee_preference", title: "Limit Maya's consecutive desk time", body: "Try not to place Maya at the desk for more than two consecutive hours.", visibility: "manager", priority: "normal", authorId: "admin-whuggins", employeeIds: ["emp-maya"], positionIds: ["pos-desk"], locationIds: [], taskIds: [], usableByEngine: true, ruleClass: "soft", structuredRule: { kind: "max_consecutive_minutes", employeeId: "emp-maya", positionId: "pos-desk", thresholdMinutes: 120, constraintClass: "soft", confirmed: true }, archived: false, createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW });
  return db;
}

function buildCoverage(): CoverageRequirement[] {
  const reqs: CoverageRequirement[] = [];
  const win: Record<number, { start: string; end: string }[]> = {
    1: [{ start: "09:00", end: "11:00" }, { start: "11:00", end: "13:00" }, { start: "13:00", end: "15:00" }, { start: "15:00", end: "17:00" }],
    2: [{ start: "09:00", end: "11:00" }, { start: "11:00", end: "13:00" }, { start: "13:00", end: "15:00" }, { start: "15:00", end: "17:00" }],
    3: [{ start: "09:00", end: "11:00" }, { start: "11:00", end: "13:00" }, { start: "13:00", end: "15:00" }, { start: "15:00", end: "17:00" }],
    4: [{ start: "09:00", end: "11:00" }, { start: "11:00", end: "13:00" }, { start: "13:00", end: "15:00" }, { start: "15:00", end: "17:00" }],
    5: [{ start: "09:00", end: "11:00" }, { start: "11:00", end: "13:00" }, { start: "13:00", end: "15:00" }],
  };
  for (let d = 1; d <= 5; d++) {
    const date = addDays(FIXTURE_WEEK_START, d - 1);
    for (const [i, w] of win[d].entries()) {
      reqs.push({ id: `cov-${date}-desk-${i}`, date, positionId: "pos-desk", locationId: "loc-desk", start: T(w.start), end: T(w.end), count: 1, taskIds: i === 0 ? ["task-opening"] : [] });
    }
  }
  return reqs;
}

function buildExampleShifts(): Shift[] {
  const mk = (over: Partial<Shift> & Pick<Shift, "id" | "employeeId" | "positionId" | "locationId" | "date" | "start" | "end">): Shift => ({
    scheduleId: "sched-week", breaks: [], taskIds: [], status: "published", source: "manager_created", locked: false, scheduleVersion: 1, createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW, ...over,
  });
  return [
    mk({ id: "shift-sam-mon", employeeId: "emp-sam", positionId: "pos-desk", locationId: "loc-desk", date: FIXTURE_WEEK_START, start: T("09:00"), end: T("13:00"), taskIds: ["task-opening"], breaks: [{ kind: "rest", start: T("11:00"), end: T("11:10"), paid: true }], locked: true }),
    mk({ id: "shift-maya-mon", employeeId: "emp-maya", positionId: "pos-desk", locationId: "loc-desk", date: FIXTURE_WEEK_START, start: T("13:00"), end: T("15:00") }),
    mk({ id: "shift-jordan-mon", employeeId: "emp-jordan", positionId: "pos-project", locationId: "loc-workroom", date: FIXTURE_WEEK_START, start: T("15:00"), end: T("18:00"), taskIds: ["task-shelfread"], status: "draft" }),
  ];
}
