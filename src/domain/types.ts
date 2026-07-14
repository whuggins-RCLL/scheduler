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

export interface Position {
  id: string;
  name: string;
  shortLabel: string;
  description?: string;
  colorToken: string;
  icon: string;
  locationId?: string;
  departmentId?: string;
  requiredQualification?: string;
  minStaffing: number;
  preferredStaffing: number;
  maxStaffing: number;
  minAssignmentMinutes: number;
  maxContinuousMinutes: number;
  requiresPhysicalPresence: boolean;
  blocksOtherAssignments: boolean;
  countsAsPublicService: boolean;
  selfClaimable: boolean;
  swapsAllowed: boolean;
  eligibleClassifications: EmploymentClassification[];
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
  estimatedMinutes: number;
  priority: TaskPriority;
  minAssignees: number;
  maxAssignees: number;
  allowedDuringPosition: boolean;
  requiresAcknowledgement: boolean;
  checklist: string[];
  openingDependency: boolean;
  closingDependency: boolean;
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

export interface AvailabilityPattern {
  id: string;
  employeeId: string;
  effectiveStart?: ISODate;
  effectiveEnd?: ISODate;
  label?: string; // e.g. "Fall term"
  blocks: AvailabilityBlock[];
  note?: string;
  updatedBy: string; // for manager-entered audit attribution
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
   * manager may record it on the employee's behalf (e.g. Sick leave).
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
  enteredBy: string; // actor id (self or manager)
  decidedBy?: string;
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
