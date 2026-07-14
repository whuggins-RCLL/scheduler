import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/config";
export const metadata: Metadata = { title: PRODUCT_NAME, description: "AI-assisted library workforce scheduling." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip" href="#main">Skip to main content</a>{children}</body></html>}
