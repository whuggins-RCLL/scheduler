/**
 * Firebase Cloud Functions for RCLL Scheduler.
 *
 * `syncUserClaims` keeps Firebase Auth custom claims in lockstep with each
 * user's Firestore record. The app writes role/approval changes to the user
 * document (which drives its own UI gating); this trigger mirrors them onto the
 * `roles` custom claim that `firestore.rules` enforce at the database layer, so
 * an approved manager can actually write manager-gated collections.
 *
 * A single `onDocumentWritten` trigger covers every transition:
 *   - create / approval  → grants the role claim,
 *   - role change (demotion / promotion) → updates it,
 *   - suspension / rejection (state ≠ active) → removes it,
 *   - document deletion   → removes it.
 * The write is skipped whenever the claims already match (idempotent), and all
 * unrelated claims are preserved. See `claims.ts` for the pure logic + tests.
 *
 * `provisionMissingUsers` creates a Firestore user document for every Firebase
 * Auth user who signed in before the app started writing documents — the in-app
 * equivalent of `npm run backfill:users`. It is driven by a Firestore trigger
 * (not an HTTPS callable) so it works in locked-down GCP orgs where Cloud Run
 * services cannot be made publicly invokable: an admin writes a request document
 * (allowed by the security rules), the trigger runs internally and writes the
 * result back. No public HTTP surface, so no CORS / org-policy issues.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { reconcileClaims } from "./claims";
import { defaultEmployeeProfileData, shouldHaveEmployeeProfile } from "./employee-profile";
import {
  ORGANIZATION_ID,
  isApprovedDomain,
  isBootstrapAdminEmail,
  normalizeEmail,
} from "./provision";
import {
  SCHEDULER_ACTOR_ID,
  nextWeekStart,
  planWeeklyDraft,
  seedForWeek,
} from "./weekly-draft";
import { handlePublishedSchedule, shouldSyncOnScheduleWrite } from "./calendar-publish";
import { DEFAULT_TIMEZONE } from "../../src/lib/config";
import { addDays, todayInTimeZone } from "../../src/domain/time";
import { emptyDatabase } from "../../src/lib/store/types";
import type { CoverageRequirement } from "../../src/domain/scheduling";
import type {
  AvailabilityPattern,
  BreakPolicy,
  EmployeeProfile,
  GlobalException,
  LeaveRecord,
  LeaveType,
  ManagerNote,
  Position,
  Schedule,
  Shift,
  UserAccount,
} from "../../src/domain/types";

if (!getApps().length) initializeApp();
setGlobalOptions({ region: "us-central1" });

export const syncUserClaims = onDocumentWritten(
  "organizations/{orgId}/users/{userId}",
  async (event) => {
    const { orgId, userId } = event.params as { orgId: string; userId: string };
    const before = event.data?.before;
    const after = event.data?.after;
    const previousUserDoc = before?.exists ? before.data() : undefined;
    const userDoc = after?.exists ? after.data() : undefined; // undefined => deleted

    const auth = getAuth();
    let existingClaims: Record<string, unknown> | undefined;
    try {
      const user = await auth.getUser(userId);
      existingClaims = user.customClaims ?? {};
    } catch (err) {
      // No matching auth user (e.g. a placeholder doc, or the auth user was
      // deleted first). Nothing to reconcile.
      logger.warn(`syncUserClaims: no auth user for ${userId}; skipping`, err);
      return;
    }

    const { claims, changed } = reconcileClaims({ existingClaims, userDoc, orgId });
    if (changed) {
      await auth.setCustomUserClaims(userId, claims);
      // Force existing sessions to pick up the new claims on their next refresh,
      // so a demotion or revocation takes effect promptly instead of after ~1h.
      await auth.revokeRefreshTokens(userId);
      logger.info(`syncUserClaims: updated claims for ${userId}`, {
        roles: claims.roles ?? [],
      });
    } else {
      logger.debug(`syncUserClaims: claims already in sync for ${userId}`);
    }

    const profileRef = getFirestore().doc(`organizations/${orgId}/employeeProfiles/${userId}`);
    const profile = await profileRef.get();
    if (shouldHaveEmployeeProfile(userDoc)) {
      if (!profile.exists) {
        await profileRef.set({
          ...defaultEmployeeProfileData(userId, userDoc ?? {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info(`syncUserClaims: created draft employee profile for ${userId}`);
      } else if (!shouldHaveEmployeeProfile(previousUserDoc) && profile.data()?.active !== true) {
        // Restore scheduling membership when an account is reactivated or gains
        // its first staff role. Staff-to-staff role changes preserve an admin's
        // explicit decision to exclude an otherwise active profile.
        await profileRef.set({ active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        logger.info(`syncUserClaims: reactivated employee profile for ${userId}`);
      }
    } else if (!shouldHaveEmployeeProfile(userDoc) && profile.exists && profile.data()?.active === true) {
      await profileRef.set({ active: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      logger.info(`syncUserClaims: disabled employee profile for ${userId}`);
    }
  },
);

export interface ProvisionResult {
  created: number;
  admins: number;
  existing: number;
  skipped: number;
}

/**
 * Create a Firestore user document for every Firebase Auth user who lacks one
 * (people who signed in before the app wrote documents). Approved-domain users
 * become `pending_approval`; bootstrap admins become active `SUPER_ADMIN` (the
 * syncUserClaims trigger then grants their claim from the new document).
 * Non-approved-domain accounts are skipped, existing documents are left
 * untouched, and the whole thing is idempotent.
 */
