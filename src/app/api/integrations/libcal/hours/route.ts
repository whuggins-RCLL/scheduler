import { NextResponse } from "next/server";
import { LibCalHoursProvider } from "@/lib/integrations/libcal-hours";

export async function GET() {
  try {
    const result = await new LibCalHoursProvider().getHours();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown LibCal synchronization error.";

    return NextResponse.json(
      {
        source: "libcal",
        retrievedAt: new Date().toISOString(),
        intervals: [],
        warnings: [message],
      },
      { status: 502 },
    );
  }
}
