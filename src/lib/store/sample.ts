import type {
  AvailabilityPattern,
  DailyNote,
  EmployeeProfile,
  Position,
  Shift,
  Task,
  UserAccount,
} from "@/domain/types";
import { addDays, parseTime, weekdayOf } from "@/domain/time";
import type { Database } from "./types";

const T = (hhmm: string) => parseTime(hhmm);

/** Marker id used to detect (and avoid duplicating) an already-loaded sample. */
export const SAMPLE_MARKER_ID = "emp-sample-riley";

interface SamplePerson {
  id: string;
  name: string;
  preferred: string;
  email: string;
  classification: EmployeeProfile["classification"];
  positions: string[];
}

const PEOPLE: SamplePerson[] = [
  { id: "emp-sample-riley", name: "Riley Nguyen", preferred: "Riley", email: "riley.sample@law.stanford.edu", classification: "student_worker", positions: ["pos-ref", "pos-circ"] },
  { id: "emp-sample-jordan", name: "Jordan Park", preferred: "Jordan", email: "jordan.sample@law.stanford.edu", classification: "student_worker", positions: ["pos-circ", "pos-stacks"] },
  { id: "emp-sample-morgan", name: "Morgan Diaz", preferred: "Morgan", email: "morgan.sample@law.stanford.edu", classification: "non_exempt_staff", positions: ["pos-ref", "pos-circ", "pos-stacks"] },
  { id: "emp-sample-sam", name: "Sam Carter", preferred: "Sam", email: "sam.sample@law.stanford.edu", classification: "non_exempt_staff", positions: ["pos-ref", "pos-stacks"] },
];

function samplePositions(): Position[] {
  const base = {
    minAssignmentMinutes: 120,
    maxContinuousMinutes: 300,
    requiresPhysicalPresence: true,
    blocksOtherAssignments: false,
    countsAsPublicService: true,
    selfClaimable: true,
    swapsAllowed: true,
    eligibleClassifications: [] as EmployeeProfile["classification"][],
    active: true,
  };
  return [
    { ...base, id: "pos-ref", name: "Reference Desk", shortLabel: "Ref", description: "Front-line research help.", colorToken: "position-desk", icon: "📚", applicableLocationIds: ["loc-main", "loc-desk"], minStaffing: 1, preferredStaffing: 1, maxStaffing: 2, order: 1 },
    { ...base, id: "pos-circ", name: "Circulation Desk", shortLabel: "Circ", description: "Checkouts, holds, and patron services.", colorToken: "position-admin", icon: "🛎️", applicableLocationIds: ["loc-desk"], minStaffing: 1, preferredStaffing: 1, maxStaffing: 2, order: 2 },
    { ...base, id: "pos-stacks", name: "Stacks & Shelving", shortLabel: "Stacks", description: "Reshelving and collection maintenance.", colorToken: "position-project", icon: "📦", countsAsPublicService: false, applicableLocationIds: ["loc-stacks"], minStaffing: 1, preferredStaffing: 1, maxStaffing: 3, order: 3 },
  ];
}

function sampleTasks(): Task[] {
  const base = {
    applicableLocationIds: ["loc-main", "loc-desk"],
    applicablePositionIds: [] as string[],
    minAssignees: 1,
    maxAssignees: 2,
    allowedDuringPosition: true,
    requiresAcknowledgement: false,
    checklist: [] as string[],
    openingDependency: false,
    closingDependency: false,
    active: true,
  };
  return [
    { ...base, id: "task-open", name: "Opening walkthrough", category: "Operations", colorToken: "position-learning", icon: "🔑", estimatedMinutes: 20, priority: "high", openingDependency: true, applicablePositionIds: ["pos-ref", "pos-circ"], order: 1 },
    { ...base, id: "task-close", name: "Closing sweep", category: "Operations", colorToken: "position-meetings", icon: "🌙", estimatedMinutes: 20, priority: "high", closingDependency: true, applicablePositionIds: ["pos-ref", "pos-circ"], order: 2 },
    { ...base, id: "task-holds", name: "Process holds", category: "Circulation", colorToken: "position-admin", icon: "📨", estimatedMinutes: 30, priority: "normal", applicablePositionIds: ["pos-circ"], order: 3 },
  ];
}

