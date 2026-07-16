import type {
  Break,
  BreakPolicy,
  EmployeeProfile,
  ISODate,
  MinuteOfDay,
  Shift,
} from "./types";
import { durationMinutes, formatTime12 } from "./time";

export type BreakReminderKind = "meal" | "rest";

export type BreakReminderUrgency = "upcoming" | "due_soon" | "overdue" | "taken" | "not_eligible";

export interface BreakReminderItem {
  kind: BreakReminderKind;
  label: string;
  emoji: string;
  dueBy: MinuteOfDay;
  scheduledStart?: MinuteOfDay;
  scheduledEnd?: MinuteOfDay;
  urgency: BreakReminderUrgency;
  detail: string;
}

export type ShiftPhase = "no_shift" | "before" | "during" | "after" | "exempt";

export interface BreakReminderState {
  phase: ShiftPhase;
  date: ISODate;
  shiftStart?: MinuteOfDay;
  shiftEnd?: MinuteOfDay;
  shiftLengthMinutes: number;
  workedMinutes: number;
  progressPercent: number;
  suggestedShiftHours: string;
  reminders: BreakReminderItem[];
  headline: string;
  subline: string;
  meterLabel: string;
  isShortShift: boolean;
  hasActiveShift: boolean;
}

export interface BreakReminderInput {
  employee: EmployeeProfile;
  policy: BreakPolicy;
  shifts: Shift[];
  date: ISODate;
  nowMinutes: MinuteOfDay;
  mealBreakMinutes?: 30 | 60;
}

const EXEMPT = new Set<EmployeeProfile["classification"]>(["exempt_staff"]);

function formatHours(minutes: number): string {
  const h = minutes / 60;
  return h % 1 === 0 ? `${h} h` : `${h.toFixed(1)} h`;
}

function workMinutesForShift(shift: Shift): number {
  const unpaid = shift.breaks.filter((b) => !b.paid).reduce((sum, b) => sum + (b.end - b.start), 0);
  return durationMinutes(shift.start, shift.end) - unpaid;
}

function workedMinutesSoFar(shift: Shift, nowMinutes: MinuteOfDay): number {
  const end = Math.min(nowMinutes, shift.end);
  if (end <= shift.start) return 0;
  let worked = end - shift.start;
  for (const b of shift.breaks) {
    if (b.end <= shift.start) continue;
    const breakStart = Math.max(b.start, shift.start);
    const breakEnd = Math.min(b.end, end);
    if (breakEnd > breakStart) worked -= breakEnd - breakStart;
  }
  return Math.max(0, worked);
}

function breakTaken(b: Break, nowMinutes: MinuteOfDay): boolean {
  return b.end <= nowMinutes;
}

function urgencyFor(dueBy: MinuteOfDay, nowMinutes: MinuteOfDay, taken: boolean): BreakReminderUrgency {
  if (taken) return "taken";
  const minsLeft = dueBy - nowMinutes;
  if (minsLeft < 0) return "overdue";
  if (minsLeft <= 30) return "due_soon";
  return "upcoming";
}

function buildReminders(
  shift: Shift,
  policy: BreakPolicy,
  nowMinutes: MinuteOfDay,
  mealBreakMinutes: number,
): BreakReminderItem[] {
  const reminders: BreakReminderItem[] = [];
  const shiftLength = durationMinutes(shift.start, shift.end);
  const worked = workedMinutesSoFar(shift, nowMinutes);

  const mealEligible = workMinutesForShift(shift) > policy.mealRequiredAfterMinutes;
  if (mealEligible) {
    const scheduledMeal = shift.breaks.find((b) => b.kind === "meal");
    const dueBy = shift.start + policy.mealMustStartByMinutesWorked;
    const taken = scheduledMeal ? breakTaken(scheduledMeal, nowMinutes) : false;
    reminders.push({
      kind: "meal",
      label: "Meal break",
      emoji: "🍱",
      dueBy,
      scheduledStart: scheduledMeal?.start,
      scheduledEnd: scheduledMeal?.end,
      urgency: urgencyFor(dueBy, nowMinutes, taken),
      detail: scheduledMeal
        ? `Scheduled ${formatTime12(scheduledMeal.start)}–${formatTime12(scheduledMeal.end)} (${mealBreakMinutes} min, unpaid)`
        : `Take an unpaid ${mealBreakMinutes}-minute meal by ${formatTime12(dueBy)}`,
    });
  }

  for (const tier of policy.restPerHoursWorked) {
    if (shiftLength <= tier.thresholdMinutes) continue;
    const dueBy = shift.start + tier.thresholdMinutes;
    const scheduledRest = shift.breaks.find(
      (b) => b.kind === "rest" && Math.abs(b.start - dueBy) < 45,
    );
    const taken = scheduledRest ? breakTaken(scheduledRest, nowMinutes) : worked >= tier.thresholdMinutes && !!scheduledRest;
    const restTaken = shift.breaks.some((b) => b.kind === "rest" && breakTaken(b, nowMinutes));
    reminders.push({
      kind: "rest",
      label: "Rest break",
      emoji: "☕",
      dueBy,
      scheduledStart: scheduledRest?.start,
      scheduledEnd: scheduledRest?.end,
      urgency: urgencyFor(dueBy, nowMinutes, restTaken && worked >= tier.thresholdMinutes),
      detail: scheduledRest
        ? `Scheduled ${formatTime12(scheduledRest.start)}–${formatTime12(scheduledRest.end)} (${tier.restMinutes} min, paid)`
        : `Take a ${tier.restMinutes}-minute paid rest by ${formatTime12(dueBy)}`,
    });
    void taken;
  }

  return reminders;
}

