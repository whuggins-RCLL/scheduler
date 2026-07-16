"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getTimeFormat } from "@/lib/time-format";

/** Restores time-format preference on load and re-renders children when it changes. */
export function TimeFormatSync({ children }: { children: ReactNode }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-time-format", getTimeFormat());
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener("rcll:timeformat", onChange);
    return () => window.removeEventListener("rcll:timeformat", onChange);
  }, []);

  return <>{children}</>;
}
