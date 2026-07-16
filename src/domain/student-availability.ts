import type { AvailabilityBlock, EmploymentClassification, ISODate, StudentAvailabilityWindow } from "./types";
import { overlaps } from "./time";

/** Maximum weekly library hours for student workers. */
export const STUDENT_MAX_WEEKLY_MINUTES = 15 * 60;

/** Pick the active student submission window from a list. */
export function activeStudentAvailabilityWindow(
  windows: StudentAvailabilityWindow[],
): StudentAvailabilityWindow | undefined {
  const enabled = windows.filter((w) => w.enabled);
  if (enabled.length === 0) return windows[0];
  return enabled.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export type StudentAvailabilityEditStatus =
  | "disabled"
  | "not_yet_open"
  | "open"
  | "frozen"
  | "closed";

export function isStudentWorker(classification: EmploymentClassification): boolean {
  return classification === "student_worker";
}

/** Whether a student may edit their own desk-availability grid today. */
export function studentAvailabilityEditable(
  window: StudentAvailabilityWindow | undefined,
  today: ISODate,
): boolean {
  return studentAvailabilityStatus(window, today) === "open";
}

/** Resolved edit state for UI banners and gating. */
export function studentAvailabilityStatus(
  window: StudentAvailabilityWindow | undefined,
  today: ISODate,
): StudentAvailabilityEditStatus {
  if (!window || !window.enabled) return "disabled";
  if (window.frozen) return "frozen";
  if (today < window.submissionOpens) return "not_yet_open";
  if (today > window.submissionCloses) return "closed";
  return "open";
}

/** Plain-language summary for students and managers. */
export function studentAvailabilityStatusMessage(
  window: StudentAvailabilityWindow | undefined,
  today: ISODate,
): string {
  const status = studentAvailabilityStatus(window, today);
  if (!window) return "Student availability submission has not been configured yet.";
  switch (status) {
    case "disabled":
      return "Your manager has not opened availability submission for this period yet.";
    case "not_yet_open":
      return `You can edit your availability from ${formatDate(window.submissionOpens)} through ${formatDate(window.submissionCloses)}. Editing opens on ${formatDate(window.submissionOpens)}.`;
    case "open":
      return `You can edit your availability through ${formatDate(window.submissionCloses)}. After that date your grid locks and becomes read-only.`;
    case "frozen":
      return "Your manager has temporarily frozen availability editing. Your grid is read-only until they unlock it.";
    case "closed":
      return `The submission window closed on ${formatDate(window.submissionCloses)}. Your availability is read-only. Contact a manager if you need changes.`;
  }
}

function formatDate(iso: ISODate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Students may only swap with other students; staff may swap with anyone. */
export function canSwapBetween(
  initiator: EmploymentClassification,
  recipient: EmploymentClassification,
): boolean {
  if (isStudentWorker(initiator)) return isStudentWorker(recipient);
  return true;
}

/** Total weekly minutes a student has signed up for (available + preferred). */
export function weeklySignUpMinutes(blocks: AvailabilityBlock[]): number {
  return blocks
    .filter((b) => b.kind !== "unavailable")
    .reduce((sum, b) => sum + (b.end - b.start), 0);
}

/** Total weekly minutes a manager has approved for a student. */
export function weeklyApprovedMinutes(blocks: AvailabilityBlock[]): number {
  return blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
}

export function formatWeeklyHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function validateStudentWeeklyCap(
  minutes: number,
  context: "sign-up" | "approved" = "sign-up",
): string | null {
  if (minutes > STUDENT_MAX_WEEKLY_MINUTES) {
    const max = STUDENT_MAX_WEEKLY_MINUTES / 60;
    const actual = formatWeeklyHours(minutes);
    return `Student ${context} cannot exceed ${max} hours per week (currently ${actual} hours).`;
  }
  return null;
}

/** Drop approvals that no longer overlap a student sign-up slot. */
export function pruneApprovedBlocks(
  signUp: AvailabilityBlock[],
  approved: AvailabilityBlock[],
): AvailabilityBlock[] {
  return approved.filter((a) =>
    signUp.some(
      (s) => s.weekday === a.weekday && s.kind !== "unavailable" && overlaps(s, a),
    ),
  );
}

/** Blocks used by the scheduling engine for an employee. */
export function schedulingBlocks(
  pattern: { blocks: AvailabilityBlock[]; approvedBlocks?: AvailabilityBlock[] },
  classification: EmploymentClassification,
): AvailabilityBlock[] {
  if (!isStudentWorker(classification)) return pattern.blocks;
  return pattern.approvedBlocks ?? [];
}
