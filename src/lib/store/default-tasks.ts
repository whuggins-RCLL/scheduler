import type { Task, TaskPriority } from "@/domain/types";

/** Stable ids for the RCLL task catalog (restored from production admin export). */
export const DEFAULT_TASK_IDS = {
  desk1Staff: "task-desk-1-staff",
  desk2Staff: "task-desk-2-staff",
  desk1Student: "task-desk-1-student",
  desk2Student: "task-desk-2-student",
  unpaidMeal30: "task-unpaid-meal-30",
  unpaidMeal60: "task-unpaid-meal-60",
  paidBreak15: "task-paid-break-15",
  buildingWalkthrough: "task-building-walkthrough",
  shelving: "task-shelving",
  shelfReading: "task-shelf-reading",
  dusting: "task-dusting",
  shifting: "task-shifting",
  openLibrary: "task-open-library",
  closeLibrary: "task-close-library",
  scanningLawJournals: "task-scanning-law-journals",
  scanningGeneral: "task-scanning-general",
  holdsPullList: "task-holds-pull-list",
  facultyBorrowing: "task-faculty-borrowing",
  meeting30: "task-meeting-30",
  meeting60: "task-meeting-60",
  professionalDevelopment: "task-professional-development",
  adminTime: "task-admin-time",
  reservesProcessing: "task-reserves-processing",
  illProcessing: "task-ill-processing",
  eventSupport: "task-event-support",
  libanswers: "task-libanswers",
  otherDuties: "task-other-duties",
} as const;

/** Schedule-type ids these defaults are assigned to (see seedLocations). */
const SCHEDULE_TYPE_IDS = {
  main: "loc-main",
  desk: "loc-desk",
  stacks: "loc-stacks",
  breaks: "loc-breaks",
} as const;

function task(
  id: string,
  name: string,
  opts: {
    category?: string;
    priority?: TaskPriority;
    estimatedMinutes: number;
    minAssignees?: number;
    maxAssignees?: number;
    openingDependency?: boolean;
    closingDependency?: boolean;
    order: number;
    colorToken?: string;
    icon?: string;
    /** Schedule types this task appears on. Empty = every schedule type. */
    locations?: string[];
  },
): Task {
  return {
    id,
    name,
    category: opts.category ?? "General",
    colorToken: opts.colorToken ?? "task-neutral",
    icon: opts.icon ?? "check",
    applicableLocationIds: opts.locations ?? [],
    applicablePositionIds: [],
    estimatedMinutes: opts.estimatedMinutes,
    priority: opts.priority ?? "normal",
    minAssignees: opts.minAssignees ?? 1,
    maxAssignees: opts.maxAssignees ?? opts.minAssignees ?? 1,
    allowedDuringPosition: true,
    requiresAcknowledgement: false,
    checklist: [],
    openingDependency: opts.openingDependency ?? false,
    closingDependency: opts.closingDependency ?? false,
    order: opts.order,
    active: true,
  };
}

