import type {
  AvailabilityPattern,
  BreakPolicy,
  ComplianceFinding,
  EmploymentClassification,
  ISODate,
  LeaveRecord,
  LeaveType,
  Position,
  Severity,
  Shift,
} from "./types";
import { isAvailableForShift } from "./availability";
import { durationMinutes, overlaps, formatTime12 } from "./time";

/**
 * California meal/rest + operational compliance engine.
 *
 * Rules are data-driven from a versioned {@link BreakPolicy}, never hard-coded
 * into UI. Every finding carries a plain-language message, the affected
 * employee/time, a severity, and whether a manager may override it.
 *
 * Exempt classifications are intentionally exempted from meal/rest/overtime
 * checks — legal status is configured, never inferred from a title.
 */

const EXEMPT: EmploymentClassification[] = ["exempt_staff"];

export interface ComplianceInput {
  employeeId: string;
  classification: EmploymentClassification;
  date: ISODate;
  shifts: Shift[]; // all shifts for this employee on this date
  policy: BreakPolicy;
  positions: Position[];
  patterns?: AvailabilityPattern[];
  leave?: LeaveRecord[];
  leaveTypes?: LeaveType[];
  weeklyMinutesSoFar?: number; // minutes already worked earlier in the week
}

function finding(
  ruleId: string,
  severity: Severity,
  employeeId: string | null,
  date: ISODate,
  shiftIds: string[],
  message: string,
  remediation: string,
): ComplianceFinding {
  return {
    id: `${ruleId}:${employeeId ?? "open"}:${date}`,
    ruleId,
    severity,
    employeeId,
    date,
    shiftIds,
    message,
    remediation,
    overrideable: severity === "overrideable" || severity === "warning",
  };
}

function positionById(positions: Position[], id: string): Position | undefined {
  return positions.find((p) => p.id === id);
}

