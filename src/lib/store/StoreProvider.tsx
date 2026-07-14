"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  AvailabilityPattern,
  ComplianceOverride,
  LeaveRecord,
  Shift,
  UserAccount,
} from "@/domain/types";
import type { GenerationMode, GenerationResult, ScheduleWeights } from "@/domain";
import * as actions from "./actions";
import { buildSeed } from "./seed";
import type { Database } from "./types";

/**
 * Client-side store. In local/dev mode the whole tenant runs against an
 * in-memory {@link Database} seeded with fictional data, so every workflow
 * (availability, leave, generation, publish, swaps, admin) functions
 * end-to-end without live Firebase credentials. The same pure action
 * functions can be executed server-side against Firestore in production —
 * see docs/architecture.md for the adapter boundary.
 */
export interface StoreContextValue {
  db: Database;
  currentUser: UserAccount;
  setCurrentUserId: (id: string) => void;
  now: () => string;
  saveAvailability: (pattern: AvailabilityPattern) => void;
  submitLeave: (record: LeaveRecord) => void;
  decideLeave: (id: string, status: "approved" | "denied" | "cancelled", reason?: string) => void;
  upsertShift: (shift: Shift) => void;
  cancelShift: (id: string) => void;
  toggleLock: (id: string) => void;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database>(() => buildSeed());
  const [currentUserId, setCurrentUserId] = useState<string>("admin-whuggins");

  const now = () => new Date().toISOString();
  const actorId = currentUserId;

  const value = useMemo<StoreContextValue>(() => {
    const currentUser =
      db.users.find((u) => u.id === currentUserId) ?? db.users[0];
    return {
      db,
      currentUser,
      setCurrentUserId,
      now,
      saveAvailability: (pattern) => setDb((d) => actions.saveAvailability(d, pattern, actorId, now())),
      submitLeave: (record) => setDb((d) => actions.submitLeave(d, record, actorId, now())),
      decideLeave: (id, status, reason) => setDb((d) => actions.decideLeave(d, id, status, actorId, now(), reason)),
      upsertShift: (shift) => setDb((d) => actions.upsertShift(d, shift, actorId, now())),
      cancelShift: (id) => setDb((d) => actions.cancelShift(d, id, actorId, now())),
      toggleLock: (id) => setDb((d) => actions.toggleLock(d, id, actorId, now())),
      runGeneration: (scheduleId, opts) => {
        const res = actions.runGeneration(db, scheduleId, { ...opts, actorId, now: now() });
        setDb(res.db);
        return res.result;
      },
      publishSchedule: (scheduleId) => {
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
  }, [db, currentUserId]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
