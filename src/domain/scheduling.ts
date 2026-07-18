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
  Schedule,
  Shift,
  StructuredRule,
} from "./types";
import { effectivePattern, isAvailableForShift, resolveAvailability } from "./availability";
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
  compliance: number; // penalize assignments that would leave day-compliance findings
}

export const DEFAULT_WEIGHTS: ScheduleWeights = {
  fairness: 1.0,
  preferredWindow: 0.6,
  preferredPosition: 0.4,
  avoidEvening: 0.3,
  avoidWeekend: 0.3,
  continuity: 0.25,
  minimizeFragmentation: 0.2,
  compliance: 0.6,
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

  // Re-plan breaks across each employee's whole day before validating, so meal
  // and rest periods reflect total daily work rather than any single shift.
  if (mode !== "coverage_only") applyDayBreaks(allShifts, input);

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
    if (!isAvailableForShift(input.patterns[e.id] ?? [], input.leave[e.id] ?? [], input.leaveTypes, req.date, window, e.classification)) {
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
  const scored = eligible.map((e) => ({ e, score: scoreCandidate(e, req, pos, input, load, weights, allShifts) }));
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
  allShifts: Shift[],
): number {
  const l = load[e.id];
  const minutes = req.end - req.start;

  // Fairness: favour employees below their target load. `targetWeeklyHours` is
  // already the employee's actual weekly target (part-time included), so it is
  // used directly — employmentPercentage is a separate fairness normalizer and
  // must not be multiplied in here (that double-scaled part-time targets).
  const targetMinutes = e.targetWeeklyHours * 60;
  const loadRatio = targetMinutes > 0 ? l.minutes / targetMinutes : 1;
  let score = weights.fairness * (1 - loadRatio);

  // Preferred availability window.
  const res = resolveAvailability(
    input.patterns[e.id] ?? [],
    input.leave[e.id] ?? [],
    input.leaveTypes,
    req.date,
    { start: req.start, end: req.end },
    e.classification,
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

  // Compliance-aware: penalize an assignment that would leave the candidate's day
  // with meal/rest/other findings even after whole-day break planning. Because
  // breaks are planned in the projection, this fires only for findings that can't
  // be broken away (e.g. a day too fragmented to seat a duty-free meal).
  if (weights.compliance > 0) {
    const penalty = projectedDayFindingCost(e, req, input, allShifts);
    score -= weights.compliance * penalty;
  }

  return score;
}

/** Severity-weighted count of compliance findings if `e` also worked `req` today. */
function projectedDayFindingCost(
  e: EmployeeProfile,
  req: CoverageRequirement,
  input: GenerationInput,
  allShifts: Shift[],
): number {
  const policy = input.policyByClassification[e.classification];
  if (!policy) return 0;
  const prospective: Shift = {
    id: `__probe-${e.id}-${req.id}`,
    scheduleId: input.scheduleId,
    employeeId: e.id,
    positionId: req.positionId,
    locationId: req.locationId,
    date: req.date,
    start: req.start,
    end: req.end,
    breaks: [],
    taskIds: req.taskIds ?? [],
    status: "draft",
    source: "ai_generated",
    locked: false,
    scheduleVersion: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const projected = [...allShifts.filter((s) => s.employeeId === e.id && s.date === req.date), prospective];
  const editableIds = new Set(projected.filter((s) => !input.lockedShifts.some((l) => l.id === s.id)).map((s) => s.id));
  const planned = planDayBreaks(projected, editableIds, policy, effectivePattern(input.patterns[e.id] ?? [], req.date)?.mealBreakMinutes);
  const withBreaks = projected.map((s) => (planned.has(s.id) ? { ...s, breaks: planned.get(s.id)! } : s));
  const findings = validateWorkday({
    employeeId: e.id,
    classification: e.classification,
    date: req.date,
    shifts: withBreaks,
    policy,
    positions: input.positions,
    patterns: input.patterns[e.id],
    leave: input.leave[e.id],
    leaveTypes: input.leaveTypes,
  });
  let cost = 0;
  for (const f of findings) {
    cost += f.severity === "hard" ? 3 : f.severity === "overrideable" ? 1.5 : f.severity === "warning" ? 0.5 : 0;
  }
  return cost;
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

  // Honour the employee's stated meal-break preference (30 or 60 min) but never
  // schedule a meal shorter than the legal minimum for their classification.
  const preferred = effectivePattern(input.patterns[emp.id] ?? [], req.date)?.mealBreakMinutes;
  const mealMinutes = Math.max(policy.mealMinDurationMinutes, preferred ?? policy.mealMinDurationMinutes);

  // Unpaid meal for shifts beyond the meal threshold; placed to satisfy timing.
  if (length > policy.mealRequiredAfterMinutes) {
    const mealStart = Math.min(
      req.start + policy.mealMustStartByMinutesWorked - mealMinutes,
      req.start + Math.floor(length / 2) - Math.floor(mealMinutes / 2),
    );
    const start = Math.max(req.start + 60, mealStart);
    if (start + mealMinutes <= req.end - 30) {
      breaks.push({ kind: "meal", start, end: start + mealMinutes, paid: false });
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

/**
 * Plan breaks across an employee's whole day rather than per shift. Meal and
 * rest requirements are evaluated against total worked minutes for the day (the
 * same basis `validateWorkday` uses), so several short shifts that together
 * cross the meal threshold still get a meal — fixing the per-shift blind spot.
 *
 * Only `editableIds` shifts receive breaks (their break list is recomputed from
 * scratch); locked/human shifts are read for context but never modified. Returns
 * a map of shiftId -> new breaks for the editable shifts. Deterministic.
 */
export function planDayBreaks(
  dayShifts: Shift[],
  editableIds: Set<string>,
  policy: BreakPolicy,
  mealMinutesPref?: number,
): Map<string, Break[]> {
  const sorted = [...dayShifts].sort((a, b) => a.start - b.start);
  const result = new Map<string, Break[]>();
  for (const s of sorted) if (editableIds.has(s.id)) result.set(s.id, []);
  if (result.size === 0) return result;

  const breaksOf = (s: Shift): Break[] => (editableIds.has(s.id) ? result.get(s.id)! : s.breaks);
  const dayStart = sorted[0]!.start;
  const mealMinutes = Math.max(policy.mealMinDurationMinutes, mealMinutesPref ?? policy.mealMinDurationMinutes);

  const workMinutes = () =>
    sorted.reduce((sum, s) => {
      const unpaid = breaksOf(s).filter((b) => !b.paid).reduce((m, b) => m + (b.end - b.start), 0);
      return sum + (s.end - s.start) - unpaid;
    }, 0);
  const mealCount = () => sorted.reduce((n, s) => n + breaksOf(s).filter((b) => b.kind === "meal").length, 0);
  const restCount = () => sorted.reduce((n, s) => n + breaksOf(s).filter((b) => b.kind === "rest").length, 0);
  const overlapsOther = (win: { start: number; end: number }, hostId: string) =>
    sorted.some((o) => o.id !== hostId && o.start < win.end && win.start < o.end);
  const overlapsBreak = (br: Break[], win: { start: number; end: number }) =>
    br.some((b) => b.start < win.end && win.start < b.end);

  // Insert an unpaid meal that begins no later than `deadline` and is duty-free.
  const insertMeal = (deadline: number): boolean => {
    for (const s of sorted) {
      if (!editableIds.has(s.id)) continue;
      const br = result.get(s.id)!;
      const earliest = s.start + 60; // work at least an hour before a meal
      const latest = Math.min(deadline, s.end - mealMinutes - 15); // leave a little work after
      if (latest < earliest) continue;
      const centered = s.start + Math.floor((s.end - s.start) / 2) - Math.floor(mealMinutes / 2);
      const start = Math.max(earliest, Math.min(centered, latest));
      const win = { start, end: start + mealMinutes };
      if (win.end > s.end || overlapsBreak(br, win) || overlapsOther(win, s.id)) continue;
      br.push({ kind: "meal", start: win.start, end: win.end, paid: false });
      br.sort((a, b) => a.start - b.start);
      return true;
    }
    return false;
  };

  if (workMinutes() > policy.mealRequiredAfterMinutes && mealCount() === 0) {
    insertMeal(dayStart + policy.mealMustStartByMinutesWorked);
  }
  if (workMinutes() > policy.secondMealAfterMinutes && mealCount() < 2) {
    insertMeal(dayStart + policy.secondMealAfterMinutes + mealMinutes);
  }

  // One paid rest per exceeded rest threshold, placed duty-free and non-overlapping.
  const requiredRests = policy.restPerHoursWorked.filter((r) => workMinutes() > r.thresholdMinutes).length;
  let guard = 0;
  while (restCount() < requiredRests && guard++ < 12) {
    let placed = false;
    for (const s of sorted) {
      if (!editableIds.has(s.id)) continue;
      const br = result.get(s.id)!;
      for (let start = s.start + 45; start + 10 <= s.end - 30; start += 30) {
        const win = { start, end: start + 10 };
        if (overlapsBreak(br, win) || overlapsOther(win, s.id)) continue;
        br.push({ kind: "rest", start: win.start, end: win.end, paid: true });
        br.sort((a, b) => a.start - b.start);
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (!placed) break;
  }

  return result;
}

/** Re-plan breaks for every employee-day of the generated shifts (in place). */
function applyDayBreaks(allShifts: Shift[], input: GenerationInput): void {
  const lockedIds = new Set(input.lockedShifts.map((s) => s.id));
  const byEmpDay = new Map<string, Shift[]>();
  for (const s of allShifts) {
    if (!s.employeeId) continue;
    const key = `${s.employeeId}:${s.date}`;
    (byEmpDay.get(key) ?? byEmpDay.set(key, []).get(key)!).push(s);
  }
  for (const [key, dayShifts] of byEmpDay) {
    const empId = key.slice(0, key.lastIndexOf(":"));
    const emp = input.employees.find((e) => e.id === empId);
    if (!emp) continue;
    const policy = input.policyByClassification[emp.classification];
    if (!policy) continue;
    const editableIds = new Set(dayShifts.filter((s) => !lockedIds.has(s.id)).map((s) => s.id));
    if (editableIds.size === 0) continue;
    const mealPref = effectivePattern(input.patterns[empId] ?? [], dayShifts[0]!.date)?.mealBreakMinutes;
    const planned = planDayBreaks(dayShifts, editableIds, policy, mealPref);
    for (const s of dayShifts) {
      const nb = planned.get(s.id);
      if (nb) s.breaks = nb;
    }
  }
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


export interface SchedulerHelperInput {
  schedule: Schedule;
  shifts: Shift[];
  requirements: CoverageRequirement[];
  findings: ComplianceFinding[];
  coverageScore?: number;
}

export interface SchedulerHelperSuggestion {
  kind: "generate" | "repair" | "compliance" | "fairness" | "publish";
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
}

/**
 * Deterministic AI-scheduler helper: summarizes schedule health and recommends
 * the next manager-reviewed action. It never mutates data or publishes.
 */
export function buildSchedulerHelper(input: SchedulerHelperInput): SchedulerHelperSuggestion[] {
  const activeShifts = input.shifts.filter((s) => s.status !== "cancelled");
  const assigned = activeShifts.filter((s) => s.employeeId).length;
  const open = activeShifts.filter((s) => !s.employeeId).length;
  const hardFindings = input.findings.filter((f) => f.severity === "hard");
  const warnings = input.findings.filter((f) => f.severity !== "hard");
  const totalRequired = input.requirements.reduce((sum, req) => sum + req.count, 0);
  const coverageScore = input.coverageScore ?? (totalRequired === 0 ? 1 : Math.min(1, assigned / totalRequired));
  const suggestions: SchedulerHelperSuggestion[] = [];

  if (coverageScore < 1 || open > 0) {
    suggestions.push({
      kind: assigned === 0 ? "generate" : "repair",
      priority: "high",
      title: assigned === 0 ? "Generate a manager-reviewed draft" : "Repair coverage gaps",
      detail: `${Math.round(coverageScore * 100)}% of required coverage is assigned${open ? `, with ${open} open shift(s)` : ""}. Run deterministic generation in fill-only mode or adjust requirements before publishing.`,
    });
  }

  if (hardFindings.length > 0) {
    suggestions.push({
      kind: "compliance",
      priority: "high",
      title: "Resolve blocking compliance",
      detail: `${hardFindings.length} hard compliance issue(s) must be fixed by editing shifts, adding coverage, or recording an allowed manager override before publication.`,
    });
  }

  if (warnings.length > 0) {
    suggestions.push({
      kind: "compliance",
      priority: "medium",
      title: "Review advisory findings",
      detail: `${warnings.length} advisory finding(s) should be acknowledged so managers understand the tradeoffs in this draft.`,
    });
  }

  if (assigned > 0 && hardFindings.length === 0 && coverageScore >= 1 && input.schedule.status !== "published") {
    suggestions.push({
      kind: "publish",
      priority: "low",
      title: "Ready for manager publication",
      detail: "Coverage is filled and no hard compliance findings remain. Review fairness and locked shifts, then publish when ready.",
    });
  }

  if (assigned > 0) {
    suggestions.push({
      kind: "fairness",
      priority: "low",
      title: "Check load fairness",
      detail: "Compare public-service load against availability and FTE before publication; adjust individual assignments if the distribution looks uneven.",
    });
  }

  return suggestions;
}
