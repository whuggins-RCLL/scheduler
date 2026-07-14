"use client";

import { GOOGLE_CALENDAR_EMBED_SRC, PRODUCT_NAME } from "@/lib/config";

export function CalendarEmbed() {
  return (
    <div style={{ maxWidth: "100%", overflow: "auto" }}>
      <iframe
        src={GOOGLE_CALENDAR_EMBED_SRC}
        title={`${PRODUCT_NAME} library calendar`}
        style={{ border: 0, width: "100%", height: 600, borderRadius: 12 }}
        loading="lazy"
      />
    </div>
  );
}
