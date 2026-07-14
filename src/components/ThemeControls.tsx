"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const THEME_KEY = "rcll.pref.theme";
const TRANSPARENCY_KEY = "rcll.pref.reduceTransparency";

export function ThemeControls() {
  const [theme, setTheme] = useState<Theme>("system");
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Restore saved preferences after mount (avoids SSR/hydration drift).
  useEffect(() => {
    try {
      const t = window.localStorage.getItem(THEME_KEY) as Theme | null;
      if (t === "system" || t === "light" || t === "dark") setTheme(t);
      setReduceTransparency(window.localStorage.getItem(TRANSPARENCY_KEY) === "true");
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    if (loaded) {
      try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    }
  }, [theme, loaded]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-transparency", String(reduceTransparency));
    if (loaded) {
      try { window.localStorage.setItem(TRANSPARENCY_KEY, String(reduceTransparency)); } catch { /* ignore */ }
    }
  }, [reduceTransparency, loaded]);

  const cycle = () => setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));

  return (
    <div className="row" style={{ gap: "0.4rem" }}>
      <button
        type="button"
        className="button sm ghost"
        onClick={cycle}
        aria-label={`Theme: ${theme}. Activate to change.`}
        title={`Theme: ${theme}`}
      >
        {theme === "system" ? "◐ System" : theme === "light" ? "☀ Light" : "☾ Dark"}
      </button>
      <button
        type="button"
        className="button sm ghost"
        aria-pressed={reduceTransparency}
        onClick={() => setReduceTransparency((v) => !v)}
        title="Reduce transparency and glass effects"
      >
        {reduceTransparency ? "Solid ✓" : "Reduce transparency"}
      </button>
    </div>
  );
}
