/**
 * Pure planning for one-way calendar sync: given a user and the current
 * schedule data, compute which calendar events should be created/updated and
 * which should be removed. No network or Firebase — the API route and any
 * server trigger share this so the behavior is identical and testable.
 */

import type { Shift } from "@/domain/types";
import {
  googleEventId,
  shiftSourceId,
  shiftToSyncEvent,
  type CalendarSyncEvent,
} from "./calendar";

export interface NamedRef {
  id: string;
  name: string;
}

export interface CalendarSyncInput {
  userId: string;
  shifts: Shift[];
  /** Ids of schedules that are published — only these sync. */
  publishedScheduleIds: Set<string> | string[];
  positions: NamedRef[];
  locations: NamedRef[];
  tasks: NamedRef[];
  appBaseUrl: string;
  timeZone: string;
  scheduleNames?: Record<string, string>;
  /** Only sync shifts on/after this ISO date (defaults to no lower bound). */
  fromDate?: string;
}

export interface CalendarSyncPlan {
  /** Events to create or update on the user's calendar. */
  upserts: CalendarSyncEvent[];
  /** Google event ids to delete (cancelled shifts we may have published before). */
  deletions: string[];
}

function nameOf(refs: NamedRef[], id: string, fallback: string): string {
  return refs.find((r) => r.id === id)?.name ?? fallback;
}

/**
 * Build the desired calendar state for one user. A shift becomes an event when
 * it belongs to the user, sits in a published schedule, and isn't cancelled;
 * cancelled shifts in published schedules become deletions so a pulled shift
 * disappears from the calendar too.
 */
export function planUserCalendarSync(input: CalendarSyncInput): CalendarSyncPlan {
  const published =
    input.publishedScheduleIds instanceof Set
      ? input.publishedScheduleIds
      : new Set(input.publishedScheduleIds);

  const upserts: CalendarSyncEvent[] = [];
  const deletions: string[] = [];

  for (const shift of input.shifts) {
    if (shift.employeeId !== input.userId) continue;
    if (!published.has(shift.scheduleId)) continue;
    if (input.fromDate && shift.date < input.fromDate) continue;

    if (shift.status === "cancelled") {
      deletions.push(googleEventId(shiftSourceId(shift.id)));
      continue;
    }

    upserts.push(
      shiftToSyncEvent(shift, {
        positionName: nameOf(input.positions, shift.positionId, "Shift"),
        locationName: nameOf(input.locations, shift.locationId, "Library"),
        taskNames: shift.taskIds.map((tid) => nameOf(input.tasks, tid, "")).filter(Boolean),
        scheduleName: input.scheduleNames?.[shift.scheduleId],
        scheduleVersion: shift.scheduleVersion,
        appBaseUrl: input.appBaseUrl,
        timeZone: input.timeZone,
      }),
    );
  }

  // A shift can't be both an upsert and a deletion; upserts win if ids collide.
  const upsertIds = new Set(upserts.map((e) => e.googleEventId));
  return { upserts, deletions: deletions.filter((id) => !upsertIds.has(id)) };
}

export interface PublishedScheduleSyncInput {
  scheduleId: string;
  shifts: Shift[];
  positions: NamedRef[];
  locations: NamedRef[];
  tasks: NamedRef[];
  appBaseUrl: string;
  timeZone: string;
  scheduleNames?: Record<string, string>;
}

export interface UserSyncPlan extends CalendarSyncPlan {
  userId: string;
}

/**
 * Plan the calendar sync for every assignee of a single published schedule —
 * used to push shifts to all connected assignees the moment a manager
 * publishes. Reuses the per-user planner, scoped to just this schedule, and
 * returns one entry per assignee that has anything to upsert or delete.
 */
export function planPublishedScheduleSync(input: PublishedScheduleSyncInput): UserSyncPlan[] {
  const assignees = new Set<string>();
  for (const s of input.shifts) {
    if (s.scheduleId === input.scheduleId && s.employeeId) assignees.add(s.employeeId);
  }

  const plans: UserSyncPlan[] = [];
  for (const userId of assignees) {
    const plan = planUserCalendarSync({
      userId,
      shifts: input.shifts,
      publishedScheduleIds: [input.scheduleId],
      positions: input.positions,
      locations: input.locations,
      tasks: input.tasks,
      appBaseUrl: input.appBaseUrl,
      timeZone: input.timeZone,
      scheduleNames: input.scheduleNames,
    });
    if (plan.upserts.length || plan.deletions.length) plans.push({ userId, ...plan });
  }
  return plans;
}
