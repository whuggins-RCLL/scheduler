"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AvailabilityPattern,
  ComplianceOverride,
  DailyNote,
  LeaveRecord,
  Position,
  Shift,
  Task,
  UserAccount,
} from "@/domain/types";
import type { GenerationMode, GenerationResult, ScheduleWeights } from "@/domain";
import { canManage, canPublishSchedule, isAdmin } from "@/domain/scope";
import * as actions from "./actions";
import { buildSeed } from "./seed";
import type { Database } from "./types";

const SESSION_KEY = "rcll.session.userId";

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
  saveAvailability: (pattern: AvailabilityPattern) => void;
  submitLeave: (record: LeaveRecord) => void;
  cancelLeave: (id: string) => void;
  upsertDailyNote: (note: DailyNote) => void;
  setDailyNotePublished: (id: string, published: boolean) => void;
  deleteDailyNote: (id: string) => void;
  loadSampleData: () => void;
  upsertShift: (shift: Shift) => void;
  cancelShift: (id: string) => void;
  toggleLock: (id: string) => void;
  upsertPosition: (position: Position) => void;
  archivePosition: (id: string) => void;
  upsertTask: (task: Task) => void;
  archiveTask: (id: string) => void;
  runGeneration: (scheduleId: string, opts: { seed: number; weights?: ScheduleWeights; mode?: GenerationMode }) => GenerationResult;
  publishSchedule: (scheduleId: string) => actions.PublishResult;
  overrideCompliance: (o: Omit<ComplianceOverride, "id" | "createdAt">) => void;
  requestSwap: (input: { shiftId: string; toEmployeeId: string; reason?: string }) => actions.SwapOutcome;
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
      roles: [{ role: "EMPLOYEE" }],
      createdAt: account?.createdAt ?? now,
      updatedAt: account?.updatedAt ?? now,
    };
  }
  return {
    id: `view-${mode}`,
    email: `${mode}@example.stanford.edu`,
    displayName: wantStudent ? "Sample student" : "Sample staff",
    state: "active",
    roles: [{ role: "EMPLOYEE" }],
    createdAt: now,
    updatedAt: now,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => buildSeed());
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [viewAs, setViewAs] = useState<ViewAs>("self");

  // Restore session from localStorage after mount (avoids SSR/hydration drift).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SESSION_KEY);
      if (stored && db.users.some((u) => u.id === stored)) setSessionUserId(stored);
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setSessionUserId(null);
      },
      now,
      saveAvailability: (pattern) => setDb((d) => actions.saveAvailability(d, pattern, actorId, now())),
      submitLeave: (record) => setDb((d) => actions.submitLeave(d, record, actorId, now())),
      cancelLeave: (id) => setDb((d) => actions.cancelLeave(d, id, actorId, now())),
      upsertDailyNote: (note) => setDb((d) => actions.upsertDailyNote(d, note, actorId, now())),
      setDailyNotePublished: (id, published) => setDb((d) => actions.setDailyNotePublished(d, id, published, actorId, now())),
      deleteDailyNote: (id) => setDb((d) => actions.deleteDailyNote(d, id, actorId, now())),
      loadSampleData: () => setDb((d) => actions.loadSampleData(d, actorId, now())),
      upsertShift: (shift) => setDb((d) => actions.upsertShift(d, shift, actorId, now())),
      cancelShift: (id) => setDb((d) => actions.cancelShift(d, id, actorId, now())),
      toggleLock: (id) => setDb((d) => actions.toggleLock(d, id, actorId, now())),
      upsertPosition: (position) => setDb((d) => actions.upsertPosition(d, position, actorId, now())),
      archivePosition: (id) => setDb((d) => actions.archivePosition(d, id, actorId, now())),
      upsertTask: (task) => setDb((d) => actions.upsertTask(d, task, actorId, now())),
      archiveTask: (id) => setDb((d) => actions.archiveTask(d, id, actorId, now())),
      runGeneration: (scheduleId, opts) => {
        if (!canManage(currentUser)) throw new Error("AI scheduler tools are restricted to managers, schedulers, and admins.");
        const res = actions.runGeneration(db, scheduleId, { ...opts, actorId, now: now() });
        setDb(res.db);
        return res.result;
      },
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
      setUserState: (userId, state) => setDb((d) => actions.setUserState(d, userId, state, actorId, now())),
      setUserRoles: (userId, roles) => setDb((d) => actions.setUserRoles(d, userId, roles, actorId, now())),
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
