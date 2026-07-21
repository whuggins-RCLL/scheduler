"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import type {
  AvailabilityPattern,
  ComplianceOverride,
  DailyNote,
  EmployeeProfile,
  GlobalException,
  LeaveRecord,
  Location,
  Position,
  Shift,
  StudentAvailabilityWindow,
  Task,
  UserAccount,
  WorkingHoursPattern,
} from "@/domain/types";
import type { GenerationMode, GenerationResult, ScheduleWeights } from "@/domain";
import { canManage, canPublishSchedule, isAdmin } from "@/domain/scope";
import { globalSyncFingerprint } from "@/domain/global-exceptions";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { todayISO } from "@/lib/schedule-view";
import * as actions from "./actions";
import {
  ensureUserAccount,
  roleNames,
  subscribeUsers,
  writeUserApproval,
  writeUserRoles,
  writeUserState,
} from "./firestore-users";
import {
  subscribeAvailabilityPatterns,
  subscribeEmployeeProfiles,
  subscribeWorkingHoursPatterns,
  deleteWorkingHoursPattern,
  writeAvailabilityPattern,
  writeEmployeeProfile,
  writeEmployeeSchedulingLinks,
  writeSelfProfilePreferences,
  writeWorkingHoursPattern,
} from "./firestore-workforce";
import {
  bootstrapDepartments,
  deletePosition as deletePositionDoc,
  subscribeDepartments,
  subscribeLocations,
  subscribePositions,
  writeLocation,
  writePosition,
} from "./firestore-config";
import {
  bootstrapGlobalExceptions,
  deleteGlobalExceptionDoc,
  subscribeGlobalExceptions,
  writeGlobalException,
} from "./firestore-global-exceptions";
import { bootstrapTasks, deleteTask as deleteTaskDoc, subscribeTasks, writeTask } from "./firestore-tasks";
import {
  subscribeSchedules,
  subscribeShifts,
  writeSchedule,
  writeShiftsBatch,
} from "./firestore-scheduling";
import {
  diffForSync,
  scheduleSignature,
  shiftSignature,
  snapshotOf,
  type SyncSnapshot,
} from "./scheduling-sync";
import { defaultTasks } from "./default-tasks";
import { buildSeed, seedLocations } from "./seed";
import { DEPARTMENTS } from "./departments";
import { unionById } from "./merge";
import type { Database } from "./types";

const SESSION_KEY = "rcll.session.userId";

/** Upsert a single account into the users array by id (used for the signed-in self). */
function mergeUser(db: Database, account: UserAccount): Database {
  const idx = db.users.findIndex((u) => u.id === account.id);
  const users = idx >= 0 ? db.users.map((u) => (u.id === account.id ? account : u)) : [...db.users, account];
  return { ...db, users };
}

function mergeEmployeeProfile(db: Database, profile: EmployeeProfile): Database {
  const exists = db.employees.some((employee) => employee.id === profile.id);
  const employees = exists
    ? db.employees.map((employee) => employee.id === profile.id ? profile : employee)
    : [...db.employees, profile];
  const next = { ...db, employees };
  return actions.syncAllGlobalExceptions(next, "system", new Date().toISOString());
}

/**
 * Mirror the signed-in account onto cookies read by `middleware.ts`. This is the
 * convenience route-protection layer only — real enforcement is server-side.
 */
function writeSessionCookies(account: UserAccount | null) {
  try {
    if (!account) {
      document.cookie = "cs_account_state=; path=/; max-age=0; SameSite=Lax";
      document.cookie = "cs_roles=; path=/; max-age=0; SameSite=Lax";
      return;
    }
    const roles = roleNames(account.roles).join(",");
    document.cookie = `cs_account_state=${account.state}; path=/; max-age=3600; SameSite=Lax`;
    document.cookie = `cs_roles=${roles}; path=/; max-age=3600; SameSite=Lax`;
  } catch {
    /* ignore (SSR / no document) */
  }
}

/**
 * Client-side store + session. In local/preview mode the whole tenant runs
 * against an in-memory {@link Database} (real admins + configuration only), so
 * every workflow functions end-to-end without live Firebase. The same pure
 * action functions run server-side against Firestore in production — see
 * docs/architecture.md. Authentication is a real session here: users sign in
 * from /login and sign out; when Firebase env vars are configured, Google
 * sign-in populates the same session.
 */
export type ViewAs = "self" | "student" | "staff";