/** Canonical RCLL task catalog — used for Firestore bootstrap and seed scripts. */
export function defaultTasks(): Task[] {
  return [
    task(DEFAULT_TASK_IDS.desk1Staff, "Desk 1 (Staff)", {
      category: "Borrowing Services",
      priority: "high",
      estimatedMinutes: 120,
      order: 0,
      colorToken: "task-operations",
      icon: "desk",
      locations: [SCHEDULE_TYPE_IDS.desk],
    }),
    task(DEFAULT_TASK_IDS.desk2Staff, "Desk 2 (Staff)", {
      estimatedMinutes: 120,
      order: 1,
      locations: [SCHEDULE_TYPE_IDS.desk],
    }),
    task(DEFAULT_TASK_IDS.desk1Student, "Desk 1 (Student)", {
      estimatedMinutes: 60,
      order: 2,
      locations: [SCHEDULE_TYPE_IDS.desk],
    }),
    task(DEFAULT_TASK_IDS.desk2Student, "Desk 2 (Student)", {
      estimatedMinutes: 60,
      order: 3,
      locations: [SCHEDULE_TYPE_IDS.desk],
    }),
    task(DEFAULT_TASK_IDS.unpaidMeal30, "Unpaid Meal Break (Lunch)", {
      estimatedMinutes: 30,
      order: 4,
      colorToken: "task-meal",
      icon: "meal",
      locations: [SCHEDULE_TYPE_IDS.breaks],
    }),
    task(DEFAULT_TASK_IDS.unpaidMeal60, "Unpaid Meal Break (Lunch)", {
      estimatedMinutes: 60,
      order: 5,
      colorToken: "task-meal",
      icon: "meal",
      locations: [SCHEDULE_TYPE_IDS.breaks],
    }),
    task(DEFAULT_TASK_IDS.paidBreak15, "15 minute break (paid)", {
      estimatedMinutes: 30,
      order: 6,
      colorToken: "task-rest",
      icon: "rest",
      locations: [SCHEDULE_TYPE_IDS.breaks],
    }),
    task(DEFAULT_TASK_IDS.buildingWalkthrough, "Building Walkthrough", {
      estimatedMinutes: 30,
      order: 7,
      colorToken: "task-facilities",
      icon: "walk",
      locations: [SCHEDULE_TYPE_IDS.stacks],
    }),
    task(DEFAULT_TASK_IDS.shelving, "Shelving", {
      estimatedMinutes: 60,
      order: 8,
      colorToken: "task-collections",
      icon: "book",
      locations: [SCHEDULE_TYPE_IDS.stacks],
    }),
    task(DEFAULT_TASK_IDS.shelfReading, "Shelf-Reading", {
      estimatedMinutes: 60,
      order: 9,
      colorToken: "task-collections",
      icon: "search",
      locations: [SCHEDULE_TYPE_IDS.stacks],
    }),
    task(DEFAULT_TASK_IDS.dusting, "Dusting", {
      estimatedMinutes: 60,
      order: 10,
      colorToken: "task-facilities",
      icon: "sparkle",
      locations: [SCHEDULE_TYPE_IDS.stacks],
    }),
    task(DEFAULT_TASK_IDS.shifting, "Shifting", {
      estimatedMinutes: 60,
      order: 11,
      colorToken: "task-collections",
      icon: "shift",
      locations: [SCHEDULE_TYPE_IDS.stacks],
    }),
    task(DEFAULT_TASK_IDS.openLibrary, "Open the Library", {
      estimatedMinutes: 30,
      maxAssignees: 2,
      openingDependency: true,
      order: 12,
      colorToken: "task-operations",
      icon: "sunrise",
      locations: [SCHEDULE_TYPE_IDS.desk],
    }),
    task(DEFAULT_TASK_IDS.closeLibrary, "Close the Library", {
      estimatedMinutes: 30,
      maxAssignees: 2,
      closingDependency: true,
      order: 13,
      colorToken: "task-operations",
      icon: "sunset",
      locations: [SCHEDULE_TYPE_IDS.desk],
    }),
    task(DEFAULT_TASK_IDS.scanningLawJournals, "Scanning for Law Journals", {
      estimatedMinutes: 60,
      maxAssignees: 2,
      order: 14,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.scanningGeneral, "Scanning (General)", {
      estimatedMinutes: 60,
      order: 15,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.holdsPullList, "Holds Pull-List Processing", {
      estimatedMinutes: 30,
      order: 16,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.facultyBorrowing, "Faculty Borrowing Service Matters", {
      estimatedMinutes: 60,
      maxAssignees: 2,
      order: 17,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.meeting30, "Meeting (half-hour)", {
      estimatedMinutes: 30,
      order: 18,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.meeting60, "Meeting (1-hour)", {
      estimatedMinutes: 60,
      order: 19,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.professionalDevelopment, "Professional Development", {
      estimatedMinutes: 60,
      maxAssignees: 20,
      order: 20,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.adminTime, "Admin Time", {
      estimatedMinutes: 60,
      order: 21,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.reservesProcessing, "Reserves Processing", {
      estimatedMinutes: 60,
      order: 22,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.illProcessing, "Interlibrary Loan Processing", {
      estimatedMinutes: 60,
      order: 23,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.eventSupport, "Event (Support)", {
      estimatedMinutes: 60,
      order: 24,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.libanswers, "LibAnswers Responding", {
      estimatedMinutes: 60,
      order: 25,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
    task(DEFAULT_TASK_IDS.otherDuties, "Other Duties (See Manager)", {
      estimatedMinutes: 60,
      order: 26,
      locations: [SCHEDULE_TYPE_IDS.main],
    }),
  ];
}
