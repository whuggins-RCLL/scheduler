export const PRODUCT_NAME = "Cardinal Shift" as const;
export const APPROVED_EMAIL_DOMAINS = ["stanford.edu", "law.stanford.edu"] as const;
export const ORGANIZATION_ID = "stanford-law-library" as const;
export const BOOTSTRAP_ADMINS = [
  { name: "Will Huggins", email: "whuggins@law.stanford.edu" },
  { name: "Kay Cadena", email: "cadena@law.stanford.edu" },
  { name: "Brenda Alfaro-Campos", email: "blalfaro@law.stanford.edu" },
  { name: "George Wilson", email: "gwilson@law.stanford.edu" },
  { name: "Beth Williams", email: "bwilli@law.stanford.edu" },
].map((admin) => ({ ...admin, email: admin.email.toLowerCase() }));