async function provisionMissingUserDocs(orgId: string): Promise<ProvisionResult> {
  const auth = getAuth();
  const db = getFirestore();
  const result: ProvisionResult = { created: 0, admins: 0, existing: 0, skipped: 0 };
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = normalizeEmail(user.email ?? "");
      if (!email || !isApprovedDomain(email)) {
        result.skipped++;
        continue;
      }
      const ref = db.doc(`organizations/${orgId}/users/${user.uid}`);
      if ((await ref.get()).exists) {
        result.existing++;
        continue;
      }
      const bootstrap = isBootstrapAdminEmail(email);
      await ref.set({
        email,
        displayName: user.displayName ?? email,
        state: bootstrap ? "active" : "pending_approval",
        roles: bootstrap ? ["SUPER_ADMIN", "MANAGER"] : [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (bootstrap) result.admins++;
      result.created++;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return result;
}

/**
 * Trigger-driven "import sign-ins": an administrator writes a request document
 * to `organizations/{orgId}/maintenance/{taskId}` (create is admin-only per the
 * security rules). This trigger runs the backfill and writes the result back to
 * the same document, which the app watches. Using a Firestore trigger instead of
 * an HTTPS callable avoids needing a publicly-invokable Cloud Run service — the
 * kind of public access that university GCP org policies block (and that
 * produced CORS failures for the callable version).
 */
export const provisionMissingUsers = onDocumentWritten(
  "organizations/{orgId}/maintenance/{taskId}",
  async (event) => {
    const { orgId } = event.params as { orgId: string; taskId: string };
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() ?? {};
    // Only act on a fresh request; our own result write (status "done"/"error")
    // re-fires this trigger and must be ignored to avoid a loop.
    if (data.type !== "provisionUsers" || data.status !== "requested") return;

    try {
      const result = await provisionMissingUserDocs(orgId);
      logger.info(`provisionMissingUsers by ${data.requestedBy ?? "?"}`, result);
      await after.ref.set(
        { status: "done", result, completedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } catch (err) {
      logger.error("provisionMissingUsers failed", err);
      await after.ref.set(
        {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Automated weekly draft generation
// ---------------------------------------------------------------------------

/** Read a whole org collection into plain records, forcing `id` from the doc id. */
async function readCollection<T>(base: string, name: string): Promise<T[]> {
  const snap = await getFirestore().collection(`${base}/${name}`).get();
  return snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as T);
}

/** Commit writes in ≤450-op batches (Firestore caps a batch at 500). */
async function commitInChunks(
  ops: Array<{ kind: "set" | "delete"; path: string; data?: Record<string, unknown> }>,
): Promise<void> {
  const db = getFirestore();
  const CHUNK = 450;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + CHUNK)) {
      const ref = db.doc(op.path);
      if (op.kind === "set") batch.set(ref, op.data ?? {});
      else batch.delete(ref);
    }
    await batch.commit();
  }
}

/**
 * Generate a **draft** schedule for the upcoming week using the same
 * deterministic engine the app uses, so managers arrive to a starting draft
 * instead of a blank week. Runs weekly (Mondays 06:00 Pacific), drafting the
 * following Monday–Sunday. It never publishes and never overwrites a week that
 * already has a published or archived schedule, or any locked / human-authored
 * shift; a re-run only supersedes its own previous automated draft. Every run
 * is recorded in the audit trail.
 *
 * The Admin SDK bypasses Firestore rules, which is what lets this trusted
 * server code append to the append-only `auditEvents` collection and manage
 * draft `shifts`.
 */
export const generateWeeklyDraft = onSchedule(
  {
    schedule: "0 6 * * 1", // 06:00 every Monday
    timeZone: DEFAULT_TIMEZONE,
    region: "us-central1",
  },
  async () => {
    const orgId = ORGANIZATION_ID;
    const base = `organizations/${orgId}`;
    const now = new Date();
    const nowISO = now.toISOString();
    const todayISO = todayInTimeZone(DEFAULT_TIMEZONE, now);
    const weekStart = nextWeekStart(todayISO);
    const weekEnd = addDays(weekStart, 6);

    // A published or archived schedule for the week is a human decision we never
    // clobber; only an existing draft is regenerated in place.
    const weekSchedules = (await readCollection<Schedule>(base, "schedules")).filter(
      (s) => s.startDate === weekStart,
    );
    const locked = weekSchedules.find((s) => s.status === "published" || s.status === "archived");
    if (locked) {
      logger.info(
        `generateWeeklyDraft: week ${weekStart} already has a ${locked.status} schedule (${locked.id}); skipping`,
      );
      return;
    }
    const existing = weekSchedules.find((s) => s.status === "draft") ?? null;
    const scheduleId = existing?.id ?? `sched-auto-${weekStart}`;

    // Load the tenant slices the engine + leave resolver need.
    const snapshot = emptyDatabase();
    const [users, employees, availability, leave, leaveTypes, positions, breakPolicies, notes, globalExceptions, coverage, shifts] =
      await Promise.all([
        readCollection<UserAccount>(base, "users"),
        readCollection<EmployeeProfile>(base, "employeeProfiles"),
        readCollection<AvailabilityPattern>(base, "availabilityPatterns"),
        readCollection<LeaveRecord>(base, "leaveRecords"),
        readCollection<LeaveType>(base, "leaveTypes"),
        readCollection<Position>(base, "positions"),
        readCollection<BreakPolicy>(base, "breakPolicies"),
        readCollection<ManagerNote>(base, "managerNotes"),
        readCollection<GlobalException>(base, "globalExceptions"),
        readCollection<CoverageRequirement>(base, "coverageRequirements"),
        getFirestore().collection(`${base}/shifts`).where("scheduleId", "==", scheduleId).get(),
      ]);
    snapshot.users = users;
    snapshot.employees = employees;
    snapshot.availability = availability;
    snapshot.leave = leave;
    snapshot.leaveTypes = leaveTypes;
    snapshot.positions = positions;
    snapshot.breakPolicies = breakPolicies;
    snapshot.notes = notes;
    snapshot.globalExceptions = globalExceptions;
    snapshot.coverage = coverage;
    snapshot.shifts = shifts.docs.map((d) => ({ ...d.data(), id: d.id }) as Shift);

    const weekCoverage = snapshot.coverage.filter((c) => c.date >= weekStart && c.date <= weekEnd);
    if (weekCoverage.length === 0) {
      logger.info(`generateWeeklyDraft: no coverage requirements for ${weekStart}–${weekEnd}; nothing to draft`);
      return;
    }
    if (snapshot.employees.filter((e) => e.active).length === 0) {
      logger.info("generateWeeklyDraft: no active employees; nothing to draft");
      return;
    }

    const plan = planWeeklyDraft(snapshot, existing, {
      scheduleId,
      weekStart,
      weekEnd,
      seed: seedForWeek(weekStart),
      now: nowISO,
    });

    const ops: Array<{ kind: "set" | "delete"; path: string; data?: Record<string, unknown> }> = [];
    ops.push({ kind: "set", path: `${base}/schedules/${plan.schedule.id}`, data: { ...plan.schedule } });
    for (const id of plan.shiftIdsToDelete) ops.push({ kind: "delete", path: `${base}/shifts/${id}` });
    for (const s of plan.shiftsToWrite) ops.push({ kind: "set", path: `${base}/shifts/${s.id}`, data: { ...s } });
    ops.push({ kind: "set", path: `${base}/auditEvents/${plan.audit.id}`, data: { ...plan.audit } });

    await commitInChunks(ops);

    logger.info(`generateWeeklyDraft: drafted ${scheduleId} for ${weekStart}–${weekEnd}`, {
      actor: SCHEDULER_ACTOR_ID,
      generated: plan.shiftsToWrite.length,
      replaced: plan.shiftIdsToDelete.length,
      coverageScore: plan.result.coverageScore,
      unfilled: plan.result.unfilled.length,
      hardFindings: plan.result.findings.filter((f) => f.severity === "hard").length,
    });
  },
);

/**
 * Push a published schedule to every connected assignee's Google Calendar the
 * instant it's published. Server-side and reliable (Cloud Functions retries),
 * so it fires regardless of whether the publishing manager's browser is open —
 * the definitive version of the client-side publish push. Reuses the app's pure
 * planner + Google provider; deterministic event ids make the two idempotent.
 *
 * Requires GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (and, for event
 * links, APP_BASE_URL) in the functions environment; a no-op until configured.
 */
export const syncCalendarOnPublish = onDocumentWritten(
  "organizations/{orgId}/schedules/{scheduleId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!shouldSyncOnScheduleWrite(before, after)) return;

    const { orgId, scheduleId } = event.params as { orgId: string; scheduleId: string };
    try {
      const summary = await handlePublishedSchedule(getFirestore(), orgId, scheduleId);
      logger.info("syncCalendarOnPublish", { scheduleId, ...summary });
    } catch (err) {
      logger.error("syncCalendarOnPublish failed", err);
    }
  },
);
