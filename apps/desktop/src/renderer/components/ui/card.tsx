import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * Ember surfaces are separated by a lightness step and a hairline, never a drop shadow — and
 * the step does the work, with the hairline as a refinement. The fill is **opaque**: a card
 * that lets the ambient wash through picks up the gradient as irregular blotches inside its
 * own rectangle, and a card sitting on the brightest part of that wash stops reading as a
 * surface at all. See the surface ladder in globals.css for the numbers.
 *
 * `.panel` is the definition; this component is the React front door to it. They used to
 * carry the same three properties spelled out twice and drifted apart by an alpha step.
 *
 * **There are two card rungs and they are the same object.** `Card` and `CardLit` draw the
 * identical 1px ring — a radial gradient centred on the top edge, masked to the border track
 * — and differ in its hue and one step of peak brightness. Do not hand-roll a third: a
 * `before:h-px` line across the top edge is flat (it has no horizontal falloff, so it is a
 * drawn line rather than light catching a bevel), and a literal `bg-[#1C1817]` beside a
 * token-driven sibling puts two cards at one nesting level 4 RGB points apart for no reason a
 * reader can infer. Three such treatments in one column is the defect this ladder replaces.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("panel", className)} {...props} />
  ),
);
Card.displayName = "Card";

/**
 * Card with the warm rim + outer glow. **One per render, and which one is STATEFUL.** The lit
 * surface marks the step the user is on, not a fixed position in the column: a card whose job
 * is done (its input answered, its link resolved) steps back down to `Card` and hands the
 * light to whatever is now active. Two lit panels on screen at once is the same as none.
 */
export const CardLit = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("panel-lit", className)} {...props} />
));
CardLit.displayName = "CardLit";

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 p-5", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold leading-none tracking-tight text-foreground",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

/**
 * The tiny uppercase section label. **Neutral, not amber** — see `.eyebrow` in globals.css
 * for why. If an eyebrow carries a leading icon, that icon is `text-primary-muted`
 * (= `--accent-muted`), never `text-primary` and never a 1.8:1 dark coral smudge.
 */
export const CardEyebrow = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("eyebrow", className)} {...props} />
));
CardEyebrow.displayName = "CardEyebrow";

/**
 * The subject line of a card — a media title, a channel name. The type ramp's missing
 * mid-tier: `CardTitle` is a 16px header for a *section*, this is 21px for the thing the
 * panel is about. Without it a media title set at 15px semibold is typographically identical
 * to the format picker underneath it.
 */
export const CardSubject = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("title-md", className)} {...props} />
));
CardSubject.displayName = "CardSubject";

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";
