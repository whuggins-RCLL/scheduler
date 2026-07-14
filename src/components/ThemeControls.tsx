"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

export function ThemeControls() {
  const [theme, setTheme] = useState<Theme>("system");
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-transparency", String(reduceTransparency));
  }, [reduceTransparency]);

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
        title="Reduce transparency"
      >
        {reduceTransparency ? "Solid ✓" : "Reduce transparency"}
      </button>
    </div>
  );
}
