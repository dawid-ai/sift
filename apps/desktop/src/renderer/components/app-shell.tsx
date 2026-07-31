import { motion } from "framer-motion";
import { Home, Library, ListVideo, Tv, Settings, LogOut, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type View = "home" | "library" | "queue" | "channels" | "settings";

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "library", label: "Library", icon: Library },
  { view: "queue", label: "Queue", icon: ListVideo },
  { view: "channels", label: "Channels", icon: Tv },
  { view: "settings", label: "Settings", icon: Settings },
];

/** Launcher-style left rail: wordmark, labeled nav with an animated active indicator,
 * Exit pinned to the bottom. Nav items are native <button>s whose accessible name is the
 * label, so the e2e suite's getByRole("button", { name }) selectors keep working. */
export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <aside className="flex w-52 flex-none flex-col border-r border-border bg-surface p-3">
      <div className="px-2 py-3 text-lg font-bold tracking-tight text-foreground">Sift</div>
      <nav className="mt-2 flex flex-col gap-1">
        {NAV.map(({ view: v, label, icon: Icon }) => {
          const active = v === view;
          return (
            <button
              key={v}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(v)}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-md bg-primary/15 shadow-glow"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon aria-hidden className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => void window.sift.app.quit()}
        data-testid="app-exit"
        className="mt-auto flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <LogOut aria-hidden className="h-4 w-4" />
        Exit
      </button>
    </aside>
  );
}
