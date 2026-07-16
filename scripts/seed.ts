import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { BOOTSTRAP_ADMINS, ORGANIZATION_ID } from "../src/lib/config";
import { defaultTasks } from "../src/lib/store/default-tasks";
import { DEPARTMENTS } from "../src/lib/store/departments";
import { seedLocations } from "../src/lib/store/seed";

const app = initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
    : { credential: applicationDefault() },
);

// Make it obvious WHERE we are writing — the #1 reason a seed "succeeds" but the
// data never appears in production is that it hit the wrong project or a running
// local emulator.
const projectId =
  app.options.projectId ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "(unknown — check GOOGLE_APPLICATION_CREDENTIALS)";
console.log(`Seeding project: ${projectId} (organization "${ORGANIZATION_ID}")`);
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.warn(
    `⚠︎  Emulator env vars are set — writing to the EMULATOR, not production:\n` +
      `    FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST ?? "(unset)"}\n` +
      `    FIREBASE_AUTH_EMULATOR_HOST=${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "(unset)"}\n` +
      `    Unset them to seed production.`,
  );
}

const db = getFirestore();

async function main() {
  for (const admin of BOOTSTRAP_ADMINS) {
    const user = await getAuth()
      .getUserByEmail(admin.email)
      .catch(() => getAuth().createUser({ email: admin.email, displayName: admin.name, emailVerified: true }));
    const roles = ["SUPER_ADMIN", "MANAGER"];
    await getAuth().setCustomUserClaims(user.uid, { roles, orgId: ORGANIZATION_ID });
    await db.doc(`organizations/${ORGANIZATION_ID}/users/${user.uid}`).set(
      { email: admin.email, displayName: admin.name, state: "active", roles, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await db.doc(`organizations/${ORGANIZATION_ID}/employeeProfiles/${user.uid}`).set(
      {
        legalName: admin.name,
        email: admin.email,
        classification: "manager",
        departmentId: "dept-admin",
        primaryLocationId: "loc-main",
        eligibleLocationIds: ["loc-main", "loc-desk"],
        additionalManagerIds: [],
        active: true,
        setupComplete: true,
        targetWeeklyHours: 40,
        minWeeklyHours: 0,
        maxWeeklyHours: 45,
        maxDailyHours: 8,
        earliestStart: 7 * 60,
        latestEnd: 22 * 60,
        minTurnaroundMinutes: 480,
        overtimeEligible: false,
        breakPolicyId: "exempt-v1",
        qualifiedPositionIds: [],
        qualifiedTaskIds: [],
        employmentPercentage: 1,
        googleCalendarConnected: false,
        notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`  ✓ ${admin.email} → uid ${user.uid}`);
  }

  const tasksCol = db.collection(`organizations/${ORGANIZATION_ID}/tasks`);
  const existingTasks = await tasksCol.limit(1).get();
  if (existingTasks.empty) {
    const tasks = defaultTasks();
    for (const task of tasks) {
      await tasksCol.doc(task.id).set(
        {
          name: task.name,
          category: task.category,
          colorToken: task.colorToken,
          icon: task.icon,
          applicableLocationIds: task.applicableLocationIds,
          estimatedMinutes: task.estimatedMinutes,
          priority: task.priority,
          minAssignees: task.minAssignees,
          maxAssignees: task.maxAssignees,
          allowedDuringPosition: task.allowedDuringPosition,
          requiresAcknowledgement: task.requiresAcknowledgement,
          checklist: task.checklist,
          openingDependency: task.openingDependency,
          closingDependency: task.closingDependency,
          order: task.order,
          active: task.active,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    console.log(`  ✓ Seeded ${tasks.length} default tasks`);
  } else {
    console.log("  · Tasks collection already populated — skipping task seed");
  }

  const departmentsCol = db.collection(`organizations/${ORGANIZATION_ID}/departments`);
  const existingDepartments = await departmentsCol.limit(1).get();
  if (existingDepartments.empty) {
    for (const department of DEPARTMENTS) {
      await departmentsCol.doc(department.id).set(
        { name: department.name, active: department.active, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    console.log(`  ✓ Seeded ${DEPARTMENTS.length} departments`);
  } else {
    console.log("  · Departments collection already populated — skipping department seed");
  }

  const locationsCol = db.collection(`organizations/${ORGANIZATION_ID}/locations`);
  const existingLocations = await locationsCol.limit(1).get();
  if (existingLocations.empty) {
    for (const location of seedLocations()) {
      await locationsCol.doc(location.id).set(
        {
          name: location.name,
          shortName: location.shortName,
          description: location.description ?? null,
          timeZone: location.timeZone,
          minStaffing: location.minStaffing,
          openBufferMinutes: location.openBufferMinutes,
          closeBufferMinutes: location.closeBufferMinutes,
          libcalId: location.libcalId ?? null,
          active: location.active,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    console.log(`  ✓ Seeded ${seedLocations().length} schedule types`);
  } else {
    console.log("  · Locations collection already populated — skipping schedule type seed");
  }

  console.log(`Seeded ${BOOTSTRAP_ADMINS.length} bootstrap administrators to ${projectId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