function sampleEmployee(p: SamplePerson): EmployeeProfile {
  const student = p.classification === "student_worker";
  return {
    id: p.id,
    legalName: p.name,
    preferredName: p.preferred,
    email: p.email.toLowerCase(),
    classification: p.classification,
    departmentId: "dept-ler",
    primaryLocationId: "loc-main",
    eligibleLocationIds: ["loc-main", "loc-desk"],
    primaryManagerId: "admin-whuggins",
    additionalManagerIds: [],
    active: true,
    targetWeeklyHours: student ? 15 : 40,
    minWeeklyHours: student ? 6 : 20,
    maxWeeklyHours: student ? 20 : 40,
    maxDailyHours: student ? 6 : 8,
    earliestStart: T("08:00"),
    latestEnd: T("21:00"),
    minTurnaroundMinutes: 480,
    overtimeEligible: !student,
    breakPolicyId: student ? "ca-student-v1" : "ca-nonexempt-v1",
    qualifiedPositionIds: p.positions,
    qualifiedTaskIds: ["task-open", "task-close", "task-holds"],
    employmentPercentage: student ? 0.375 : 1,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
  };
}

function sampleAvailability(p: SamplePerson, now: string): AvailabilityPattern {
  // Weekday daytime availability; a preferred midday window.
  const blocks = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, start: T("09:00"), end: T("12:00"), kind: "available" as const },
    { weekday, start: T("12:00"), end: T("15:00"), kind: "preferred" as const },
    { weekday, start: T("15:00"), end: T("18:00"), kind: "available" as const },
  ]);
  return {
    id: `avail-${p.id}`,
    employeeId: p.id,
    label: "Sample term availability",
    blocks,
    mealBreakMinutes: p.classification === "student_worker" ? 30 : 60,
    updatedBy: "admin-whuggins",
    updatedAt: now,
  };
}

