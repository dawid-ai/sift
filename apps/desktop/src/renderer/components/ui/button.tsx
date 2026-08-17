import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-xl",
    "text-sm font-medium leading-none",
    // Colour-only transitions. box-shadow/filter are swapped, never tweened — animating
    // either forces a full-surface repaint (see the perf note in globals.css).
    "transition-colors duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // No `pointer-events-none` here: Playwright's hit-target check needs a real target.
    //
    // A dead control has ONE appearance, spelled out in tokens. It used to be a blanket
    // `opacity-45`, which is a multiplier, not a colour: stacked on `outline`/`secondary`/
    // `ghost`/`ai`/`danger`, whose labels are already `--muted-foreground` (#A19B97), it
    // produced an undocumented grey around 2.3:1 — dimmer than `--fg-disabled`, the token
    // this palette reasoned out at 2.1:1 for exactly this job — and a different grey per
    // variant. Now every disabled button lands on the same fill, the same hairline and the
    // same ink, whichever variant it started from.
    //
    // `bg-none` is load-bearing: the primary variant's fill is a `background-image` gradient,
    // and a `background-color` alone would sit *under* it, so a disabled primary CTA would
    // still look live. `disabled:` sorts after `hover:` in Tailwind's variant order, so the
    // hover skins are neutralised too; they are repeated explicitly because a disabled button
    // still matches `:hover` in Chromium.
    "disabled:cursor-not-allowed disabled:bg-none disabled:border-border",
    "disabled:bg-surface-2/40 disabled:text-fg-disabled disabled:shadow-none",
    "disabled:hover:border-border disabled:hover:bg-surface-2/40",
    "disabled:hover:text-fg-disabled disabled:hover:shadow-none",
    // No size here on purpose: a descendant selector would out-specify an `h-3.5` a call
    // site put on its own glyph, silently resizing icons that were deliberately tuned.
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Primary CTA: warm gradient, dark ink, top-edge highlight, warm glow on hover.
        // **This gradient is the only fill a primary button may have.** Two routes had grown
        // their own — one gradient at 40px/r10, one flat coral at 44px/r8 — so the same role
        // rendered two ways on two screens of one app. There is one declaration now; a route
        // that wants a primary button uses <Button>, not a local class string.
        default: [
          "bg-gradient-to-br from-primary to-primary-lit text-primary-foreground font-semibold",
          "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22)]",
          "hover:from-[#FF7B4F] hover:to-[#FF9A5E]",
          "hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.28),0_0_22px_-6px_hsl(var(--primary)/0.6)]",
        ].join(" "),
        // Secondary. `outline` is the historical name and stays — every call site uses it.
        // The bevel is what stops a translucent surface-2 fill reading as a flat grey box.
        // This bordered shell is reserved for *controls*; static labels use `Tag` from
        // ui/badge, so a row of labels can never masquerade as a row of buttons.
        outline:
          "border border-border bg-surface-2/80 text-muted-foreground shadow-bevel hover:border-border-strong hover:bg-surface-2 hover:text-foreground",
        secondary:
          "border border-border bg-surface-2/80 text-muted-foreground shadow-bevel hover:border-border-strong hover:bg-surface-2 hover:text-foreground",
        ghost:
          "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        // A low-key *selected* state: an active page number, a chosen segment. Deliberately
        // not the coral fill — the strongest colour on a screen must not be spent on a
        // paginator, which is what made "page 1" louder than every real action around it.
        selected:
          "border border-foreground/[0.12] bg-foreground/[0.08] text-foreground shadow-bevel",
        // AI actions only — summarize / whisper. Never chrome.
        ai: "border border-ai/30 bg-ai/14 text-ai shadow-bevel hover:border-ai/45 hover:bg-ai/20",
        // Destructive, filled: a committed destructive action (a confirm step, a delete CTA).
        danger:
          "border border-danger/30 bg-danger/14 text-danger shadow-bevel hover:border-danger/45 hover:bg-danger/20",
        // Destructive, inline: a "Remove" sitting in a row or a toolbar, and every icon-only
        // delete. **Use one of these two for every destructive control.** Three different
        // signals for "this destroys something" (red text here, grey text there, a grey trash
        // glyph in the header) taught the user nothing.
        //
        // Neutral at rest, red the moment you reach for it. Red-at-rest put a second warm
        // accent on every row that has one: on the settings surface a coral "Open sign-in
        // browser" and a red "Remove" sat 700px apart, and at a 13px label size the hue gap
        // alone did not separate the one irreversible action from the one encouraged action.
        // Pushing `--danger` to 348 widened that gap; this closes it, because a control the
        // user has not reached for does not need to be shouting. Committing on hover/focus
        // keeps coral the only warm thing on a *resting* screen and still makes the
        // destructive reading unmistakable at the instant it matters. Same pattern as the tag
        // chip's ✕ and the rail's Exit — one rule for every quiet destructive in the app.
        // The filled `danger` variant above stays red at rest: that one is the committed
        // step ("Confirm remove"), where the colour IS the warning.
        "danger-ghost": [
          "text-foreground/70",
          "hover:bg-danger/12 hover:text-danger",
          "focus-visible:text-danger focus-visible:ring-danger/60",
        ].join(" "),
      },
      size: {
        // One control height. `md` is the name to reach for in new code; `default` is the
        // same box under its historical name so no call site had to change.
        default: "h-11 px-4",
        md: "h-11 px-4",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-11 px-5",
        // Icon-only. The aria-label is what makes it accessible — always pass one.
        icon: "h-9 w-9 p-0",
        "icon-sm": "h-8 w-8 p-0",
        // Icon-only at full control height, for sitting beside a `default`/`md` button.
        "icon-md": "h-11 w-11 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Leading glyph, rendered before the label. Presentational only — it exists so a button
   * with an icon is the *same component* as one without, rather than an ad-hoc child that
   * drifts in size from route to route. Pass an already-`aria-hidden` icon; the button's
   * accessible name still comes from its text (or its `aria-label`), which is what the e2e
   * suite's `getByRole("button", { name })` selectors match on.
   */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, icon, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {icon}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
