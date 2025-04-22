import { useCallback } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ModeToggle() {
  // Grab the current theme and setter from context
  const { theme, setTheme } = useTheme();

  /**
   * Handles a click on the toggle button.
   *
   *   • If theme === "light"  ⟶ switch to "dark"
   *   • If theme === "dark"   ⟶ switch to "light"
   *   • If theme === "system" ⟶ detect the system preference first,
   *                             then switch to the opposite of that
   *                             (so the user always perceives a change)
   */
  const handleToggle = useCallback(() => {
    let nextTheme: "light" | "dark";

    if (theme === "system") {
      // Determine current OS preference
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      // Flip it
      nextTheme = systemPrefersDark ? "light" : "dark";
    } else {
      // Invert current manual choice
      nextTheme = theme === "light" ? "dark" : "light";
    }

    setTheme(nextTheme);
  }, [theme, setTheme]);

  return (
    <Button
      variant="outline"
      size="icon"
      className="!bg-white dark:!bg-transparent"
      onClick={handleToggle}
    >
      {/* Sun icon → visible in light mode, fades out in dark */}
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />

      {/* Moon icon → hidden in light mode, fades in for dark */}
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />

      {/* Screen‑reader label */}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}