import { APPROVED_EMAIL_DOMAINS, BOOTSTRAP_ADMINS, canonicalizeStanfordEmail } from "./config";
export type Role = "SUPER_ADMIN"|"MANAGER"|"SCHEDULER"|"LIBRARY_STAFF"|"VIEWER"|"AUDITOR";
export type AccountState = "invited"|"pending_approval"|"active"|"temporarily_inactive"|"archived"|"access_revoked";
export function normalizeEmail(email: string){return email.trim().toLowerCase();}
/** The one canonical identity for an email (folds @law.stanford.edu → @stanford.edu). */
export function canonicalEmail(email: string){return canonicalizeStanfordEmail(email);}
/**
 * The account id a person's email maps to. This is the key for their `users` and
 * `employeeProfiles` documents and the `employeeId` on all their records, so both
 * of their Stanford logins resolve to a single shared account. Must stay in sync
 * with `emailAccountId()` in firestore.rules.
 */
export function accountIdForEmail(email: string){return canonicalEmail(email);}
export function isApprovedDomain(email: string){const e=normalizeEmail(email); return APPROVED_EMAIL_DOMAINS.some(d=>e.endsWith(`@${d}`));}
export function isBootstrapAdmin(email: string){const e=canonicalEmail(email); return BOOTSTRAP_ADMINS.some(a=>a.email===e);}
export function canAccessApp(input:{email:string; state?:AccountState; invitationValid?:boolean}){if(!isApprovedDomain(input.email)) return false; if(isBootstrapAdmin(input.email)) return true; return input.state==="active" || input.invitationValid===true;}
export function hasAnyRole(userRoles: Role[], allowed: Role[]){return userRoles.some(r=>allowed.includes(r));}
