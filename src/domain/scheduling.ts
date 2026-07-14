import type {
  AvailabilityPattern,
  Break,
  BreakPolicy,
  ComplianceFinding,
  EmployeeProfile,
  ISODate,
  LeaveRecord,
  LeaveType,
  MinuteOfDay,
  Position,
  Shift,
  StructuredRule,
} from "./types";
import { isAvailableForShift, resolveAvailability } from "./availability";
import { validateWorkday } from "./compliance";
import { EVENING_START, hashString, isWeekend, seededRandom } from "./time";

/**
 * Deterministic weighted-scoring scheduling engine.
 *
 * This is NOT an LLM. Given identical inputs and seed it always produces the
 * same schedule. It fills coverage requirements greedily, scoring every
 * eligible candidate against configurable soft-constraint weights, and refuses
 * to place anyone who violates a hard constraint (unavailable, unqualified,
 * on blocking leave, over hard max hours, overlapping, or manager-locked out).
 *
 * The result is fully explainable: each assignment records why the candidate
 * won, and unfilled requirements record why nobody could be placed.
 */

export interface CoverageRequirement {
  id: string;
  date: ISODate;
  positionId: string;
  locationId: string;
  start: MinuteOfDay;
  end: MinuteOfDay;
  count: number; // how many staff needed for this window
  taskIds?: string[];
}

export interface ScheduleWeights {
  fairness: number; // prefer under-loaded staff
  preferredWindow: number; // prefer the employee's preferred availability
  preferredPosition: number; // prefer a position they're qualified/prefer
  avoidEvening: number; // spread evening load
  avoidWeekend: number; // spread weekend load
  continuity: number; // prefer same person across the week for continuity
  minimizeFragmentation: number; // avoid isolated short shifts
}

export const DEFAULT_WEIGHTS: ScheduleWeights = {
  fairness: 1.0,
  preferredWindow: 0.6,
  preferredPosition: 0.4,
  avoidEvening: 0.3,
  avoidWeekend: 0.3,
  continuity: 0.25,
  minimizeFragmentation: 0.2,
};

export interface GenerationInput {
  seed: number;
  requirements: CoverageRequirement[];
  employees: EmployeeProfile[];
  positions: Position[];
  patterns: Record<string, AvailabilityPattern[]>;
  leave: Record<string, LeaveRecord[]>;
  leaveTypes: LeaveType[];
  policyByClassification: Record<string, BreakPolicy>;
  lockedShifts: Shift[]; // preserved verbatim
  rules?: StructuredRule[]; // confirmed manager rules
  weights?: ScheduleWeights;
  scheduleId: string;
  now: string; // ISO timestamp stamped by caller
  mode?: GenerationMode;
}

export type GenerationMode =
  | "full"
  | "fill_only" // only fill requirements not already covered by locked shifts
  | "coverage_only"; // ignore task assignment

export interface Assignment {
  shift: Shift;
  explanation: string;
}

export interface Unfilled {
  requirement: CoverageRequirement;
  slot: number;
  reasons: string[];
}

export interface GenerationResult {
  shifts: Shift[]; // locked + newly generated
  assignments: Assignment[];
  unfilled: Unfilled[];
  findings: ComplianceFinding[];
  coverageScore: number; // 0..1 fraction of slots filled
  explanation: string;
}

interface RunningLoad {
  minutes: number;
  publicServiceMinutes: number;
  eveningMinutes: number;
  weekendMinutes: number;
  shiftCount: number;
  perDayMinutes: Record<string, number>;
}

function emptyLoad(): RunningLoad {
  return { minutes: 0, publicServiceMinutes: 0, eveningMinutes: 0, weekendMinutes: 0, shiftCount: 0, perDayMinutes: {} };
}