export interface StoreContextValue {
  db: Database;
  /** The effective user the UI renders for — may be a sampled persona. */
  currentUser: UserAccount;
  /** The real signed-in account (never a sampled persona). */
  realUser: UserAccount;
  isAuthenticated: boolean;
  hydrated: boolean;
  viewAs: ViewAs;
  setViewAs: (mode: ViewAs) => void;
  signIn: (userId: string) => void;
  signOut: () => void;
  now: () => string;
  saveAvailability: (pattern: AvailabilityPattern, options?: { onBehalf?: boolean }) => Promise<void>;
  saveStudentAvailabilityApproval: (patternId: string, approvedBlocks: import("@/domain/types").AvailabilityBlock[]) => Promise<void>;
  saveWorkingHours: (pattern: WorkingHoursPattern) => Promise<void>;
  deleteWorkingHours: (patternId: string) => Promise<void>;
  saveStudentAvailabilityWindow: (window: StudentAvailabilityWindow) => void;
  saveEmployeeProfile: (profile: EmployeeProfile) => Promise<void>;
  savePreferences: (fields: { preferredName?: string; pronouns?: string }) => Promise<void>;
  submitLeave: (record: LeaveRecord, options?: { onBehalf?: boolean }) => void;
  cancelLeave: (id: string) => void;
  upsertGlobalException: (exception: GlobalException) => void;
  deleteGlobalException: (id: string) => void;
  upsertDailyNote: (note: DailyNote) => void;
  setDailyNotePublished: (id: string, published: boolean) => void;
  deleteDailyNote: (id: string) => void;
  loadSampleData: () => void;
  upsertShift: (shift: Shift) => void;
  cancelShift: (id: string) => void;
  toggleLock: (id: string) => void;
  upsertLocation: (location: Location) => void;
  setScheduleTypeAccess: (employeeId: string, locationIds: string[]) => void;
  setTaskQualifications: (employeeId: string, taskIds: string[]) => void;
  upsertPosition: (position: Position) => void;
  archivePosition: (id: string) => void;
  deletePosition: (id: string) => void;
  upsertTask: (task: Task) => void;
  archiveTask: (id: string) => void;
  deleteTask: (id: string) => void;
  runGeneration: (scheduleId: string, opts: { seed: number; weights?: ScheduleWeights; mode?: GenerationMode }) => GenerationResult;
  previewCoverage: (scheduleId: string) => actions.ResolvedCoverage;
  analyzeCoverageGaps: (scheduleId: string) => actions.ScheduleGapAnalysis;
  publishSchedule: (scheduleId: string) => actions.PublishResult;
  overrideCompliance: (o: Omit<ComplianceOverride, "id" | "createdAt">) => void;
  requestSwap: (input: { shiftId: string; toEmployeeId: string; reason?: string }) => actions.SwapOutcome;
  requestCoverage: (shiftId: string) => void;
  declineCoverage: (swapId: string) => void;
  acceptCoverage: (swapId: string) => void;
  expireStaleCoverage: (clock: { date: string; minute: number }) => void;
  approveUser: (userId: string) => void;
  setUserState: (userId: string, state: UserAccount["state"]) => void;
  setUserRoles: (userId: string, roles: UserAccount["roles"]) => void;
  compliance: (scheduleId: string) => ReturnType<typeof actions.computeCompliance>;
  fairness: (scheduleId: string) => ReturnType<typeof actions.computeScheduleFairness>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

/** Build a downgraded, employee-only persona for admin "view as" sampling. */
function samplePersona(db: Database, mode: Exclude<ViewAs, "self">, now: string): UserAccount {
  const wantStudent = mode === "student";
  const match = db.employees.find(
    (e) =>
      e.active &&
      (wantStudent
        ? e.classification === "student_worker"
        : e.classification === "non_exempt_staff" || e.classification === "exempt_staff"),
  );
  if (match) {
    const account = db.users.find((u) => u.id === match.id);
    return {
      id: match.id,
      email: match.email,
      displayName: match.preferredName ?? match.legalName,
      state: account?.state ?? "active",
      roles: [{ role: "LIBRARY_STAFF" }],
      createdAt: account?.createdAt ?? now,
      updatedAt: account?.updatedAt ?? now,
    };
  }
  return {
    id: `view-${mode}`,
    email: `${mode}@example.stanford.edu`,
    displayName: wantStudent ? "Sample student" : "Sample staff",
    state: "active",
    roles: [{ role: "LIBRARY_STAFF" }],
    createdAt: now,
    updatedAt: now,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => buildSeed());
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [viewAs, setViewAs] = useState<ViewAs>("self");
  const globalSyncKey = useRef("");
  const globalBootstrapDone = useRef(false);
  const tasksBootstrapDone = useRef(false);
  const configBootstrapDone = useRef(false);
  const locationsBootstrapDone = useRef(false);
  const purgeDone = useRef(false);
  // Reactive scheduling sync: what Firestore currently holds (id → signature),
  // so the persist effect writes only local changes and never echoes.
  const schedSnapshotRef = useRef<SyncSnapshot>(new Map());
  const shiftSnapshotRef = useRef<SyncSnapshot>(new Map());
  // The persist effect must not run until BOTH collections' initial snapshots
  // have arrived, or a race could write the seed over real Firestore data.
  const schedHydratedRef = useRef(false);
  const shiftHydratedRef = useRef(false);

  // Retention sweep: once hydrated, purge schedules/shifts older than the
  // retention window (15 days). Runs once per session load.
  useEffect(() => {
    if (!hydrated || purgeDone.current) return;
    purgeDone.current = true;
    const actorId = sessionUserId ?? "system";
    setDb((d) => actions.purgeOldSchedules(d, todayISO(), actorId, new Date().toISOString()));
  }, [hydrated, sessionUserId]);

  // Keep university-wide exceptions materialized for every active account whenever
  // the roster or global exception list changes (including Firestore profile loads).
  useEffect(() => {
    if (!hydrated) return;
    const fingerprint = globalSyncFingerprint(db);
    if (globalSyncKey.current === fingerprint) return;
    globalSyncKey.current = fingerprint;
    setDb((current) => actions.syncAllGlobalExceptions(current, "system", new Date().toISOString()));
  }, [hydrated, db.users, db.employees, db.globalExceptions]);

  // Session restore. Two mutually exclusive paths:
  //  - Demo/local mode: restore the seeded session id from localStorage.
  //  - Firebase mode: the Google sign-in session is the source of truth. Listen
  //    for it, self-provision a pending account on first sign-in, and (for
  //    admins/staff) subscribe to the whole users collection so new signups
  //    appear on the User management screen.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      try {
        const stored = window.localStorage.getItem(SESSION_KEY);
        if (stored && db.users.some((u) => u.id === stored)) setSessionUserId(stored);
      } catch {
        /* ignore */
      }
      setHydrated(true);
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      setHydrated(true);
      return;
    }

    let unsubscribeUsers: () => void = () => {};
    let unsubscribeProfiles: () => void = () => {};
    let unsubscribeAvailability: () => void = () => {};
    let unsubscribeWorkingHours: () => void = () => {};
    let unsubscribeGlobalExceptions: () => void = () => {};
    let unsubscribeTasks: () => void = () => {};
    let unsubscribePositions: () => void = () => {};
    let unsubscribeLocations: () => void = () => {};
    let unsubscribeDepartments: () => void = () => {};
    let unsubscribeSchedules: () => void = () => {};
    let unsubscribeShifts: () => void = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      unsubscribeUsers();
      unsubscribeProfiles();
      unsubscribeAvailability();
      unsubscribeWorkingHours();
      unsubscribeGlobalExceptions();
      unsubscribeTasks();
      unsubscribePositions();
      unsubscribeLocations();
      unsubscribeDepartments();
      unsubscribeSchedules();
      unsubscribeShifts();
      unsubscribeUsers = () => {};
      unsubscribeProfiles = () => {};
      unsubscribeAvailability = () => {};
      unsubscribeWorkingHours = () => {};
      unsubscribeGlobalExceptions = () => {};
      unsubscribeTasks = () => {};
      unsubscribePositions = () => {};
      unsubscribeLocations = () => {};
      unsubscribeDepartments = () => {};
      unsubscribeSchedules = () => {};
      unsubscribeShifts = () => {};
      schedHydratedRef.current = false;
      shiftHydratedRef.current = false;
      if (!fbUser) {
        writeSessionCookies(null);
        setSessionUserId(null);
        setHydrated(true);
        return;
      }
      let account: UserAccount | null = null;
      try {
        const ensuredAccount = await ensureUserAccount(fbUser);
        account = ensuredAccount;
        if (ensuredAccount) {
          // Merge the signed-in account so the session resolves even for a
          // pending, non-admin user (who cannot read the full collection).
          setDb((d) => mergeUser(d, ensuredAccount));
          setSessionUserId(ensuredAccount.id);
          writeSessionCookies(ensuredAccount);
        }
      } catch {
        /* ensure failed (e.g. offline) — leave unauthenticated */
      }
      // Admins/staff can read every user; ordinary users get a permission error
      // here, which we ignore (they only ever see themselves).
      unsubscribeUsers = subscribeUsers(
        (users) =>
          setDb((d) => actions.syncAllGlobalExceptions({ ...d, users }, "system", new Date().toISOString())),
        () => {
          /* not staff: self-only view already merged above */
        },
      );
      // Non-managers only see their own records, filtered by their account id
      // (the canonical-email key that `employeeId` uses) — not the raw Firebase
      // UID, which no longer matches stored data after account unification.
      const selfOnly = account && canManage(account) ? undefined : (account?.id ?? fbUser.uid);
      unsubscribeProfiles = subscribeEmployeeProfiles(
        (employees) =>
          setDb((d) => actions.syncAllGlobalExceptions({ ...d, employees }, "system", new Date().toISOString())),
        () => setDb((d) => ({ ...d, employees: [] })),
        selfOnly,
      );
      unsubscribeAvailability = subscribeAvailabilityPatterns(
        (availability) => setDb((d) => ({ ...d, availability })),
        () => setDb((d) => ({ ...d, availability: [] })),
        selfOnly,
      );
      unsubscribeWorkingHours = subscribeWorkingHoursPatterns(
        (workingHours) => setDb((d) => ({ ...d, workingHours })),
        () => setDb((d) => ({ ...d, workingHours: [] })),
        selfOnly,
      );
      unsubscribeGlobalExceptions = subscribeGlobalExceptions(
        (globalExceptions) => {
          setDb((d) => {
            // Keep the in-memory seed until Firestore has been populated.
            const source = globalExceptions.length > 0 ? globalExceptions : d.globalExceptions;
            const next = { ...d, globalExceptions: source };
            return actions.syncAllGlobalExceptions(next, "system", new Date().toISOString());
          });
          if (
            !globalBootstrapDone.current
            && globalExceptions.length === 0
            && account
            && canManage(account)
          ) {
            globalBootstrapDone.current = true;
            setDb((d) => {
              if (d.globalExceptions.length > 0) void bootstrapGlobalExceptions(d.globalExceptions);
              return d;
            });
          }
        },
        () => {
          /* keep in-memory seed when Firestore is unavailable */
        },
      );
      unsubscribeTasks = subscribeTasks(
        (tasks) => {
          setDb((d) => ({ ...d, tasks: tasks.length > 0 ? tasks : d.tasks }));
          if (
            !tasksBootstrapDone.current
            && tasks.length === 0
            && account
            && canManage(account)
          ) {
            tasksBootstrapDone.current = true;
            const seed = defaultTasks();
            void bootstrapTasks(seed);
            setDb((d) => (d.tasks.length > 0 ? d : { ...d, tasks: seed }));
          }
        },
        () => {
          /* keep in-memory tasks when Firestore is unavailable */
        },
      );
      const maybeBootstrapConfig = (account: UserAccount | null) => {
        if (!account || !canManage(account) || configBootstrapDone.current) return;
        configBootstrapDone.current = true;
        setDb((d) => {
          if (d.departments.length === 0) void bootstrapDepartments(DEPARTMENTS);
          return d;
        });
      };
      unsubscribeDepartments = subscribeDepartments(
        (departments) => {
          setDb((d) => ({ ...d, departments: departments.length > 0 ? departments : d.departments }));
          maybeBootstrapConfig(account);
        },
        () => { /* keep seed */ },
      );
      unsubscribeLocations = subscribeLocations(
        (locations) => {
          // Always keep the built-in schedule types (main/desk/stacks/breaks);
          // Firestore edits win by id, and Firestore-only types are included.
          // A partial or empty snapshot can no longer wipe seeded types.
          setDb((d) => ({ ...d, locations: unionById(seedLocations(), locations) }));
          // Persist any seed schedule type missing from Firestore so it sticks
          // across reloads (the previous bootstrap never ran because the seed
          // pre-fills locations, so only some types were ever written).
          if (account && canManage(account)) {
            const present = new Set(locations.map((l) => l.id));
            for (const loc of seedLocations()) {
              if (!present.has(loc.id)) void writeLocation(loc);
            }
          }
        },
        () => { /* keep seed */ },
      );
      unsubscribePositions = subscribePositions(
        // Merge by id so a transient empty/partial snapshot (or the moment before
        // a just-saved position round-trips) never wipes admin-created positions.
        (positions) => setDb((d) => ({ ...d, positions: unionById(d.positions, positions) })),
        () => { /* keep local */ },
      );
      // Scheduling core. The snapshot ref is set to exactly what Firestore holds
      // so the persist effect writes only local changes. Keep the in-memory seed
      // until Firestore has been populated (a manager bootstraps it on first
      // load via the persist effect, same as tasks/locations).
      unsubscribeSchedules = subscribeSchedules(
        (schedules) => {
          schedSnapshotRef.current = snapshotOf(schedules, scheduleSignature);
          schedHydratedRef.current = true;
          setDb((d) => ({ ...d, schedules: schedules.length > 0 ? schedules : d.schedules }));
        },
        () => { schedHydratedRef.current = true; /* keep seed when unavailable */ },
      );
      unsubscribeShifts = subscribeShifts(
        (shifts) => {
          shiftSnapshotRef.current = snapshotOf(shifts, shiftSignature);
          shiftHydratedRef.current = true;
          setDb((d) => ({ ...d, shifts: shifts.length > 0 ? shifts : d.shifts }));
        },
        () => { shiftHydratedRef.current = true; /* keep seed when unavailable */ },
      );
      setHydrated(true);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUsers();
      unsubscribeProfiles();
      unsubscribeAvailability();
      unsubscribeWorkingHours();
      unsubscribeGlobalExceptions();
      unsubscribeTasks();
      unsubscribePositions();
      unsubscribeLocations();
      unsubscribeDepartments();
      unsubscribeSchedules();
      unsubscribeShifts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactive persistence for the scheduling core. Any local change to schedules
  // or shifts is diffed against what Firestore holds and the changed docs are
  // written (creates/updates only — never deletes). Gated to staff, since the
  // rules only permit them to write; students read the published result. This
  // also performs the first-load bootstrap: when Firestore is empty, the seed
  // schedule/shifts are written once.
  useEffect(() => {
    if (!isFirebaseConfigured || !schedHydratedRef.current || !shiftHydratedRef.current) return;
    const account = sessionUserId ? db.users.find((u) => u.id === sessionUserId) : undefined;
    if (!account || !canManage(account)) return;

    const sched = diffForSync(schedSnapshotRef.current, db.schedules, scheduleSignature);
    if (sched.writes.length > 0) {
      schedSnapshotRef.current = sched.next;
      for (const s of sched.writes) void writeSchedule(s).catch(() => {});
    }
    const shift = diffForSync(shiftSnapshotRef.current, db.shifts, shiftSignature);
    if (shift.writes.length > 0) {
      shiftSnapshotRef.current = shift.next;
      void writeShiftsBatch(shift.writes).catch(() => {});
    }
  }, [db.schedules, db.shifts, db.users, sessionUserId]);

  const now = () => new Date().toISOString();
  const actorId = sessionUserId ?? "system";

  const value = useMemo<StoreContextValue>(() => {
    const sessionUser = sessionUserId ? db.users.find((u) => u.id === sessionUserId) : undefined;
    const realUser = sessionUser ?? db.users[0];
    // Admins may sample the student/staff experience; downgrade the effective
    // user to that persona while keeping the real actor for audit + actions.
    const currentUser =
      viewAs !== "self" && isAdmin(realUser) ? samplePersona(db, viewAs, now()) : realUser;
    return {
      db,
      currentUser,
      realUser,
      isAuthenticated: !!sessionUser,
      hydrated,
      viewAs,
      setViewAs,
      signIn: (userId) => {
        try { window.localStorage.setItem(SESSION_KEY, userId); } catch { /* ignore */ }
        setViewAs("self");
        setSessionUserId(userId);
      },
      signOut: () => {
        try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
        setViewAs("self");
        if (isFirebaseConfigured) {
          const auth = getFirebaseAuth();
          // The auth listener clears the session + cookies when sign-out lands.
          if (auth) { void firebaseSignOut(auth); return; }
        }
        writeSessionCookies(null);
        setSessionUserId(null);
      },
      now,
      saveAvailability: async (pattern, options) => {
        const persisted = { ...pattern, updatedBy: actorId, updatedAt: now() };
        if (isFirebaseConfigured) await writeAvailabilityPattern(persisted);
        setDb((d) => actions.saveAvailability(d, persisted, actorId, persisted.updatedAt, currentUser, options));
      },
      saveStudentAvailabilityApproval: async (patternId, approvedBlocks) => {
        const ts = now();
        if (isFirebaseConfigured) {
          const pattern = db.availability.find((p) => p.id === patternId);
          if (pattern) {
            await writeAvailabilityPattern({
              ...pattern,
              approvedBlocks,
              approvedBy: actorId,
              approvedAt: ts,
              updatedAt: ts,
            });
          }
        }
        setDb((d) => actions.saveStudentAvailabilityApproval(d, patternId, approvedBlocks, actorId, ts, currentUser));
      },
      saveWorkingHours: async (pattern) => {
        const persisted = { ...pattern, updatedBy: actorId, updatedAt: now() };
        if (isFirebaseConfigured) await writeWorkingHoursPattern(persisted);
        setDb((d) => actions.saveWorkingHours(d, persisted, actorId, persisted.updatedAt));
      },
      deleteWorkingHours: async (patternId) => {
        if (isFirebaseConfigured) await deleteWorkingHoursPattern(patternId);
        setDb((d) => actions.deleteWorkingHours(d, patternId, actorId, now()));
      },
      saveStudentAvailabilityWindow: (window) => {
        const persisted = { ...window, updatedBy: actorId, updatedAt: now() };
        setDb((d) => actions.saveStudentAvailabilityWindow(d, persisted, actorId, persisted.updatedAt));
      },
      saveEmployeeProfile: async (profile) => {
        if (isFirebaseConfigured) await writeEmployeeProfile(profile);
        setDb((d) => mergeEmployeeProfile(d, profile));
      },
      savePreferences: async (fields) => {
        const profile = db.employees.find((e) => e.id === currentUser.id);
        if (!profile) return;
        const updated = { ...profile, ...fields };
        // Self-service write: a non-manager may only touch their own preference
        // fields, so send the minimal self payload (not the whole profile).
        if (isFirebaseConfigured) await writeSelfProfilePreferences(updated);
        setDb((d) => mergeEmployeeProfile(d, updated));
      },
      submitLeave: (record, options) => setDb((d) => actions.submitLeave(d, record, actorId, now(), currentUser, options)),
      cancelLeave: (id) => setDb((d) => actions.cancelLeave(d, id, actorId, now())),
      upsertGlobalException: (exception) => {
        if (isFirebaseConfigured) void writeGlobalException(exception);
        setDb((d) => actions.upsertGlobalException(d, exception, actorId, now()));
      },
      deleteGlobalException: (id) => {
        if (isFirebaseConfigured) void deleteGlobalExceptionDoc(id);
        setDb((d) => actions.deleteGlobalException(d, id, actorId, now()));
      },
      upsertDailyNote: (note) => setDb((d) => actions.upsertDailyNote(d, note, actorId, now())),
      setDailyNotePublished: (id, published) => setDb((d) => actions.setDailyNotePublished(d, id, published, actorId, now())),
      deleteDailyNote: (id) => setDb((d) => actions.deleteDailyNote(d, id, actorId, now())),
      loadSampleData: () => setDb((d) => actions.loadSampleData(d, actorId, now())),
      upsertShift: (shift) => setDb((d) => actions.upsertShift(d, shift, actorId, now())),
      cancelShift: (id) => setDb((d) => actions.cancelShift(d, id, actorId, now())),
      toggleLock: (id) => setDb((d) => actions.toggleLock(d, id, actorId, now())),
      upsertLocation: (location) => {
        if (isFirebaseConfigured) {
          void writeLocation(location).catch((error) => {
            console.error("Failed to persist schedule type to Firestore", error);
          });
        }
        setDb((d) => actions.upsertLocation(d, location, actorId, now()));
      },
      setScheduleTypeAccess: (employeeId, locationIds) => {
        if (isFirebaseConfigured) void writeEmployeeSchedulingLinks(employeeId, { eligibleLocationIds: locationIds });
        setDb((d) => actions.setScheduleTypeAccess(d, employeeId, locationIds, actorId, now()));
      },
      setTaskQualifications: (employeeId, taskIds) => {
        if (isFirebaseConfigured) void writeEmployeeSchedulingLinks(employeeId, { qualifiedTaskIds: taskIds });
        setDb((d) => actions.setTaskQualifications(d, employeeId, taskIds, actorId, now()));
      },
      upsertPosition: (position) => {
        if (isFirebaseConfigured) {
          void writePosition(position).catch((error) => {
            console.error("Failed to persist position to Firestore", error);
          });
        }
        setDb((d) => actions.upsertPosition(d, position, actorId, now()));
      },
      archivePosition: (id) => {
        const position = db.positions.find((p) => p.id === id);
        if (isFirebaseConfigured && position) {
          void writePosition({ ...position, active: false }).catch((error) => {
            console.error("Failed to archive position in Firestore", error);
          });
        }
        setDb((d) => actions.archivePosition(d, id, actorId, now()));
      },
      deletePosition: (id) => {
        if (isFirebaseConfigured) {
          void deletePositionDoc(id).catch((error) => {
            console.error("Failed to delete position in Firestore", error);
          });
        }
        setDb((d) => actions.deletePosition(d, id, actorId, now()));
      },
      upsertTask: (task) => {
        if (isFirebaseConfigured) void writeTask(task);
        setDb((d) => actions.upsertTask(d, task, actorId, now()));
      },
      archiveTask: (id) => {
        const task = db.tasks.find((t) => t.id === id);
        if (isFirebaseConfigured && task) void writeTask({ ...task, active: false });
        setDb((d) => actions.archiveTask(d, id, actorId, now()));
      },
      deleteTask: (id) => {
        if (isFirebaseConfigured) {
          void deleteTaskDoc(id).catch((error) => {
            console.error("Failed to delete task in Firestore", error);
          });
        }
        setDb((d) => actions.deleteTask(d, id, actorId, now()));
      },
      runGeneration: (scheduleId, opts) => {
        if (!canManage(currentUser)) throw new Error("AI scheduler tools are restricted to managers, schedulers, and admins.");
        const res = actions.runGeneration(db, scheduleId, { ...opts, actorId, now: now() });
        setDb(res.db);
        return res.result;
      },
      previewCoverage: (scheduleId) => actions.resolveScheduleCoverage(db, scheduleId),
      analyzeCoverageGaps: (scheduleId) => actions.analyzeScheduleGaps(db, scheduleId, now()),
      publishSchedule: (scheduleId) => {
        if (!canPublishSchedule(currentUser)) throw new Error("Publishing is restricted to managers and admins.");
        const res = actions.publishSchedule(db, scheduleId, actorId, now());
        if (res.published) setDb(res.db);
        return res;
      },
      overrideCompliance: (o) => setDb((d) => actions.overrideCompliance(d, o, now())),
      requestSwap: (input) => {
        const res = actions.requestSwap(db, { ...input, actorId, now: now() });
        setDb(res.db);
        return res;
      },
      requestCoverage: (shiftId) => setDb((d) => actions.requestCoverage(d, shiftId, actorId, now())),
      declineCoverage: (swapId) => setDb((d) => actions.declineCoverage(d, swapId, actorId, now())),
      acceptCoverage: (swapId) => setDb((d) => actions.acceptCoverage(d, swapId, actorId, now())),
      expireStaleCoverage: (clock) =>
        setDb((d) => actions.expireStaleCoverage(d, { ...clock, iso: now() }, actorId)),
      approveUser: (userId) => {
        setDb((d) => {
          const withRole = actions.setUserRoles(d, userId, [{ role: "LIBRARY_STAFF" }], actorId, now());
          return actions.setUserState(withRole, userId, "active", actorId, now());
        });
        if (isFirebaseConfigured) void writeUserApproval(userId);
      },
      setUserState: (userId, state) => {
        setDb((d) => actions.setUserState(d, userId, state, actorId, now()));
        // Persist to Firestore in production; the users subscription reflects it back.
        if (isFirebaseConfigured) void writeUserState(userId, state);
      },
      setUserRoles: (userId, roles) => {
        setDb((d) => actions.setUserRoles(d, userId, roles, actorId, now()));
        if (isFirebaseConfigured) void writeUserRoles(userId, roles);
      },
      compliance: (scheduleId) => actions.computeCompliance(db, scheduleId),
      fairness: (scheduleId) => actions.computeScheduleFairness(db, scheduleId, now()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, sessionUserId, hydrated, viewAs]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
