/**
 * Cardinal Shift domain model.
 *
 * These types are the single source of truth for the scheduling engine,
 * compliance engine, fairness analytics, and the data store. They are
 * deliberately serialization-friendly (plain strings/numbers) so the same
 * shapes flow through Firestore, the in-memory store, and the UI unchanged.
 *
 * Time convention: dates are ISO calendar days ("YYYY-MM-DD"); times of day
 * are minutes-from-midnight (0-1439). Keeping clock math in integer minutes
 * makes the engines deterministic and free of timezone drift.
 */

export type ISODate = string; // "2026-07-14"
export type MinuteOfDay = number; // 0..1439
export type ISODateTime = string; // full ISO timestamp for audit/records

export type Role =
  | "SUPER_ADMIN"
  | "MANAGER"
  | "SCHEDULER"
  | "EMPLOYEE"
  | "VIEWER"
  | "AUDITOR";

export type AccountState =
  | "invited"
  | "pending_approval"
  | "active"
  | "temporarily_inactive"
  | "archived"
  | "access_revoked";

export type EmploymentClassification =
  | "student_worker"
  | "non_exempt_staff"
  | "exempt_staff"
  | "manager"
  | "temporary"
  | "casual"
  | "other";

/** A scope restricts a role grant to particular org units. Empty = org-wide. */
export interface RoleScope {
  locationIds?: string[];
  departmentIds?: string[];
  teamIds?: string[];
}

export interface RoleGrant {
  role: Role;
  scope?: RoleScope;
}

