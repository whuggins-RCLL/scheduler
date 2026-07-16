import type {
  AuditEvent,
  AvailabilityPattern,
  BreakPolicy,
  ComplianceOverride,
  DailyNote,
  Department,
  GlobalException,
  EmployeeProfile,
  Invitation,
  LeaveRecord,
  LeaveType,
  Location,
  ManagerNote,
  Notification,
  OperatingHours,
  Position,
  Schedule,
  Shift,
  StudentAvailabilityWindow,
  SwapRequest,
  Task,
  Team,
  UserAccount,
  WorkingHoursPattern,
} from "@/domain/types";
import type { CoverageRequirement } from "@/domain/scheduling";

/**
 * A full tenant snapshot. Every collection the platform uses lives here as a
 * plain array so the same shape can be serialized to Firestore, held in memory
 * for local development, or passed into the pure engines for tests.
 */
export interface Database {
  users: UserAccount[];
  employees: EmployeeProfile[];
  departments: Department[];
  teams: Team[];
  locations: Location[];
  operatingHours: OperatingHours[];
  positions: Position[];
  tasks: Task[];
  availability: AvailabilityPattern[];
  workingHours: WorkingHoursPattern[];
  leaveTypes: LeaveType[];
  leave: LeaveRecord[];
  schedules: Schedule[];
  shifts: Shift[];
  coverage: CoverageRequirement[];
  swaps: SwapRequest[];
  notes: ManagerNote[];
  dailyNotes: DailyNote[];
  breakPolicies: BreakPolicy[];
  overrides: ComplianceOverride[];
  invitations: Invitation[];
  notifications: Notification[];
  audit: AuditEvent[];
  studentAvailabilityWindows: StudentAvailabilityWindow[];
  globalExceptions: GlobalException[];
}

export function emptyDatabase(): Database {
  return {
    users: [],
    employees: [],
    departments: [],
    teams: [],
    locations: [],
    operatingHours: [],
    positions: [],
    tasks: [],
    availability: [],
    workingHours: [],
    leaveTypes: [],
    leave: [],
    schedules: [],
    shifts: [],
    coverage: [],
    swaps: [],
    notes: [],
    dailyNotes: [],
    breakPolicies: [],
    overrides: [],
    invitations: [],
    notifications: [],
    audit: [],
    studentAvailabilityWindows: [],
    globalExceptions: [],
  };
}
