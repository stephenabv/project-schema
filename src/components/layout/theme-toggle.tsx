"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/button";
import { isTheme, oppositeTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme/theme";

/** Re-renders whenever <html data-theme> changes (this toggle, another tab's script, or the OS). */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function currentTheme(): Theme | null {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : null;
}

/** The server cannot know the theme; the icon appears after hydration without shifting layout. */
const serverTheme = (): Theme | null => null;

/** Header button that switches between light and dark mode and remembers the choice. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);
  const next = theme ? oppositeTheme(theme) : "dark";
  const label = `Switch to ${next} mode`;

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode): the choice lasts for this page only.
    }
  };

  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={buttonClass("ghost", className, "icon")}>
      {theme === "dark" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  );
}