function pickTodayShift(shifts: Shift[], date: ISODate, nowMinutes: MinuteOfDay): Shift | undefined {
  const today = shifts
    .filter((s) => s.date === date && s.status !== "cancelled")
    .sort((a, b) => a.start - b.start);
  if (today.length === 0) return undefined;
  const active = today.find((s) => nowMinutes >= s.start && nowMinutes < s.end);
  if (active) return active;
  const upcoming = today.find((s) => s.start > nowMinutes);
  return upcoming ?? today[today.length - 1];
}

/** Friendly break guidance for students and staff — not compliance enforcement. */
export function computeBreakReminders(input: BreakReminderInput): BreakReminderState {
  const { employee, policy, shifts, date, nowMinutes, mealBreakMinutes = 30 } = input;
  const base: BreakReminderState = {
    phase: "no_shift",
    date,
    shiftLengthMinutes: 0,
    workedMinutes: 0,
    progressPercent: 0,
    suggestedShiftHours: "—",
    reminders: [],
    headline: "No shift today",
    subline: "Enjoy your day off — you've earned it! 🌴",
    meterLabel: "No active shift",
    isShortShift: false,
    hasActiveShift: false,
  };

  if (EXEMPT.has(employee.classification)) {
    return {
      ...base,
      phase: "exempt",
      headline: "Break rules don't apply to you",
      subline: "Your role is exempt from meal and rest requirements — just listen to your body. 💫",
      meterLabel: "Exempt from break tracking",
    };
  }

  const shift = pickTodayShift(shifts, date, nowMinutes);
  if (!shift) return base;

  const shiftLength = durationMinutes(shift.start, shift.end);
  const workMinutes = workMinutesForShift(shift);
  const isShortShift = workMinutes <= policy.mealRequiredAfterMinutes
    && shiftLength <= (policy.restPerHoursWorked[0]?.thresholdMinutes ?? 210);

  const mealMinutes = Math.max(policy.mealMinDurationMinutes, mealBreakMinutes);
  const reminders = isShortShift ? [] : buildReminders(shift, policy, nowMinutes, mealMinutes);

  const before = nowMinutes < shift.start;
  const during = nowMinutes >= shift.start && nowMinutes < shift.end;
  const after = nowMinutes >= shift.end;
  const worked = during || after ? workedMinutesSoFar(shift, nowMinutes) : 0;
  const progressPercent = during
    ? Math.round(((nowMinutes - shift.start) / shiftLength) * 100)
    : after
      ? 100
      : 0;

  let phase: ShiftPhase = "no_shift";
  let headline = "";
  let subline = "";
  let meterLabel = "";

  if (before) {
    phase = "before";
    headline = `Shift starts at ${formatTime12(shift.start)}`;
    subline = isShortShift
      ? `Your ${formatHours(shiftLength)} shift is short — no breaks required. You've got this! ✨`
      : `Planned ${formatHours(workMinutes)} on the clock · meal break eligible after ${formatHours(policy.mealRequiredAfterMinutes)}`;
    meterLabel = "Shift hasn't started yet";
  } else if (during) {
    phase = "during";
    const nextDue = reminders.find((r) => r.urgency === "overdue" || r.urgency === "due_soon")
      ?? reminders.find((r) => r.urgency === "upcoming");
    if (isShortShift) {
      headline = "Short shift — no breaks needed";
      subline = `${formatHours(shiftLength - worked)} left · grab water if you want, but you're not required to clock out. 💧`;
      meterLabel = `${progressPercent}% through your shift`;
    } else if (nextDue?.urgency === "overdue") {
      headline = `${nextDue.emoji} Time for your ${nextDue.label.toLowerCase()}!`;
      subline = `Must take break by ${formatTime12(nextDue.dueBy)} — you're a little past due.`;
      meterLabel = `${progressPercent}% through shift · ${formatHours(worked)} worked`;
    } else if (nextDue?.urgency === "due_soon") {
      headline = `${nextDue.emoji} Break coming up soon`;
      subline = `Must take your ${nextDue.kind === "meal" ? "meal" : "rest"} by ${formatTime12(nextDue.dueBy)}`;
      meterLabel = `${progressPercent}% through shift · ${formatHours(worked)} worked`;
    } else {
      headline = "You're on shift — stay hydrated! 💧";
      subline = `${formatHours(shiftLength - worked)} to go · suggested ${formatHours(workMinutes)} total`;
      meterLabel = `${progressPercent}% through shift`;
    }
  } else {
    phase = "after";
    headline = "Shift complete — nice work! 🎉";
    subline = `You worked about ${formatHours(worked)} today. Time to recharge.`;
    meterLabel = "Shift finished";
  }

  return {
    phase,
    date,
    shiftStart: shift.start,
    shiftEnd: shift.end,
    shiftLengthMinutes: shiftLength,
    workedMinutes: worked,
    progressPercent: Math.min(100, Math.max(0, progressPercent)),
    suggestedShiftHours: formatHours(workMinutes),
    reminders,
    headline,
    subline,
    meterLabel,
    isShortShift,
    hasActiveShift: phase === "during",
  };
}
