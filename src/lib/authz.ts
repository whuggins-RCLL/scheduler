import { APPROVED_EMAIL_DOMAINS, BOOTSTRAP_ADMINS } from "./config";
export type Role = "SUPER_ADMIN"|"MANAGER"|"SCHEDULER"|"EMPLOYEE"|"VIEWER"|"AUDITOR";
export type AccountState = "invited"|"pending_approval"|"active"|"temporarily_inactive"|"archived"|"access_revoked";
export function normalizeEmail(email: string){return email.trim().toLowerCase();}
export function isApprovedDomain(email: string){const e=normalizeEmail(email); return APPROVED_EMAIL_DOMAINS.some(d=>e.endsWith(`@${d}`));}
export function isBootstrapAdmin(email: string){const e=normalizeEmail(email); return BOOTSTRAP_ADMINS.some(a=>a.email===e);}
export function canAccessApp(input:{email:string; state?:AccountState; invitationValid?:boolean}){if(!isApprovedDomain(input.email)) return false; if(isBootstrapAdmin(input.email)) return true; return input.state==="active" || input.invitationValid===true;}
export function hasAnyRole(userRoles: Role[], allowed: Role[]){return userRoles.some(r=>allowed.includes(r));}