export interface UserAccount {
  id: string;
  email: string; // normalized lowercase
  displayName: string;
  state: AccountState;
  roles: RoleGrant[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface EmployeeProfile {
  id: string; // matches UserAccount.id
  legalName: string;
  preferredName?: string;
  email: string;
  pronouns?: string;
  employeeNumber?: string;
  classification: EmploymentClassification;
  departmentId?: string;
  teamId?: string;
  primaryLocationId?: string;
  eligibleLocationIds: string[];
  primaryManagerId?: string;
  additionalManagerIds: string[];
  startDate?: ISODate;
  endDate?: ISODate;
  active: boolean;
  /** False until an administrator confirms scheduling fields such as classification and hours. */
  setupComplete?: boolean;
  targetWeeklyHours: number;
  minWeeklyHours: number;
  maxWeeklyHours: number;
  maxDailyHours: number;
  earliestStart: MinuteOfDay;
  latestEnd: MinuteOfDay;
  minTurnaroundMinutes: number;
  overtimeEligible: boolean;
  breakPolicyId: string;
  qualifiedPositionIds: string[];
  qualifiedTaskIds: string[];
  employmentPercentage: number; // 0..1, used to normalize fairness
  googleCalendarConnected: boolean;
  notificationPrefs: NotificationPreferences;
  managerNotes?: string; // private, manager-only
  employeeVisibleNotes?: string;
}

export interface NotificationPreferences {
  inApp: boolean;
  email: boolean;
  calendar: boolean;
  quietHoursStart?: MinuteOfDay;
  quietHoursEnd?: MinuteOfDay;
  digest: boolean;
}

export interface Department {
  id: string;
  name: string;
  active: boolean;
}

export interface Team {
  id: string;
  name: string;
  departmentId?: string;
  active: boolean;
}

export interface Location {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  timeZone: string;
  minStaffing: number;
  openBufferMinutes: number;
  closeBufferMinutes: number;
  libcalId?: string;
  active: boolean;
}

/** Normal weekly operating hours plus dated exceptions. */
export interface OperatingHours {
  locationId: string;
  /** weekday 0=Sun..6=Sat -> intervals in minutes-of-day. Empty array = closed. */
  weekly: Record<number, TimeInterval[]>;
  exceptions: HoursException[];
}

export interface HoursException {
  date: ISODate;
  closed: boolean;
  intervals: TimeInterval[];
  reason?: string;
  source: "manual" | "libcal" | "mock";
}

export interface TimeInterval {
  start: MinuteOfDay;
  end: MinuteOfDay;
}

export type ConstraintClass =
  | "hard" // schedule cannot be generated/published
  | "overrideable" // manager may override with reason
  | "warning" // may proceed after acknowledgement
  | "info"; // informational only

/** How a manager-authored structured rule binds the scheduling engine. */
export type RuleConstraintClass = "hard" | "soft" | "info";

/** How a position must be staffed / a task performed — cadence for automation. */
export type FrequencyMode = "per_operational_hour" | "times_per_day" | "times_per_week";

export interface SchedulingFrequency {
  mode: FrequencyMode;
  /**
   * Occurrences per unit: per day for `times_per_day`, per week for
   * `times_per_week`. Ignored for `per_operational_hour` (one per open hour).
   */
  count: number;
  /** Weekdays it applies to (0=Sun..6=Sat). Empty = every open day. */
  weekdays: number[];
}

export interface Position {
  id: string;
  name: string;
  shortLabel: string;
  description?: string;
  colorToken: string;
  icon: string;
  /** Primary schedule type — kept for backward compatibility. */
  locationId?: string;
  /** Schedule types this position may be staffed on (many-to-many). */
  applicableLocationIds: string[];
  departmentId?: string;
  requiredQualification?: string;
  minStaffing: number;
  preferredStaffing: number;
  maxStaffing: number;
  /**
   * When true the position has no upper limit on how many people may be
   * seated/assigned at once ("unlimited seatings"). `maxStaffing` is ignored
   * while this is set, which saves administrators from tuning caps for posts
   * such as project time, meetings, or overflow desk coverage.
   */
  unlimitedSeating?: boolean;
  minAssignmentMinutes: number;
  maxContinuousMinutes: number;
  requiresPhysicalPresence: boolean;
  blocksOtherAssignments: boolean;
  countsAsPublicService: boolean;
  selfClaimable: boolean;
  swapsAllowed: boolean;
  eligibleClassifications: EmploymentClassification[];
  /** How often this position must be staffed (cadence for automated scheduling). */
  frequency?: SchedulingFrequency;
  order: number;
  active: boolean;
}

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  id: string;
  name: string;
  description?: string;
  category: string;
  colorToken: string;
  icon: string;
  requiredQualification?: string;
  applicableLocationIds: string[];
  /** Positions this task may be assigned alongside during scheduling. */
  applicablePositionIds: string[];
  estimatedMinutes: number;
  priority: TaskPriority;
  minAssignees: number;
  maxAssignees: number;
  allowedDuringPosition: boolean;
  requiresAcknowledgement: boolean;
  checklist: string[];
  openingDependency: boolean;
  closingDependency: boolean;
  /** How often this task must be performed (cadence for automated scheduling). */
  frequency?: SchedulingFrequency;
  order: number;
  active: boolean;
}

export type AvailabilityKind = "preferred" | "available" | "unavailable";

export interface AvailabilityBlock {
  weekday: number; // 0=Sun..6=Sat
  start: MinuteOfDay;
  end: MinuteOfDay;
  kind: AvailabilityKind;
}

/** How long an unpaid meal break the person prefers when one is scheduled. */
export type MealBreakMinutes = 30 | 60;

export interface AvailabilityPattern {
  id: string;
  employeeId: string;
  effectiveStart?: ISODate;
  effectiveEnd?: ISODate;
  label?: string; // e.g. "Fall term"
  blocks: AvailabilityBlock[];
  note?: string;
  /**
   * The person's preferred unpaid meal-break length (30 minutes or 1 hour).
   * Required from every staff member; the scheduling engine uses it (never
   * below the legal minimum) when it plans an unpaid meal for a long shift.
   */
  mealBreakMinutes?: MealBreakMinutes;
  /**
   * For student workers: manager-approved subset of `blocks`. Scheduling uses
   * only approved hours; students may sign up for more than managers approve.
   */
  approvedBlocks?: AvailabilityBlock[];
  approvedBy?: string;
  approvedAt?: ISODateTime;
  updatedBy: string; // for manager-entered audit attribution
  updatedAt: ISODateTime;
}

/** Where someone expects to work on a given weekday. */
export type WorkLocation = "on_site" | "remote";

/** Per-weekday working schedule — start/end times or a regular day off. */
export interface WorkingDaySchedule {
  weekday: number; // 0=Sun..6=Sat
  regularDayOff: boolean;
  start?: MinuteOfDay;
  end?: MinuteOfDay;
  /** On-site vs remote — applies to both exempt and non-exempt schedules. */
  workLocation?: WorkLocation;
}

/**
 * When someone expects to be working vs off, tracked separately from desk
 * availability. Used for break reminders and hour planning — not for desk coverage.
 */
export interface WorkingHoursPattern {
  id: string;
  employeeId: string;
  effectiveStart?: ISODate;
  effectiveEnd?: ISODate;
  label?: string;
  days: WorkingDaySchedule[];
  note?: string;
  updatedBy: string;
  updatedAt: ISODateTime;
}

export interface LeaveType {
  id: string;
  name: string;
  paid: boolean;
  approvalRequired: boolean;
  countsAgainstBalance: boolean;
  visibility: "employee" | "manager" | "team_generic";
  blocksScheduling: boolean; // true=hard block, false=warn only
  requiresNote: boolean;
  eligibleClassifications: EmploymentClassification[];
  /**
   * Whether an employee may submit this type themselves. When false, only a
   * manager may record it on the employee's behalf.
   */
  employeeSelectable: boolean;
  active: boolean;
}

export type LeaveStatus = "requested" | "approved" | "denied" | "cancelled" | "recorded";

export interface LeaveRecord {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: ISODate;
  endDate: ISODate;
  partialDay: boolean;
  start?: MinuteOfDay;
  end?: MinuteOfDay;
  status: LeaveStatus;
  note?: string;
  /** When set, this record is managed by an admin global exception. */
  globalExceptionId?: string;
  enteredBy: string; // actor id (self or manager)
  decidedBy?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Organization-wide exception (e.g. university holidays) that admins maintain
 * once and sync to every employee's availability exceptions as all-day blocks.
 */
export interface GlobalException {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  note?: string;
  createdBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ShiftStatus =
  | "draft"
  | "proposed"
  | "published"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "open"
  | "swap_pending"
  | "coverage_needed";

export type ShiftSource =
  | "ai_generated"
  | "template_generated"
  | "manager_created"
  | "employee_claimed"
  | "shift_swap"
  | "imported";

export interface Break {
  kind: "meal" | "rest";
  start: MinuteOfDay;
  end: MinuteOfDay;
  paid: boolean;
}

export interface Shift {
  id: string;
  scheduleId: string;
  employeeId: string | null; // null = open/unassigned
  positionId: string;
  locationId: string;
  date: ISODate;
  start: MinuteOfDay;
  end: MinuteOfDay;
  breaks: Break[];
  taskIds: string[];
  status: ShiftStatus;
  source: ShiftSource;
  notes?: string;
  locked: boolean;
  scheduleVersion: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Schedule {
  id: string;
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  status: "draft" | "published" | "archived";
  version: number;
  publishedVersion?: number;
  createdBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type SwapKind = "direct" | "offer_pool" | "give_up" | "pick_up";
export type SwapStatus =
  | "pending"
  | "auto_approved"
  | "manager_review"
  | "accepted"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export interface SwapRequest {
  id: string;
  kind: SwapKind;
  shiftId: string;
  fromEmployeeId: string | null;
  toEmployeeId: string | null; // null for open pool
  status: SwapStatus;
  reason?: string;
  createdAt: ISODateTime;
  expiresAt?: ISODateTime;
  decidedBy?: string;
  history: SwapEvent[];
}

export interface SwapEvent {
  at: ISODateTime;
  actor: string;
  action: string;
  detail?: string;
}

/** Structured manager note that the engine may consume as a rule. */
export type NoteType =
  | "standing_rule"
  | "temporary_instruction"
  | "employee_preference"
  | "team_preference"
  | "coverage_concern"
  | "event_demand"
  | "training_limitation"
  | "operational_exception"
  | "ai_feedback"
  | "general";

export interface ManagerNote {
  id: string;
  type: NoteType;
  title: string;
  body: string;
  visibility: "manager" | "team" | "employee";
  priority: TaskPriority;
  effectiveStart?: ISODate;
  effectiveEnd?: ISODate;
  authorId: string;
  employeeIds: string[];
  positionIds: string[];
  locationIds: string[];
  taskIds: string[];
  usableByEngine: boolean;
  ruleClass: "hard" | "soft" | "info";
  structuredRule?: StructuredRule;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A manager note interpreted into a machine-applicable constraint. */
export interface StructuredRule {
  kind:
    | "max_consecutive_minutes"
    | "avoid_position"
    | "prefer_position"
    | "max_daily_minutes"
    | "no_open_close_same_day"
    | "pair_with_coverage";
  employeeId?: string;
  positionId?: string;
  thresholdMinutes?: number;
  constraintClass: RuleConstraintClass;
  confirmed: boolean; // manager confirmed the AI interpretation
}

export interface BreakPolicy {
  id: string;
  name: string;
  classification: EmploymentClassification;
  /** CA-style rules. All durations in minutes. */
  restPerHoursWorked: { thresholdMinutes: number; restMinutes: number }[];
  mealRequiredAfterMinutes: number;
  mealMinDurationMinutes: number;
  mealMustStartByMinutesWorked: number;
  secondMealAfterMinutes: number;
  minTurnaroundMinutes: number;
  dailyOvertimeMinutes: number;
  weeklyOvertimeMinutes: number;
  splitShiftGapMinutes: number;
  maxContinuousPublicServiceMinutes: number;
  version: number;
}

export type Severity = "hard" | "overrideable" | "warning" | "info";

export interface ComplianceFinding {
  id: string;
  ruleId: string;
  severity: Severity;
  employeeId: string | null;
  date: ISODate;
  shiftIds: string[];
  message: string; // plain-language explanation
  remediation: string;
  overrideable: boolean;
}

export interface ComplianceOverride {
  id: string;
  findingRuleId: string;
  employeeId: string | null;
  date: ISODate;
  reason: string;
  actorId: string;
  createdAt: ISODateTime;
}

export interface FairnessMetric {
  employeeId: string;
  totalMinutes: number;
  publicServiceMinutes: number;
  openingCount: number;
  closingCount: number;
  eveningMinutes: number;
  weekendMinutes: number;
  preferredAssignmentCount: number;
  nonPreferredAssignmentCount: number;
  taskVariety: number;
  maxConsecutiveServiceMinutes: number;
  fragmentation: number; // count of separate shifts
  /** normalized load 0..~2, 1.0 = exactly at fair share for their availability */
  normalizedLoad: number;
}

export interface FairnessSnapshot {
  scheduleId: string;
  metrics: FairnessMetric[];
  giniPublicService: number; // 0=perfectly equal, 1=maximally unequal
  createdAt: ISODateTime;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  correlationId?: string;
  source: string;
  scheduleVersion?: number;
  createdAt: ISODateTime;
}

/**
 * A short dashboard announcement that rolls in an embedded feed. Managers author
 * notes and set a visibility window (begin/end date); admins publish/unpublish.
 * Only published notes within their window appear in the staff-facing feed.
 */
export interface DailyNote {
  id: string;
  body: string;
  authorId: string;
  published: boolean;
  /** Inclusive visibility window. Empty = always visible while published. */
  visibleFrom?: ISODate;
  visibleTo?: ISODate;
  pinned: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Submission window for student desk-availability grids. Managers enable the
 * window, set open/close dates, and may manually freeze editing. After the
 * close date the grid auto-locks for students (managers may still edit).
 */
export interface StudentAvailabilityWindow {
  id: string;
  scheduleId: string;
  label: string;
  /** First calendar day students may edit (inclusive). */
  submissionOpens: ISODate;
  /** Last calendar day students may edit (inclusive). */
  submissionCloses: ISODate;
  /** When false, students cannot edit regardless of dates. */
  enabled: boolean;
  /** Manual lock — students cannot edit even within the open window. */
  frozen: boolean;
  updatedBy: string;
  updatedAt: ISODateTime;
}

export interface Invitation {
  id: string;
  email: string;
  token: string;
  role: Role;
  managerId?: string;
  departmentId?: string;
  expiresAt: ISODateTime;
  redeemedAt?: ISODateTime;
  revoked: boolean;
  createdBy: string;
  createdAt: ISODateTime;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: ISODateTime;
}
