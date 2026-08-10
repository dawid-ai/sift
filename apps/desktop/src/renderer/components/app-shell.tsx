import { motion } from "framer-motion";
import {
  Home,
  LayoutGrid,
  Download,
  Tv,
  Settings,
  LogOut,
  Video,
  type LucideIcon,
} from "lucide-react";
import { branding } from "@sift/core";
import { cn } from "@/lib/utils";

export type View = "home" | "library" | "queue" | "channels" | "settings";

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "library", label: "Library", icon: LayoutGrid },
  { view: "queue", label: "Queue", icon: Download },
  { view: "channels", label: "Channels", icon: Tv },
];

const ICON = "h-[17px] w-[17px]";
const SLOT = "relative flex h-9 w-9 items-center justify-center rounded-[9px] transition-colors";

/** Icon rail (dark-studio spec): 52px, coral app mark, hairline right edge, Settings + Exit
 * pinned to the bottom. Icon-only, so each button carries an aria-label — that stays the
 * accessible name the e2e suite's getByRole("button", { name }) selectors match on. */
export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <aside className="flex w-[52px] flex-none flex-col items-center gap-1.5 border-r border-border py-3.5">
      <div
        title={branding.appName}
        className="mb-3 flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-primary"
      >
        <Video aria-hidden className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.25} />
      </div>
      <nav className="flex flex-col items-center gap-1.5">
        {NAV.map(({ view: v, label, icon: Icon }) => {
          const active = v === view;
          return (
            <button
              key={v}
              type="button"
              aria-label={label}
              title={label}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(v)}
              className={cn(
                SLOT,
                active ? "text-foreground" : "text-foreground/40 hover:text-muted-foreground",
              )}
            >
              {/* Chrome stays monochrome — the accent colors are reserved for media/AI. */}
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-[9px] bg-foreground/[0.07]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon aria-hidden className={cn(ICON, "relative")} strokeWidth={1.75} />
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => onNavigate("settings")}
          className={cn(
            SLOT,
            view === "settings"
              ? "bg-foreground/[0.07] text-foreground"
              : "text-foreground/40 hover:text-muted-foreground",
          )}
        >
          <Settings aria-hidden className={ICON} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Exit"
          title="Exit"
          onClick={() => void window.sift.app.quit()}
          data-testid="app-exit"
          className={cn(SLOT, "text-foreground/40 hover:text-muted-foreground")}
        >
          <LogOut aria-hidden className={ICON} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