export function generateSchedule(input: GenerationInput): GenerationResult {
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const mode = input.mode ?? "full";
  const rand = seededRandom(input.seed);
  const posById = new Map(input.positions.map((p) => [p.id, p]));

  const load: Record<string, RunningLoad> = {};
  for (const e of input.employees) load[e.id] = emptyLoad();

  // Seed running load from locked shifts so fairness accounts for them.
  const allShifts: Shift[] = [...input.lockedShifts];
  for (const s of input.lockedShifts) {
    if (s.employeeId) accrue(load[s.employeeId], s, posById.get(s.positionId));
  }

  const assignments: Assignment[] = [];
  const unfilled: Unfilled[] = [];

  // Deterministic ordering: hardest-to-fill first (fewest eligible), then stable id.
  const reqs = [...input.requirements].sort((a, b) => a.id.localeCompare(b.id));

  for (const req of reqs) {
    const pos = posById.get(req.positionId);
    if (!pos) {
      unfilled.push({ requirement: req, slot: 0, reasons: ["Unknown position."] });
      continue;
    }

    // How many are already covered by locked shifts for this requirement window?
    const lockedForReq = input.lockedShifts.filter(
      (s) =>
        s.employeeId &&
        s.positionId === req.positionId &&
        s.locationId === req.locationId &&
        s.date === req.date &&
        s.start <= req.start &&
        s.end >= req.end,
    ).length;
    const needed = mode === "fill_only" ? Math.max(0, req.count - lockedForReq) : req.count - lockedForReq;

    for (let slot = 0; slot < needed; slot++) {
      const { chosen, reasons } = pickCandidate(req, pos, input, load, allShifts, weights, rand);
      if (!chosen) {
        unfilled.push({ requirement: req, slot, reasons });
        continue;
      }
      const breaks = mode === "coverage_only" ? [] : planBreaks(req, pos, chosen, input);
      const shift: Shift = {
        id: `gen-${req.id}-${slot}-${chosen.id}`,
        scheduleId: input.scheduleId,
        employeeId: chosen.id,
        positionId: req.positionId,
        locationId: req.locationId,
        date: req.date,
        start: req.start,
        end: req.end,
        breaks,
        taskIds: mode === "coverage_only" ? [] : req.taskIds ?? [],
        status: "draft",
        source: "ai_generated",
        locked: false,
        scheduleVersion: 0,
        createdAt: input.now,
        updatedAt: input.now,
      };
      allShifts.push(shift);
      accrue(load[chosen.id], shift, pos);
      assignments.push({
        shift,
        explanation: explain(chosen, req, pos, load[chosen.id]),
      });
    }
  }

  // Compliance validation of the resulting draft, per employee per day.
  const findings = validateAll(allShifts, input);

  const totalSlots = reqs.reduce((n, r) => n + r.count, 0);
  const filled = totalSlots - unfilled.length;
  const coverageScore = totalSlots === 0 ? 1 : filled / totalSlots;

  return {
    shifts: allShifts,
    assignments,
    unfilled,
    findings,
    coverageScore,
    explanation: `Filled ${filled}/${totalSlots} coverage slots. ${assignments.length} shift(s) generated, ${input.lockedShifts.length} locked shift(s) preserved. ${findings.filter((f) => f.severity === "hard").length} hard compliance issue(s), ${findings.filter((f) => f.severity !== "hard").length} advisory.`,
  };
}

