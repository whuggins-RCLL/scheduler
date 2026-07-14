import type {
  AvailabilityPattern,
  EmployeeProfile,
  FairnessMetric,
  FairnessSnapshot,
  Position,
  Shift,
} from "./types";
import { availableMinutesOnDate } from "./availability";
import { EVENING_START, isWeekend } from "./time";

/**
 * Fairness analytics.
 *
 * Fairness is deliberately NOT "everyone gets equal hours". We compute a set of
 * independent load dimensions (desk time, opening/closing counts, evening and
 * weekend minutes, preference satisfaction, task variety, fragmentation) and a
 * `normalizedLoad` that divides an employee's public-service minutes by their
 * fair share — where the fair share is proportional to how available they are
 * and their target hours. This is why limited availability or approved leave
 * does not unfairly penalize anyone: they simply have a smaller fair share.
 */

export interface FairnessInput {
  scheduleId: string;
  employees: EmployeeProfile[];
  shifts: Shift[];
  positions: Position[];
  patterns: Record<string, AvailabilityPattern[]>; // by employeeId
  dates: string[]; // dates in scope
  now: string; // ISO timestamp stamped by caller (keeps engine pure)
}

function paidMinutes(s: Shift): number {
  const unpaid = s.breaks.filter((b) => !b.paid).reduce((m, b) => m + (b.end - b.start), 0);
  return Math.max(0, s.end - s.start - unpaid);
}

export function computeFairness(input: FairnessInput): FairnessSnapshot {
  const { employees, shifts, positions, patterns, dates } = input;
  const posById = new Map(positions.map((p) => [p.id, p]));

  const metrics: FairnessMetric[] = employees.map((emp) => {
    const empShifts = shifts
      .filter((s) => s.employeeId === emp.id && s.status !== "cancelled")
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    let totalMinutes = 0;
    let publicServiceMinutes = 0;
    let openingCount = 0;
    let closingCount = 0;
    let eveningMinutes = 0;
    let weekendMinutes = 0;
    let preferredAssignmentCount = 0;
    let nonPreferredAssignmentCount = 0;
    let maxConsecutiveServiceMinutes = 0;
    const taskSet = new Set<string>();

    for (const s of empShifts) {
      const mins = paidMinutes(s);
      totalMinutes += mins;
      const pos = posById.get(s.positionId);
      if (pos?.countsAsPublicService) {
        publicServiceMinutes += mins;
        maxConsecutiveServiceMinutes = Math.max(maxConsecutiveServiceMinutes, s.end - s.start);
      }
      if (emp.qualifiedPositionIds.includes(s.positionId)) preferredAssignmentCount++;
      else nonPreferredAssignmentCount++;
      if (s.taskIds.some((t) => /open/i.test(t)) || pos?.name.toLowerCase().includes("opening"))
        openingCount++;
      if (s.taskIds.some((t) => /clos/i.test(t)) || pos?.name.toLowerCase().includes("closing"))
        closingCount++;
      if (s.start < EVENING_START && s.end > EVENING_START)
        eveningMinutes += s.end - EVENING_START;
      else if (s.start >= EVENING_START) eveningMinutes += mins;
      if (isWeekend(s.date)) weekendMinutes += mins;
      s.taskIds.forEach((t) => taskSet.add(t));
    }

    // Fair share of public service proportional to availability * target.
    const availMinutes = dates.reduce(
      (sum, d) => sum + availableMinutesOnDate(patterns[emp.id] ?? [], d),
      0,
    );
    const capacity = Math.max(1, availMinutes * Math.max(0.1, emp.employmentPercentage));

    return {
      employeeId: emp.id,
      totalMinutes,
      publicServiceMinutes,
      openingCount,
      closingCount,
      eveningMinutes,
      weekendMinutes,
      preferredAssignmentCount,
      nonPreferredAssignmentCount,
      taskVariety: taskSet.size,
      maxConsecutiveServiceMinutes,
      fragmentation: empShifts.length,
      normalizedLoad: publicServiceMinutes / capacity,
      _capacity: capacity,
    } as FairnessMetric & { _capacity: number };
  });

  // Normalize load so the average across staffed employees is ~1.0.
  const staffed = (metrics as (FairnessMetric & { _capacity: number })[]).filter(
    (m) => m.publicServiceMinutes > 0,
  );
  const totalService = staffed.reduce((s, m) => s + m.publicServiceMinutes, 0);
  const totalCapacity = staffed.reduce((s, m) => s + m._capacity, 0) || 1;
  const fairRate = totalService / totalCapacity;
  for (const m of metrics as (FairnessMetric & { _capacity: number })[]) {
    m.normalizedLoad = fairRate > 0 ? m.publicServiceMinutes / (m._capacity * fairRate) : 0;
    delete (m as { _capacity?: number })._capacity;
  }

  return {
    scheduleId: input.scheduleId,
    metrics,
    giniPublicService: gini(staffed.map((m) => m.publicServiceMinutes)),
    createdAt: input.now,
  };
}

/** Gini coefficient: 0 = perfectly equal, →1 = maximally unequal. */
export function gini(values: number[]): number {
  const xs = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * xs[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}
