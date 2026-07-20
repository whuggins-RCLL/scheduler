import { beforeEach, describe, expect, it } from "vitest";
import {
  MockCalendarProvider,
  _mockCalendarEvents,
  _resetMockCalendar,
  calendarProviderStatus,
  getCalendarProvider,
  googleEventId,
  minutesToClock,
  shiftSourceId,
  shiftToSyncEvent,
} from "../src/lib/integrations/calendar";
import { planPublishedScheduleSync, planUserCalendarSync } from "../src/lib/integrations/calendar-sync";
import type { Shift } from "../src/domain/types";

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "sh1",
    scheduleId: "sched1",
    employeeId: "u1",
    positionId: "pos-desk",
    locationId: "loc-main",
    date: "2026-07-14",
    start: 9 * 60,
    end: 13 * 60,
    breaks: [],
    taskIds: [],
    status: "published",
    source: "template_generated",
    locked: false,
    scheduleVersion: 3,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const ctx = {
  positionName: "Service Desk",
  locationName: "Main Library",
  taskNames: ["Reshelving"],
  scheduleVersion: 3,
  appBaseUrl: "https://scheduler.example.edu",
  timeZone: "America/Los_Angeles",
};

describe("minutesToClock", () => {
  it("formats minute-of-day as HH:MM:SS", () => {
    expect(minutesToClock(9 * 60)).toBe("09:00:00");
    expect(minutesToClock(13 * 60 + 30)).toBe("13:30:00");
    expect(minutesToClock(0)).toBe("00:00:00");
  });
});

describe("googleEventId", () => {
  it("is deterministic and uses only base32hex characters", () => {
    const id = googleEventId(shiftSourceId("sh1"));
    expect(id).toBe(googleEventId(shiftSourceId("sh1")));
    expect(id.startsWith("rcll")).toBe(true);
    expect(id).toMatch(/^[a-v0-9]+$/);
    expect(id.length).toBeGreaterThanOrEqual(5);
  });

  it("differs per shift", () => {
    expect(googleEventId(shiftSourceId("a"))).not.toBe(googleEventId(shiftSourceId("b")));
  });
});

describe("shiftToSyncEvent", () => {
  it("emits naive local datetimes with the timezone and a stable id", () => {
    const ev = shiftToSyncEvent(shift(), ctx);
    expect(ev.start).toBe("2026-07-14T09:00:00");
    expect(ev.end).toBe("2026-07-14T13:00:00");
    expect(ev.timeZone).toBe("America/Los_Angeles");
    expect(ev.googleEventId).toBe(googleEventId(shiftSourceId("sh1")));
    expect(ev.title).toBe("Service Desk — Main Library");
    expect(ev.description).toContain("Position: Service Desk");
    expect(ev.description).toContain("Tasks: Reshelving");
    expect(ev.description).toContain("https://scheduler.example.edu/schedule");
  });

  it("includes the meal break when present", () => {
    const ev = shiftToSyncEvent(
      shift({ breaks: [{ kind: "meal", start: 11 * 60, end: 11 * 60 + 30, paid: false }] }),
      ctx,
    );
    expect(ev.description).toContain("Meal break: 11:00–11:30");
  });
});

describe("calendarProviderStatus", () => {
  it("reports the mock and missing vars when OAuth is not configured", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const status = calendarProviderStatus();
    expect(status.configured).toBe(false);
    expect(status.kind).toBe("mock");
    expect(status.missing).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(getCalendarProvider().kind).toBe("mock");
  });

  it("reports Google once both vars are present", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "cid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    const status = calendarProviderStatus();
    expect(status.configured).toBe(true);
    expect(status.kind).toBe("google");
    expect(status.missing).toEqual([]);
    expect(getCalendarProvider().kind).toBe("google");
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });
});

describe("MockCalendarProvider", () => {
  beforeEach(() => _resetMockCalendar());

  it("round-trips auth and upserts/deletes events", async () => {
    const p = new MockCalendarProvider();
    const url = new URL(p.getAuthUrl("state-123", "https://app.test/callback"));
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code")).toBe("mock-auth-code");

    const tokens = await p.exchangeCode();
    expect(tokens.accessToken).toBeTruthy();

    const ev = shiftToSyncEvent(shift(), ctx);
    await p.upsertEvent(tokens.accessToken, ev);
    expect(_mockCalendarEvents()).toHaveLength(1);
    // Idempotent: upserting again keeps a single event.
    await p.upsertEvent(tokens.accessToken, ev);
    expect(_mockCalendarEvents()).toHaveLength(1);

    await p.deleteEvent(tokens.accessToken, ev.googleEventId);
    expect(_mockCalendarEvents()).toHaveLength(0);
  });
});

