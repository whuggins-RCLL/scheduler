import { calendarProviderStatus } from "@/lib/integrations/calendar";
import { getCalendarTokenStore } from "@/lib/integrations/calendar-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Honest, non-secret readiness of the personal calendar integration, so the
 * admin and settings screens can show real state instead of a guess.
 */
export async function GET() {
  const oauth = calendarProviderStatus();
  const backendConfigured = getCalendarTokenStore() !== null;
  const missing = [...oauth.missing];
  if (!backendConfigured) missing.push("Firebase Admin credentials");
  return Response.json({
    oauthConfigured: oauth.configured,
    backendConfigured,
    ready: oauth.configured && backendConfigured,
    missing,
  });
}