/** Deterministic shift plan for a week — assigns sample staff Mon–Fri. */
function sampleShifts(weekStart: string, now: string): Shift[] {
  const shifts: Shift[] = [];
  const plan: { pos: string; loc: string; start: string; end: string; person: string; tasks: string[] }[][] = [
    // Each weekday (offset 0=Mon .. 4=Fri) has a set of shifts.
    [
      { pos: "pos-ref", loc: "loc-main", start: "09:00", end: "13:00", person: "emp-sample-morgan", tasks: ["task-open"] },
      { pos: "pos-circ", loc: "loc-desk", start: "09:00", end: "14:00", person: "emp-sample-riley", tasks: ["task-holds"] },
      { pos: "pos-ref", loc: "loc-main", start: "13:00", end: "17:00", person: "emp-sample-sam", tasks: ["task-close"] },
      { pos: "pos-stacks", loc: "loc-main", start: "14:00", end: "18:00", person: "emp-sample-jordan", tasks: [] },
    ],
    [
      { pos: "pos-circ", loc: "loc-desk", start: "09:00", end: "13:00", person: "emp-sample-jordan", tasks: ["task-open", "task-holds"] },
      { pos: "pos-ref", loc: "loc-main", start: "10:00", end: "15:00", person: "emp-sample-sam", tasks: [] },
      { pos: "pos-circ", loc: "loc-desk", start: "13:00", end: "17:00", person: "emp-sample-riley", tasks: ["task-close"] },
    ],
    [
      { pos: "pos-ref", loc: "loc-main", start: "09:00", end: "13:00", person: "emp-sample-morgan", tasks: ["task-open"] },
      { pos: "pos-stacks", loc: "loc-main", start: "09:00", end: "13:00", person: "emp-sample-riley", tasks: [] },
      { pos: "pos-circ", loc: "loc-desk", start: "13:00", end: "18:00", person: "emp-sample-jordan", tasks: ["task-close", "task-holds"] },
    ],
    [
      { pos: "pos-circ", loc: "loc-desk", start: "09:00", end: "14:00", person: "emp-sample-riley", tasks: ["task-open"] },
      { pos: "pos-ref", loc: "loc-main", start: "12:00", end: "17:00", person: "emp-sample-morgan", tasks: [] },
      { pos: "pos-stacks", loc: "loc-main", start: "14:00", end: "18:00", person: "emp-sample-sam", tasks: ["task-close"] },
    ],
    [
      { pos: "pos-ref", loc: "loc-main", start: "09:00", end: "13:00", person: "emp-sample-sam", tasks: ["task-open"] },
      { pos: "pos-circ", loc: "loc-desk", start: "10:00", end: "15:00", person: "emp-sample-jordan", tasks: ["task-holds"] },
      // one intentionally open shift to exercise the "uncovered" surfaces.
      { pos: "pos-circ", loc: "loc-desk", start: "15:00", end: "17:00", person: "", tasks: ["task-close"] },
    ],
  ];
  plan.forEach((day, offset) => {
    const date = addDays(weekStart, offset);
    day.forEach((s, i) => {
      shifts.push({
        id: `shift-sample-${offset}-${i}`,
        scheduleId: "sched-week",
        employeeId: s.person || null,
        positionId: s.pos,
        locationId: s.loc,
        date,
        start: T(s.start),
        end: T(s.end),
        breaks: [],
        taskIds: s.tasks,
        status: s.person ? "published" : "open",
        source: "manager_created",
        locked: false,
        scheduleVersion: 1,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  return shifts;
}

function sampleDailyNotes(weekStart: string, now: string): DailyNote[] {
  return [
    {
      id: "dn-sample-1",
      body: "☕ Welcome to the new term! The staff lounge espresso machine is fixed. Please tidy up after yourselves.",
      authorId: "admin-whuggins",
      published: true,
      pinned: true,
      visibleFrom: addDays(weekStart, -3),
      visibleTo: addDays(weekStart, 10),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "dn-sample-2",
      body: "📕 Reminder: reserves processing for the evening class moves to 2pm today. Circulation, please prioritize the holds shelf.",
      authorId: "admin-cadena",
      published: true,
      pinned: false,
      visibleFrom: weekStart,
      visibleTo: addDays(weekStart, 6),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "dn-sample-3",
      body: "🔧 Facilities will be testing the fire alarm Thursday morning between 8–9am. No action needed — just a heads up.",
      authorId: "admin-gwilson",
      published: true,
      pinned: false,
      visibleFrom: weekStart,
      visibleTo: addDays(weekStart, 4),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * Load a rich, deterministic sample dataset (staff, positions, tasks,
 * availability, a published week of shifts, and daily notes) into a copy of the
 * database. Idempotent: if the sample staff already exist it is a no-op.
 */
export function applySampleData(db: Database, weekStart: string, now: string): Database {
  if (db.employees.some((e) => e.id === SAMPLE_MARKER_ID)) return db;
  const next = structuredClone(db);

  for (const p of PEOPLE) {
    next.users.push({
      id: p.id,
      email: p.email.toLowerCase(),
      displayName: p.name,
      state: "active",
      roles: [{ role: "LIBRARY_STAFF" }],
      createdAt: now,
      updatedAt: now,
    } satisfies UserAccount);
    next.employees.push(sampleEmployee(p));
    next.availability.push(sampleAvailability(p, now));
  }

  // Merge positions/tasks without clobbering any the admin already created.
  for (const pos of samplePositions()) if (!next.positions.some((x) => x.id === pos.id)) next.positions.push(pos);
  for (const task of sampleTasks()) if (!next.tasks.some((x) => x.id === task.id)) next.tasks.push(task);

  next.shifts.push(...sampleShifts(weekStart, now));

  const sched = next.schedules.find((s) => s.id === "sched-week");
  if (sched) {
    sched.status = "published";
    sched.publishedVersion = sched.version;
    sched.updatedAt = now;
  }

  next.dailyNotes.push(...sampleDailyNotes(weekStart, now));
  return next;
}

/** Monday (ISO) of the week containing `date`. Mirrors seed.ts. */
export function mondayOf(dateISO: string): string {
  const w = weekdayOf(dateISO);
  const diff = w === 0 ? -6 : 1 - w;
  return addDays(dateISO, diff);
}
