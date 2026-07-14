"use client";

import { StoreProvider } from "@/lib/store/StoreProvider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
