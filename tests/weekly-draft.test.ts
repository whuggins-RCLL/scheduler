import { describe, expect, it } from "vitest";
import {
  SCHEDULER_ACTOR_ID,
  mondayOf,
  nextWeekStart,
  planWeeklyDraft,
  seedForWeek,
  type WeeklyDraftParams,
} from "../functions/src/weekly-draft";
import { buildFixture, FIXTURE_NOW, FIXTURE_WEEK_START } from "./fixtures";
import { addDays } from "../src/domain/time";
import type { Schedule, Shift } from "../src/domain/types";

const WEEK_END = addDays(FIXTURE_WEEK_START, 6);

function params(over: Partial<WeeklyDraftParams> = {}): WeeklyDraftParams {
  return {
    scheduleId: "sched-week",
    weekStart: FIXTURE_WEEK_START,
    weekEnd: WEEK_END,
    seed: seedForWeek(FIXTURE_WEEK_START),
    now: FIXTURE_NOW,
    ...over,
  };
}

function existingDraft(): Schedule {
  return buildFixture().schedules.find((s) => s.id === "sched-week")!;
}

describe("weekly-draft helpers", () => {
  it("mondayOf resolves the Monday of the containing week", () => {
    expect(mondayOf("2026-07-13")).toBe("2026-07-13"); // Monday → itself
    expect(mondayOf("2026-07-15")).toBe("2026-07-13"); // Wednesday
    expect(mondayOf("2026-07-19")).toBe("2026-07-13"); // Sunday
  });

  it("nextWeekStart points at the following Monday", () => {
    expect(nextWeekStart("2026-07-15")).toBe("2026-07-20");
    expect(nextWeekStart(FIXTURE_WEEK_START)).toBe("2026-07-20");
  });

  it("seedForWeek is stable per week and varies across weeks", () => {
    expect(seedForWeek("2026-07-13")).toBe(seedForWeek("2026-07-13"));
    expect(seedForWeek("2026-07-13")).not.toBe(seedForWeek("2026-07-20"));
  });
});

describe("planWeeklyDraft", () => {
  it("produces a review-ready DRAFT (never publishes)", () => {
    const plan = planWeeklyDraft(buildFixture(), existingDraft(), params());

    expect(plan.schedule.status).toBe("draft");
    expect(plan.shiftsToWrite.length).toBeGreaterThan(0);
    for (const s of plan.shiftsToWrite) {
      expect(s.status).toBe("draft");
      expect(s.source).toBe("ai_generated");
      expect(s.scheduleId).toBe("sched-week");
      expect(s.locked).toBe(false);
    }
    expect(plan.result.coverageScore).toBeGreaterThan(0);
  });

  it("records an automated audit event attributed to the scheduler", () => {
    const plan = planWeeklyDraft(buildFixture(), existingDraft(), params());
    expect(plan.audit.action).toBe("schedule.generate");
    expect(plan.audit.source).toBe("scheduled_function");
    expect(plan.audit.actorId).toBe(SCHEDULER_ACTOR_ID);
    expect((plan.audit.after as { automated?: boolean }).automated).toBe(true);
  });

  it("is deterministic for the same week + inputs", () => {
    const sig = (p: ReturnType<typeof planWeeklyDraft>) =>
      p.shiftsToWrite.map((s) => `${s.date}:${s.start}:${s.employeeId}:${s.id}`).sort();
    expect(sig(planWeeklyDraft(buildFixture(), existingDraft(), params()))).toEqual(
      sig(planWeeklyDraft(buildFixture(), existingDraft(), params())),
    );
  });

  it("mints a fresh draft when no schedule exists for the week", () => {
    const plan = planWeeklyDraft(buildFixture(), null, params({ scheduleId: "sched-auto-2026-07-13" }));
    expect(plan.schedule.id).toBe("sched-auto-2026-07-13");
    expect(plan.schedule.status).toBe("draft");
    expect(plan.schedule.createdBy).toBe(SCHEDULER_ACTOR_ID);
    expect(plan.schedule.startDate).toBe(FIXTURE_WEEK_START);
    expect(plan.schedule.endDate).toBe(WEEK_END);
  });

  it("preserves locked/human shifts and only replaces its own prior draft", () => {
    const db = buildFixture();
    const lockedHuman: Shift = {
      id: "shift-locked-human", scheduleId: "sched-week", employeeId: "emp-sam",
      positionId: "pos-desk", locationId: "loc-desk", date: FIXTURE_WEEK_START,
      start: 540, end: 660, breaks: [], taskIds: [], status: "published",
      source: "manager_created", locked: true, scheduleVersion: 1,
      createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW,
    };
    const priorAiDraft: Shift = {
      ...lockedHuman, id: "shift-prior-ai", employeeId: "emp-maya", start: 780, end: 900,
      status: "draft", source: "ai_generated", locked: false,
    };
    db.shifts.push(lockedHuman, priorAiDraft);

    const plan = planWeeklyDraft(db, existingDraft(), params());

    // The superseded automated draft is scheduled for deletion...
    expect(plan.shiftIdsToDelete).toContain("shift-prior-ai");
    // ...but the locked human shift is never deleted or regenerated.
    expect(plan.shiftIdsToDelete).not.toContain("shift-locked-human");
    expect(plan.shiftsToWrite.some((s) => s.id === "shift-locked-human")).toBe(false);
  });
});
