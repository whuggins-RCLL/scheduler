import type { Department } from "@/domain/types";

/** Canonical RCLL department list — single source for seed and Firestore bootstrap. */
export const DEPARTMENTS: Department[] = [
  { id: "dept-lti", name: "Library Technology and Innovation", active: true },
  { id: "dept-ler", name: "Library Experience and Resources", active: true },
  { id: "dept-ri", name: "Research and Instruction", active: true },
  { id: "dept-admin", name: "Administration", active: true },
];

/** Default department for bootstrap managers and admins. */
export const DEFAULT_MANAGER_DEPARTMENT_ID = "dept-admin";
