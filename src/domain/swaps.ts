import type {
  AvailabilityPattern,
  BreakPolicy,
  EmployeeProfile,
  EmploymentClassification,
  LeaveRecord,
  LeaveType,
  Position,
  Shift,
} from "./types";
import { isAvailableForShift } from "./availability";
import { canSwapBetween } from "./student-availability";
import { validateWorkday, blocksPublication } from "./compliance";

export interface SwapEvaluationInput {
  shift: Shift;
  initiatorClassification: EmploymentClassification;
  recipient: EmployeeProfile;
  position: Position;
  recipientPatterns: AvailabilityPattern[];
  recipientLeave: LeaveRecord[];
  leaveTypes: LeaveType[];
  recipientShiftsThatDay: Shift[]; // recipient's existing shifts on the shift date
  policy: BreakPolicy;
  positions: Position[];
  cutoffOk: boolean; // before the configured swap cutoff
  weeklyMinutesSoFar?: number;
}

export interface SwapEvaluation {
  autoApprovable: boolean;
  reasons: string[]; // reasons it CANNOT auto-approve (empty => eligible)
}

/**
 * Determine whether a shift can transfer to `recipient` without manager review.
 * Every gate that fails is reported in plain language so the swap UI (and the
 * manager review queue) can explain the outcome. An empty `reasons` array with
 * `autoApprovable: true` means all policy gates passed.
 */
export function evaluateSwap(input: SwapEvaluationInput): SwapEvaluation {
  const reasons: string[] = [];
  const { shift, recipient, position } = input;

  if (!recipient.active) reasons.push("Recipient is not an active employee.");

  if (!canSwapBetween(input.initiatorClassification, recipient.classification)) {
    reasons.push("Student workers may only swap shifts with other student workers.");
  }

  if (position.requiredQualification && !recipient.qualifiedPositionIds.includes(position.id)) {
    reasons.push(`Recipient is not qualified for ${position.name}.`);
  }

  if (
    position.eligibleClassifications.length > 0 &&
    !position.eligibleClassifications.includes(recipient.classification)
  ) {
    reasons.push("Recipient's classification is not eligible for this position.");
  }

  if (!recipient.eligibleLocationIds.includes(shift.locationId)) {
    reasons.push("Recipient is not eligible at this location.");
  }

  for (const t of shift.taskIds) {
    if (!recipient.qualifiedTaskIds.includes(t)) {
      reasons.push(`Recipient is not qualified for task "${t}".`);
      break;
    }
  }

  const available = isAvailableForShift(
    input.recipientPatterns,
    input.recipientLeave,
    input.leaveTypes,
    shift.date,
    { start: shift.start, end: shift.end },
  );
  if (!available) reasons.push("Recipient is unavailable or on leave during this shift.");

  if (shift.locked) reasons.push("Shift is manager-locked and cannot be swapped.");
  if (!position.swapsAllowed) reasons.push("Swaps are not permitted for this position.");
  if (!input.cutoffOk) reasons.push("Swap requested after the cutoff time.");

  // Compliance: simulate the recipient taking this shift on that day.
  const simulated = input.recipientShiftsThatDay
    .filter((s) => s.id !== shift.id)
    .concat([{ ...shift, employeeId: recipient.id }]);
  const findings = validateWorkday({
    employeeId: recipient.id,
    classification: recipient.classification,
    date: shift.date,
    shifts: simulated,
    policy: input.policy,
    positions: input.positions,
    patterns: input.recipientPatterns,
    leave: input.recipientLeave,
    leaveTypes: input.leaveTypes,
    weeklyMinutesSoFar: input.weeklyMinutesSoFar,
  });
  if (blocksPublication(findings)) {
    reasons.push("Swap would create a hard compliance violation for the recipient.");
  }

  // Max weekly hours guard.
  if (input.weeklyMinutesSoFar != null) {
    const added = shift.end - shift.start;
    if ((input.weeklyMinutesSoFar + added) / 60 > recipient.maxWeeklyHours) {
      reasons.push("Swap would push the recipient over their weekly maximum hours.");
    }
  }

  return { autoApprovable: reasons.length === 0, reasons };
}

/** Filter a candidate pool to only those who could receive the shift. */
export function eligibleRecipients(
  shift: Shift,
  position: Position,
  initiatorClassification: EmploymentClassification,
  candidates: EmployeeProfile[],
  ctx: {
    patterns: Record<string, AvailabilityPattern[]>;
    leave: Record<string, LeaveRecord[]>;
    leaveTypes: LeaveType[];
    shiftsByEmployeeDay: Record<string, Shift[]>; // key `${empId}:${date}`
    policy: BreakPolicy;
    positions: Position[];
    weeklyMinutes: Record<string, number>;
  },
): EmployeeProfile[] {
  return candidates.filter((c) => {
    if (c.id === shift.employeeId) return false;
    const ev = evaluateSwap({
      shift,
      initiatorClassification,
      recipient: c,
      position,
      recipientPatterns: ctx.patterns[c.id] ?? [],
      recipientLeave: ctx.leave[c.id] ?? [],
      leaveTypes: ctx.leaveTypes,
      recipientShiftsThatDay: ctx.shiftsByEmployeeDay[`${c.id}:${shift.date}`] ?? [],
      policy: ctx.policy,
      positions: ctx.positions,
      cutoffOk: true,
      weeklyMinutesSoFar: ctx.weeklyMinutes[c.id] ?? 0,
    });
    return ev.autoApprovable;
  });
}
