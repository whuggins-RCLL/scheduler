/**
 * Working product name — configurable in one place so it can be renamed later
 * without touching individual components.
 */
export const PRODUCT_NAME = "RCLL Scheduler" as const;
/** Short mark shown in the brand badge (kept in sync with PRODUCT_NAME). */
export const PRODUCT_MARK = "RS" as const;
export const PRODUCT_TAGLINE = "Robert Crown Law Library workforce scheduling." as const;
export const APPROVED_EMAIL_DOMAINS = ["stanford.edu", "law.stanford.edu"] as const;
export const ORGANIZATION_ID = "rcll" as const;

/** Whether AI-assisted features (note interpretation, explanations) are enabled. */
export const AI_FEATURES_ENABLED = true;

/**
 * Desk coverage must extend past the library's staffed closing time. Per
 * operations: whatever LibCal lists as staffed library hours, the service
 * desk stays staffed this many additional minutes (e.g. LibCal close 3:00pm
 * → desk staffed until 5:00pm).
 */
export const DESK_COVERAGE_BUFFER_MINUTES = 120;

/**
 * Public Google Calendar embed for the library operations calendar (safe to
 * expose — it is the shareable embed URL, not the secret feed). The secret
 * iCal address is read server-side from GOOGLE_CALENDAR_ICAL_URL and is never
 * committed.
 */
export const GOOGLE_CALENDAR_EMBED_SRC =
  "https://calendar.google.com/calendar/embed?src=law.stanford.edu_uebptk4kikenndgjq8lfdpbvjo%40group.calendar.google.com&ctz=America%2FLos_Angeles";

/**
 * Stanford time-keeping system (Oracle Identity Cloud sign-in). Surfaced on the
 * dashboard so staff can jump straight to clocking in/out.
 */
export const TIMEKEEPING_URL =
  "https://idcs-03e6b91957d24ff4b4e573973a0ad407.identity.oraclecloud.com/ui/v1/signin";
export const BOOTSTRAP_ADMINS = [
  { name: "Will Huggins", email: "whuggins@law.stanford.edu" },
  { name: "Kay Cadena", email: "cadena@law.stanford.edu" },
  { name: "Brenda Alfaro-Campos", email: "blalfaro@law.stanford.edu" },
  { name: "George Wilson", email: "gwilson@law.stanford.edu" },
  { name: "Beth Williams", email: "bwilli@law.stanford.edu" },
].map((admin) => ({ ...admin, email: admin.email.toLowerCase() }));