/** Validate a single employee's full workday. */
export function validateWorkday(input: ComplianceInput): ComplianceFinding[] {
  const { employeeId, classification, date, policy, positions } = input;
  const findings: ComplianceFinding[] = [];
  const shifts = [...input.shifts]
    .filter((s) => s.status !== "cancelled")
    .sort((a, b) => a.start - b.start);
  if (shifts.length === 0) return findings;

  const workMinutes = shifts.reduce((sum, s) => {
    const paidBreaks = s.breaks.filter((b) => b.paid);
    const unpaid = s.breaks.filter((b) => !b.paid).reduce((m, b) => m + (b.end - b.start), 0);
    void paidBreaks;
    return sum + durationMinutes(s.start, s.end) - unpaid;
  }, 0);

  // --- Overlapping shifts (always a hard conflict) ---
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (overlaps(shifts[i], shifts[j])) {
        findings.push(
          finding(
            "overlapping_shifts",
            "hard",
            employeeId,
            date,
            [shifts[i].id, shifts[j].id],
            `Two shifts overlap (${formatTime12(shifts[i].start)}–${formatTime12(shifts[i].end)} and ${formatTime12(shifts[j].start)}–${formatTime12(shifts[j].end)}).`,
            "Move or shorten one of the overlapping shifts.",
          ),
        );
      }
    }
  }

  // --- Work during approved blocking leave ---
  if (input.leave && input.leaveTypes && input.patterns) {
    for (const s of shifts) {
      const ok = isAvailableForShift(
        input.patterns,
        input.leave,
        input.leaveTypes,
        date,
        { start: s.start, end: s.end },
      );
      if (!ok) {
        // Distinguish leave from plain unavailability.
        const onBlockingLeave = input.leave.some((l) => {
          if (l.status !== "approved" && l.status !== "recorded") return false;
          if (date < l.startDate || date > l.endDate) return false;
          const type = input.leaveTypes!.find((t) => t.id === l.leaveTypeId);
          return type?.blocksScheduling ?? true;
        });
        if (onBlockingLeave) {
          findings.push(
            finding(
              "work_during_leave",
              "hard",
              employeeId,
              date,
              [s.id],
              `Scheduled during approved leave (${formatTime12(s.start)}–${formatTime12(s.end)}).`,
              "Remove the shift or cancel the conflicting leave.",
            ),
          );
        } else {
          findings.push(
            finding(
              "outside_availability",
              "overrideable",
              employeeId,
              date,
              [s.id],
              `Scheduled outside stated availability (${formatTime12(s.start)}–${formatTime12(s.end)}).`,
              "Confirm the employee can work this time, or adjust availability.",
            ),
          );
        }
      }
    }
  }

  // Exempt staff skip meal/rest/overtime checks.
  if (EXEMPT.includes(classification)) return findings;

  // --- Meal period requirement ---
  const meals = shifts.flatMap((s) => s.breaks.filter((b) => b.kind === "meal").map((b) => ({ b, s })));
  if (workMinutes > policy.mealRequiredAfterMinutes && meals.length === 0) {
    findings.push(
      finding(
        "meal_required",
        "overrideable",
        employeeId,
        date,
        shifts.map((s) => s.id),
        `Works ${(workMinutes / 60).toFixed(1)} h with no meal period; a meal is required after ${(policy.mealRequiredAfterMinutes / 60).toFixed(1)} h.`,
        `Add an unpaid meal of at least ${policy.mealMinDurationMinutes} minutes, or record a valid waiver.`,
      ),
    );
  }

  // --- Meal timing + minimum duration + uninterrupted ---
  const dayStart = shifts[0].start;
  for (const { b, s } of meals) {
    const workedBeforeMeal = b.start - dayStart; // simplification: continuous day
    if (workedBeforeMeal > policy.mealMustStartByMinutesWorked) {
      findings.push(
        finding(
          "meal_timing",
          "overrideable",
          employeeId,
          date,
          [s.id],
          `Meal begins after ${(workedBeforeMeal / 60).toFixed(1)} h of work; it must begin by the end of hour ${(policy.mealMustStartByMinutesWorked / 60).toFixed(0)}.`,
          "Schedule the meal earlier in the shift.",
        ),
      );
    }
    if (b.end - b.start < policy.mealMinDurationMinutes) {
      findings.push(
        finding(
          "meal_duration",
          "hard",
          employeeId,
          date,
          [s.id],
          `Meal is only ${b.end - b.start} minutes; minimum is ${policy.mealMinDurationMinutes}.`,
          `Extend the meal to at least ${policy.mealMinDurationMinutes} minutes.`,
        ),
      );
    }
    // Another concurrent shift (a task block, second assignment) overlapping an
    // unpaid meal means the meal is not duty-free.
    if (!b.paid) {
      const concurrentDuty = shifts.some(
        (other) => other.id !== s.id && overlaps({ start: b.start, end: b.end }, other),
      );
      if (concurrentDuty) {
        findings.push(
          finding(
            "meal_interrupted",
            "hard",
            employeeId,
            date,
            [s.id],
            `Another assignment overlaps the unpaid meal at ${formatTime12(b.start)}.`,
            "A meal period must be duty-free; clear all assignments during the meal window.",
          ),
        );
      }
    }
  }

  // --- Second meal for long shifts ---
  if (workMinutes > policy.secondMealAfterMinutes && meals.length < 2) {
    findings.push(
      finding(
        "second_meal",
        "overrideable",
        employeeId,
        date,
        shifts.map((s) => s.id),
        `Works ${(workMinutes / 60).toFixed(1)} h; a second meal is required beyond ${(policy.secondMealAfterMinutes / 60).toFixed(1)} h.`,
        "Add a second meal period or record a valid second-meal waiver.",
      ),
    );
  }

  // --- Rest periods (paid) based on total hours worked ---
  const requiredRests = policy.restPerHoursWorked.filter(
    (r) => workMinutes >= r.thresholdMinutes,
  ).length;
  const restCount = shifts.reduce((n, s) => n + s.breaks.filter((b) => b.kind === "rest").length, 0);
  if (restCount < requiredRests) {
    findings.push(
      finding(
        "rest_periods",
        "warning",
        employeeId,
        date,
        shifts.map((s) => s.id),
        `${requiredRests} paid rest period(s) required for ${(workMinutes / 60).toFixed(1)} h; ${restCount} scheduled.`,
        "Add the missing paid rest break(s).",
      ),
    );
  }

  // --- Excessive continuous public-service time ---
  for (const s of shifts) {
    const pos = positionById(positions, s.positionId);
    if (!pos?.countsAsPublicService) continue;
    // longest continuous stretch = shift length minus any break inside it
    const breaksInside = s.breaks.filter((b) => b.start >= s.start && b.end <= s.end);
    let longest = 0;
    let cursor = s.start;
    for (const b of [...breaksInside].sort((a, x) => a.start - x.start)) {
      longest = Math.max(longest, b.start - cursor);
      cursor = b.end;
    }
    longest = Math.max(longest, s.end - cursor);
    if (longest > policy.maxContinuousPublicServiceMinutes) {
      findings.push(
        finding(
          "continuous_public_service",
          "warning",
          employeeId,
          date,
          [s.id],
          `${(longest / 60).toFixed(1)} h of continuous public-service coverage exceeds the ${(policy.maxContinuousPublicServiceMinutes / 60).toFixed(1)} h guideline.`,
          "Insert a relief break or rotate coverage.",
        ),
      );
    }
  }

  // --- Daily overtime ---
  if (workMinutes > policy.dailyOvertimeMinutes) {
    findings.push(
      finding(
        "daily_overtime",
        "warning",
        employeeId,
        date,
        shifts.map((s) => s.id),
        `Works ${(workMinutes / 60).toFixed(1)} h, above the ${(policy.dailyOvertimeMinutes / 60).toFixed(0)} h daily overtime threshold.`,
        "Reduce hours or confirm overtime is authorized.",
      ),
    );
  }

  // --- Weekly overtime ---
  if (input.weeklyMinutesSoFar != null) {
    const weekTotal = input.weeklyMinutesSoFar + workMinutes;
    if (weekTotal > policy.weeklyOvertimeMinutes) {
      findings.push(
        finding(
          "weekly_overtime",
          "warning",
          employeeId,
          date,
          shifts.map((s) => s.id),
          `Weekly total reaches ${(weekTotal / 60).toFixed(1)} h, above the ${(policy.weeklyOvertimeMinutes / 60).toFixed(0)} h weekly threshold.`,
          "Rebalance hours across the week.",
        ),
      );
    }
  }

  // --- Split shift ---
  for (let i = 1; i < shifts.length; i++) {
    const gap = shifts[i].start - shifts[i - 1].end;
    if (gap > policy.splitShiftGapMinutes) {
      findings.push(
        finding(
          "split_shift",
          "info",
          employeeId,
          date,
          [shifts[i - 1].id, shifts[i].id],
          `Split shift with a ${(gap / 60).toFixed(1)} h unpaid gap.`,
          "Confirm the split is intended; split-shift premium may apply.",
        ),
      );
    }
  }

  return findings;
}

