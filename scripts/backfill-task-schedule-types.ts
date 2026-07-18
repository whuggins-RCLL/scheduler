/**
 * One-time, idempotent backfill of task -> schedule-type assignments.
 *
 * The scheduling grid scopes each board to the tasks assigned to that schedule
 * type via `applicableLocationIds`. Historically every task shipped with an
 * empty list (which the app reads as "every schedule type"), so every board
 * showed every task. `defaultTasks()` now carries a sensible per-task schedule
 * type mapping; this script applies that same mapping to existing Firestore
 * task documents that were never assigned.
 *
 * Safe by construction:
 *   - Only tasks whose id matches the default catalog are touched.
 *   - A task is updated only when its stored `applicableLocationIds` is empty,
 *     so deliberate admin assignments are never overwritten.
 *   - Re-running is a no-op once tasks are assigned.
 *
 * Usage:
 *   gcloud auth application-default login
 *   npm run backfill:task-schedule-types -- --dry-run   # preview only
 *   npm run backfill:task-schedule-types                # apply
 */
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ORGANIZATION_ID } from "../src/lib/config";
import { defaultTasks } from "../src/lib/store/default-tasks";

const dryRun = process.argv.includes("--dry-run");

const app = initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
    : { credential: applicationDefault() },
);
const db = getFirestore(app);
const tasksPath = `organizations/${ORGANIZATION_ID}/tasks`;

const projectId =
  app.options.projectId ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "(unknown — check credentials)";

/** Default schedule-type assignment per task id (only tasks that have one). */
const ASSIGNMENT = new Map<string, string[]>(
  defaultTasks()
    .filter((t) => t.applicableLocationIds.length > 0)
    .map((t) => [t.id, t.applicableLocationIds]),
);

function currentLocations(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function main() {
  console.log(`Backfill task -> schedule-type assignments`);
  console.log(`  project:   ${projectId}`);
  console.log(`  org:       ${ORGANIZATION_ID}`);
  console.log(`  mode:      ${dryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`  catalog:   ${ASSIGNMENT.size} tasks with a default schedule type\n`);

  const snapshot = await db.collection(tasksPath).get();
  if (snapshot.empty) {
    console.log("No task documents found — nothing to backfill.");
    return;
  }

  let assigned = 0;
  let skippedAlreadySet = 0;
  let skippedNotInCatalog = 0;

  for (const docSnap of snapshot.docs) {
    const id = docSnap.id;
    const target = ASSIGNMENT.get(id);
    if (!target) {
      skippedNotInCatalog += 1;
      continue;
    }
    const existing = currentLocations(docSnap.get("applicableLocationIds"));
    if (existing.length > 0) {
      skippedAlreadySet += 1;
      continue;
    }
    const name = String(docSnap.get("name") ?? id);
    console.log(`  ${dryRun ? "would assign" : "assign"}: ${name} (${id}) -> [${target.join(", ")}]`);
    if (!dryRun) {
      await docSnap.ref.update({ applicableLocationIds: target });
    }
    assigned += 1;
  }

  console.log(`\nDone.`);
  console.log(`  assigned:            ${assigned}`);
  console.log(`  skipped (already set): ${skippedAlreadySet}`);
  console.log(`  skipped (custom task): ${skippedNotInCatalog}`);
  if (dryRun && assigned > 0) {
    console.log(`\nRe-run without --dry-run to apply these ${assigned} change(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
