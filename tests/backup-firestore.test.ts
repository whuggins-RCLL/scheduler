import type { UserRecord } from "firebase-admin/auth";
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  KNOWN_ORG_COLLECTIONS,
  serializeAuthUser,
  serializeFirestoreValue,
} from "../scripts/backup-firestore";

describe("serializeFirestoreValue", () => {
  it("converts timestamps and nested structures", () => {
    const ts = Timestamp.fromDate(new Date("2026-07-23T12:00:00.000Z"));
    const value = serializeFirestoreValue({
      createdAt: ts,
      tags: ["desk", "main"],
      nested: { count: 2, active: true },
    });
    expect(value).toEqual({
      createdAt: "2026-07-23T12:00:00.000Z",
      tags: ["desk", "main"],
      nested: { count: 2, active: true },
    });
  });
});

describe("serializeAuthUser", () => {
  it("keeps claims and metadata without secrets", () => {
    const user = serializeAuthUser({
      uid: "abc123",
      email: "whuggins@stanford.edu",
      displayName: "Will Huggins",
      disabled: false,
      emailVerified: true,
      customClaims: { roles: ["SUPER_ADMIN"], orgId: "rcll" },
      metadata: {
        creationTime: "2026-01-01T00:00:00.000Z",
        lastSignInTime: "2026-07-23T00:00:00.000Z",
        lastRefreshTime: null,
        toJSON: () => ({}),
      },
      providerData: [],
      toJSON: () => ({}),
    } as UserRecord);
    expect(user.uid).toBe("abc123");
    expect(user.customClaims).toEqual({ roles: ["SUPER_ADMIN"], orgId: "rcll" });
    expect(user.metadata.creationTime).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("KNOWN_ORG_COLLECTIONS", () => {
  it("includes the scheduling core and user collections", () => {
    expect(KNOWN_ORG_COLLECTIONS).toContain("users");
    expect(KNOWN_ORG_COLLECTIONS).toContain("schedules");
    expect(KNOWN_ORG_COLLECTIONS).toContain("shifts");
  });
});