function pickCandidate(
  req: CoverageRequirement,
  pos: Position,
  input: GenerationInput,
  load: Record<string, RunningLoad>,
  allShifts: Shift[],
  weights: ScheduleWeights,
  rand: () => number,
): { chosen?: EmployeeProfile; reasons: string[] } {
  const window = { start: req.start, end: req.end };
  const minutes = req.end - req.start;
  const blockReasons = new Set<string>();

  const eligible = input.employees.filter((e) => {
    if (!e.active) return false;
    // Hard: qualification
    if (pos.requiredQualification && !e.qualifiedPositionIds.includes(pos.id)) {
      blockReasons.add("No qualified staff available.");
      return false;
    }
    if (
      pos.eligibleClassifications.length > 0 &&
      !pos.eligibleClassifications.includes(e.classification)
    ) {
      return false;
    }
    if (!e.eligibleLocationIds.includes(req.locationId)) return false;
    // Hard: availability + leave
    if (!isAvailableForShift(input.patterns[e.id] ?? [], input.leave[e.id] ?? [], input.leaveTypes, req.date, window)) {
      blockReasons.add("No available staff for this window.");
      return false;
    }
    // Hard: no overlapping existing assignment
    const overlapping = allShifts.some(
      (s) => s.employeeId === e.id && s.date === req.date && s.start < req.end && req.start < s.end,
    );
    if (overlapping) return false;
    // Hard: daily + weekly max hours
    const dayMinutes = (load[e.id].perDayMinutes[req.date] ?? 0) + minutes;
    if (dayMinutes / 60 > e.maxDailyHours) return false;
    if ((load[e.id].minutes + minutes) / 60 > e.maxWeeklyHours) {
      blockReasons.add("Remaining candidates are at their weekly maximum.");
      return false;
    }
    // Hard: manager rule barring this employee from this position
    const barred = (input.rules ?? []).some(
      (r) =>
        r.confirmed &&
        r.constraintClass === "hard" &&
        r.kind === "avoid_position" &&
        r.employeeId === e.id &&
        r.positionId === pos.id,
    );
    if (barred) return false;
    return true;
  });

  if (eligible.length === 0) {
    return { reasons: blockReasons.size ? [...blockReasons] : ["No eligible employee for this requirement."] };
  }

  // Score each eligible candidate (higher = better).
  const scored = eligible.map((e) => ({ e, score: scoreCandidate(e, req, pos, input, load, weights) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tie-break blended with seeded RNG so equal scores rotate.
    const ra = rand() + hashString(a.e.id) / 0xffffffff;
    const rb = rand() + hashString(b.e.id) / 0xffffffff;
    return rb - ra;
  });
  return { chosen: scored[0].e, reasons: [] };
}

function scoreCandidate(
  e: EmployeeProfile,
  req: CoverageRequirement,
  pos: Position,
  input: GenerationInput,
  load: Record<string, RunningLoad>,
  weights: ScheduleWeights,
): number {
  const l = load[e.id];
  const minutes = req.end - req.start;

  // Fairness: favour employees below their target load. Target scaled by %FTE.
  const targetMinutes = e.targetWeeklyHours * 60 * Math.max(0.1, e.employmentPercentage);
  const loadRatio = targetMinutes > 0 ? l.minutes / targetMinutes : 1;
  let score = weights.fairness * (1 - loadRatio);

  // Preferred availability window.
  const res = resolveAvailability(
    input.patterns[e.id] ?? [],
    input.leave[e.id] ?? [],
    input.leaveTypes,
    req.date,
    { start: req.start, end: req.end },
  );
  if (res.kind === "preferred") score += weights.preferredWindow;

  // Preferred / qualified position.
  if (e.qualifiedPositionIds.includes(pos.id)) score += weights.preferredPosition;

  // Spread evening + weekend load (penalize those already carrying a lot).
  const isEvening = req.start >= EVENING_START || req.end > EVENING_START;
  if (isEvening) score -= weights.avoidEvening * (l.eveningMinutes / 480);
  if (isWeekend(req.date)) score -= weights.avoidWeekend * (l.weekendMinutes / 480);

  // Continuity: prefer someone already working this position this week.
  const worksThisPosition = input.lockedShifts.some(
    (s) => s.employeeId === e.id && s.positionId === pos.id,
  );
  if (worksThisPosition) score += weights.continuity;

  // Minimize fragmentation: mild penalty for very short shifts.
  if (minutes < 120) score -= weights.minimizeFragmentation;

  // Soft manager preference rules.
  for (const r of input.rules ?? []) {
    if (!r.confirmed || r.employeeId !== e.id) continue;
    if (r.kind === "prefer_position" && r.positionId === pos.id) score += 0.5;
    if (r.kind === "avoid_position" && r.positionId === pos.id && r.constraintClass !== "hard") {
      score -= 0.75;
    }
  }

  return score;
}

function planBreaks(
  req: CoverageRequirement,
  pos: Position,
  emp: EmployeeProfile,
  input: GenerationInput,
): Break[] {
  const policy = input.policyByClassification[emp.classification];
  if (!policy || emp.classification === "exempt_staff") return [];
  const length = req.end - req.start;
  const breaks: Break[] = [];

  // Unpaid meal for shifts beyond the meal threshold; placed to satisfy timing.
  if (length > policy.mealRequiredAfterMinutes) {
    const mealStart = Math.min(
      req.start + policy.mealMustStartByMinutesWorked - policy.mealMinDurationMinutes,
      req.start + Math.floor(length / 2) - Math.floor(policy.mealMinDurationMinutes / 2),
    );
    const start = Math.max(req.start + 60, mealStart);
    if (start + policy.mealMinDurationMinutes <= req.end - 30) {
      breaks.push({ kind: "meal", start, end: start + policy.mealMinDurationMinutes, paid: false });
    }
  }

  // Paid rest to break up long continuous public-service stretches.
  if (pos.countsAsPublicService && length > policy.maxContinuousPublicServiceMinutes) {
    const restStart = req.start + policy.maxContinuousPublicServiceMinutes;
    if (restStart + 10 < req.end && !breaks.some((b) => b.start <= restStart && b.end > restStart)) {
      breaks.push({ kind: "rest", start: restStart, end: restStart + 10, paid: true });
    }
  }

  return breaks.sort((a, b) => a.start - b.start);
}

function validateAll(allShifts: Shift[], input: GenerationInput): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const byEmpDay = new Map<string, Shift[]>();
  for (const s of allShifts) {
    if (!s.employeeId) continue;
    const key = `${s.employeeId}:${s.date}`;
    (byEmpDay.get(key) ?? byEmpDay.set(key, []).get(key)!).push(s);
  }
  for (const [key, shifts] of byEmpDay) {
    const [empId, date] = key.split(":");
    const emp = input.employees.find((e) => e.id === empId);
    if (!emp) continue;
    const policy = input.policyByClassification[emp.classification];
    if (!policy) continue;
    findings.push(
      ...validateWorkday({
        employeeId: empId,
        classification: emp.classification,
        date,
        shifts,
        policy,
        positions: input.positions,
        patterns: input.patterns[empId],
        leave: input.leave[empId],
        leaveTypes: input.leaveTypes,
      }),
    );
  }
  return findings;
}

function accrue(l: RunningLoad, s: Shift, pos?: Position): void {
  const unpaid = s.breaks.filter((b) => !b.paid).reduce((m, b) => m + (b.end - b.start), 0);
  const paid = Math.max(0, s.end - s.start - unpaid);
  l.minutes += paid;
  l.perDayMinutes[s.date] = (l.perDayMinutes[s.date] ?? 0) + paid;
  l.shiftCount += 1;
  if (pos?.countsAsPublicService) l.publicServiceMinutes += paid;
  if (s.start >= EVENING_START || s.end > EVENING_START)
    l.eveningMinutes += Math.max(0, s.end - Math.max(s.start, EVENING_START));
  if (isWeekend(s.date)) l.weekendMinutes += paid;
}

function explain(e: EmployeeProfile, req: CoverageRequirement, pos: Position, l: RunningLoad): string {
  const parts: string[] = [];
  parts.push(`${e.preferredName ?? e.legalName} assigned to ${pos.name}`);
  if (e.qualifiedPositionIds.includes(pos.id)) parts.push("qualified for the position");
  parts.push(`now at ${(l.minutes / 60).toFixed(1)} h this week (target ${e.targetWeeklyHours} h)`);
  return parts.join("; ") + ".";
}
