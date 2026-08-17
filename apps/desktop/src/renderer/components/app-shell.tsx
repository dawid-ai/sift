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
const SLOT = [
  "group relative flex h-9 w-9 items-center justify-center rounded-[11px]",
  "transition-colors duration-150 ease-out",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");

const IDLE = "text-fg-subtle hover:bg-foreground/[0.06] hover:text-foreground";

/** The active slot's fill. Rendered inside the nav map behind a shared `layoutId` so the
 * spring slides it between items; the settings slot reuses the same look statically.
 *
 * Saturated `primary` is spent on exactly two things app-wide — this and the primary CTA —
 * and on the rail it is spent on exactly one: the current route. It is also the *whole*
 * marker: the 2px coral bar that used to sit alongside it is gone. That bar was positioned at
 * -7px against a slot inset 8px from the frame, which put it 1px from the window edge — it
 * read as a rendering seam rather than an affordance, and it was redundant with the filled
 * tile it decorated. */
const ACTIVE_FILL =
  "rounded-[11px] border border-primary/30 bg-primary/14 shadow-bevel";

/** Icon rail (Ember spec): 52px, corner-bracketed app mark, a rim-lit hairline separating it
 * from the canvas, Settings + Exit pinned to the bottom. Icon-only, so each button carries an
 * aria-label — that stays the accessible name the e2e suite's getByRole("button", { name })
 * selectors match on, and removing one would break roughly thirty specs. */
export function Sidebar({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (v: View) => void;
}) {
  return (
    <aside
      className={cn(
        "relative flex w-[52px] flex-none flex-col items-center gap-1.5 py-3.5",
        // Opaque, and its own token. The rail carries the app's one persistent coral element
        // (the active tile), and the ambient wash used to peak directly behind it — so the
        // accent was fighting its own backdrop, and the rail's ground changed as the gradient
        // moved. Flat ground, independent of the canvas. Token-driven, not a baked hsl(): the
        // rail once carried a hardcoded copy of --surface and silently fell out of step when
        // the ladder moved.
        "bg-rail",
      )}
    >
      {/* The separator is a gradient hairline, not a border: brightest at the top where the
          key light falls, dissolving toward the floor, so it reads as an edge rather than a
          table rule. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-foreground/[0.16] via-border to-transparent"
      />

      {/* The app mark. Four things were wrong here; (3) is documented on the box it applies to.
          (1) The bracket ornament is drawn on a NEGATIVE inset — it deliberately sits outside
          the box it decorates — and the box was flush enough to the frame that the upper-left
          bracket was clipped by the window edge on every screen of the app. The mark now lives
          in a 36px cell with the ornament on a 24px inner box, so the full ⌐ (stroke included)
          sits ~11px in from the rail's left edge and ~21px down from the top: inside its own
          box, at any zoom.
          (2) It was a 28px rounded square with a coral border and a coral fill — i.e. the
          exact treatment the active nav item wears, four points of lightness apart. The
          identity mark and the selected route are not the same object, so the container is
          gone: the mark is a glyph plus its bracket motif, and the filled tile now means
          "active" and only that.
          (4) …and dropping the container was only half of that. Glyph and brackets were still
          painting full-strength `--primary`, the same (255,106,61) the active tile paints
          130px below on a rail with four unlabelled destinations — so the one static element
          on the rail wore the ink that means "you are here", and the active state had to
          carry the whole distinction on its tile alone. Both halves of the mark are
          `--accent-muted` now (#CF764A, 5.6:1 on `--rail`): still the brand's warmth, a
          clearly different ink, and `--primary` on this rail now marks exactly one thing.
          `--mark-color` is what carries that to the ::before/::after brackets, which have no
          `currentColor` of their own — see `.corner-mark` in globals.css. */}
      <div
        title={branding.appName}
        className="mb-3.5 mt-0.5 grid h-9 w-9 flex-none place-items-center"
      >
        {/* (3) The marked box is sized to the GLYPH's optical bounds, not to a nominal
            square. `Video` is a wide rounded rect with a play triangle — visibly broader
            than it is tall — so a 24px square around it left the top-left bracket floating
            ~7px clear while the bottom-right one nearly touched the artwork. Read at the
            rail's scale that is three unrelated marks, not two brackets clipping one
            identity mark. 25×21 with a tighter inset puts both brackets the same distance
            off the glyph. The 36px cell still leaves 5.5px/7.5px of clear space around the
            box, which is more than the |inset| + thickness the ornament needs. */}
        <span className="corner-mark grid h-[21px] w-[25px] place-items-center [--mark-color:hsl(var(--accent-muted))] [--mark-inset:-2px] [--mark-size:6px]">
          <Video
            aria-hidden
            className="h-[17px] w-[17px] text-accent-muted"
            strokeWidth={2.25}
          />
        </span>
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
              className={cn(SLOT, active ? "text-primary" : IDLE)}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  aria-hidden
                  className={cn("absolute inset-0", ACTIVE_FILL)}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                aria-hidden
                className={cn(ICON, "relative")}
                strokeWidth={1.85}
              />
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
            view === "settings" ? cn(ACTIVE_FILL, "text-primary") : IDLE,
          )}
        >
          <Settings
            aria-hidden
            className={cn(ICON, "relative")}
            strokeWidth={1.85}
          />
        </button>
        <button
          type="button"
          aria-label="Exit"
          title="Exit"
          onClick={() => void window.sift.app.quit()}
          data-testid="app-exit"
          className={cn(
            SLOT,
            "text-fg-subtle hover:bg-danger/12 hover:text-danger",
          )}
        >
          <LogOut aria-hidden className={ICON} strokeWidth={1.85} />
        </button>
      </div>
    </aside>
  );
}