/**
 * Cross-employee coverage check: an employee at a position that requires
 * physical presence and is the sole staffer, taking a break with no relief.
 */
export function validateBreakCoverage(
  date: ISODate,
  shifts: Shift[],
  positions: Position[],
): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const active = shifts.filter((s) => s.status !== "cancelled" && s.employeeId);
  for (const s of active) {
    const pos = positions.find((p) => p.id === s.positionId);
    if (!pos?.requiresPhysicalPresence || !pos.countsAsPublicService) continue;
    for (const b of s.breaks) {
      // Who else covers this position at this location during the break?
      const relief = active.some(
        (o) =>
          o.id !== s.id &&
          o.positionId === s.positionId &&
          o.locationId === s.locationId &&
          o.start <= b.start &&
          o.end >= b.end &&
          !o.breaks.some((ob) => overlaps(ob, b)),
      );
      if (!relief) {
        findings.push(
          finding(
            "sole_coverage_break",
            "overrideable",
            s.employeeId,
            date,
            [s.id],
            `${pos.name} has no relief coverage during the break at ${formatTime12(b.start)}.`,
            "Schedule a second staffer to cover the service point during this break.",
          ),
        );
      }
    }
  }
  return findings;
}

/** Minimum turnaround between the last shift of one day and the first of the next. */
export function validateTurnaround(
  employeeId: string,
  prevDate: ISODate,
  prevDayShifts: Shift[],
  curDate: ISODate,
  curDayShifts: Shift[],
  policy: BreakPolicy,
): ComplianceFinding[] {
  const prev = prevDayShifts.filter((s) => s.status !== "cancelled");
  const cur = curDayShifts.filter((s) => s.status !== "cancelled");
  if (prev.length === 0 || cur.length === 0) return [];
  const lastEnd = Math.max(...prev.map((s) => s.end)); // minutes into prevDate
  const firstStart = Math.min(...cur.map((s) => s.start)); // minutes into curDate
  // turnaround crosses midnight: (24h - lastEnd) + firstStart
  const turnaround = 1440 - lastEnd + firstStart;
  if (turnaround < policy.minTurnaroundMinutes) {
    return [
      finding(
        "insufficient_turnaround",
        "warning",
        employeeId,
        curDate,
        cur.map((s) => s.id),
        `Only ${(turnaround / 60).toFixed(1)} h between ${prevDate} and ${curDate}; minimum turnaround is ${(policy.minTurnaroundMinutes / 60).toFixed(0)} h.`,
        "Push the next day's start later or shorten the prior evening shift.",
      ),
    ];
  }
  return [];
}

export function severityRank(sev: Severity): number {
  return { hard: 0, overrideable: 1, warning: 2, info: 3 }[sev];
}

export function blocksPublication(findings: ComplianceFinding[]): boolean {
  return findings.some((f) => f.severity === "hard");
}

/** Default, legally-informed (not legal advice) California non-exempt template. */
export function defaultCaliforniaPolicy(
  classification: EmploymentClassification = "non_exempt_staff",
): BreakPolicy {
  return {
    id: `ca-nonexempt-v1`,
    name: "California non-exempt (default)",
    classification,
    restPerHoursWorked: [
      { thresholdMinutes: 210, restMinutes: 10 }, // >3.5h -> 1 rest
      { thresholdMinutes: 360, restMinutes: 10 }, // >6h   -> 2 rests
      { thresholdMinutes: 600, restMinutes: 10 }, // >10h  -> 3 rests
    ],
    mealRequiredAfterMinutes: 300, // 5 h
    mealMinDurationMinutes: 30,
    mealMustStartByMinutesWorked: 300, // by end of 5th hour
    secondMealAfterMinutes: 600, // 10 h
    minTurnaroundMinutes: 480, // 8 h
    dailyOvertimeMinutes: 480, // 8 h
    weeklyOvertimeMinutes: 2400, // 40 h
    splitShiftGapMinutes: 60,
    maxContinuousPublicServiceMinutes: 120, // 2 h at desk
    version: 1,
  };
}
