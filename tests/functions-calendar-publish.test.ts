import { describe, expect, it } from "vitest";
import { shouldSyncOnScheduleWrite } from "../functions/src/calendar-publish";

describe("shouldSyncOnScheduleWrite", () => {
  it("fires when a schedule becomes published", () => {
    expect(shouldSyncOnScheduleWrite({ status: "draft" }, { status: "published", version: 1 })).toBe(true);
    expect(shouldSyncOnScheduleWrite(undefined, { status: "published", version: 1 })).toBe(true);
  });

  it("does not fire for non-published writes", () => {
    expect(shouldSyncOnScheduleWrite({ status: "draft" }, { status: "draft" })).toBe(false);
    expect(shouldSyncOnScheduleWrite({ status: "published" }, { status: "archived" })).toBe(false);
    expect(shouldSyncOnScheduleWrite({ status: "published" }, undefined)).toBe(false); // deletion
  });

  it("does not re-fire when an already-published schedule is written unchanged", () => {
    const doc = { status: "published", version: 3, publishedVersion: 3 };
    expect(shouldSyncOnScheduleWrite(doc, { ...doc })).toBe(false);
  });

  it("re-fires when a published schedule is republished at a new version", () => {
    expect(
      shouldSyncOnScheduleWrite(
        { status: "published", version: 3, publishedVersion: 3 },
        { status: "published", version: 4, publishedVersion: 4 },
      ),
    ).toBe(true);
  });
});