describe("planUserCalendarSync", () => {
  const refs = {
    positions: [{ id: "pos-desk", name: "Service Desk" }],
    locations: [{ id: "loc-main", name: "Main Library" }],
    tasks: [{ id: "t1", name: "Reshelving" }],
    appBaseUrl: "https://scheduler.example.edu",
    timeZone: "America/Los_Angeles",
  };

  it("plans upserts only for the user's own published, non-cancelled shifts", () => {
    const plan = planUserCalendarSync({
      userId: "u1",
      shifts: [
        shift({ id: "a", employeeId: "u1", scheduleId: "pub" }),
        shift({ id: "b", employeeId: "u2", scheduleId: "pub" }), // other user
        shift({ id: "c", employeeId: "u1", scheduleId: "draft" }), // not published
      ],
      publishedScheduleIds: new Set(["pub"]),
      ...refs,
    });
    expect(plan.upserts.map((e) => e.sourceId)).toEqual([shiftSourceId("a")]);
    expect(plan.deletions).toEqual([]);
  });

  it("turns cancelled published shifts into deletions", () => {
    const plan = planUserCalendarSync({
      userId: "u1",
      shifts: [shift({ id: "x", employeeId: "u1", scheduleId: "pub", status: "cancelled" })],
      publishedScheduleIds: ["pub"],
      ...refs,
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.deletions).toEqual([googleEventId(shiftSourceId("x"))]);
  });

  it("respects the fromDate horizon", () => {
    const plan = planUserCalendarSync({
      userId: "u1",
      shifts: [
        shift({ id: "old", date: "2026-01-01", scheduleId: "pub" }),
        shift({ id: "new", date: "2026-08-01", scheduleId: "pub" }),
      ],
      publishedScheduleIds: ["pub"],
      fromDate: "2026-07-01",
      ...refs,
    });
    expect(plan.upserts.map((e) => e.sourceId)).toEqual([shiftSourceId("new")]);
  });
});

describe("planPublishedScheduleSync", () => {
  const refs = {
    positions: [{ id: "pos-desk", name: "Service Desk" }],
    locations: [{ id: "loc-main", name: "Main Library" }],
    tasks: [{ id: "t1", name: "Reshelving" }],
    appBaseUrl: "https://scheduler.example.edu",
    timeZone: "America/Los_Angeles",
  };

  it("plans one entry per assignee of the target schedule only", () => {
    const plans = planPublishedScheduleSync({
      scheduleId: "sched-pub",
      shifts: [
        shift({ id: "a", employeeId: "u1", scheduleId: "sched-pub" }),
        shift({ id: "b", employeeId: "u2", scheduleId: "sched-pub" }),
        shift({ id: "c", employeeId: "u1", scheduleId: "sched-pub" }), // same user, second shift
        shift({ id: "d", employeeId: "u3", scheduleId: "other" }), // different schedule
        shift({ id: "e", employeeId: null, scheduleId: "sched-pub" }), // open/unassigned
      ],
      ...refs,
    });
    const byUser = Object.fromEntries(plans.map((p) => [p.userId, p]));
    expect(Object.keys(byUser).sort()).toEqual(["u1", "u2"]);
    expect(byUser.u1.upserts.map((e) => e.sourceId).sort()).toEqual(
      [shiftSourceId("a"), shiftSourceId("c")].sort(),
    );
    expect(byUser.u2.upserts.map((e) => e.sourceId)).toEqual([shiftSourceId("b")]);
  });

  it("omits assignees with nothing to sync and emits deletions for cancellations", () => {
    const plans = planPublishedScheduleSync({
      scheduleId: "sched-pub",
      shifts: [
        shift({ id: "x", employeeId: "u1", scheduleId: "sched-pub", status: "cancelled" }),
      ],
      ...refs,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].userId).toBe("u1");
    expect(plans[0].upserts).toEqual([]);
    expect(plans[0].deletions).toEqual([googleEventId(shiftSourceId("x"))]);
  });
});
