import { useEffect, useMemo, useState } from "react";
import { Check, Info, Search } from "lucide-react";
import { listTestedPlatforms } from "@sift/core";
import { Input } from "@/components/ui/input";
import {
  CountTag,
  FIELD,
  GroupLabel,
  NESTED_SURFACE,
  SettingsHint,
} from "./settings-page";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_EXTRACTORS = 300;

const TESTED_PLATFORMS = listTestedPlatforms();

/** The single chip vocabulary for a platform name — ONE geometry, ONE typographic weight,
 * and ONE place a name can appear.
 *
 * This card used to print two clouds: the ten tested platforms, then the full extractor list
 * below — which is a superset of them. YouTube, Vimeo and TikTok therefore rendered twice,
 * byte-identical (89/76/77px in both), so nothing on screen said which cloud was which and
 * the reader had to parse two paragraphs of prose to find out. The upper cloud also carried
 * no label of its own, leaving ten of the loudest objects in the card belonging to no named
 * group. There is now one cloud, under one label, and tested-ness travels on the chip. */
const CHIP = [
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
  "text-[12px] leading-4 transition-colors duration-150 ease-out",
].join(" ");

/** …and ONE state axis on top of it: tested is a hairline plus a warm check glyph, NOT a
 * tinted fill.
 *
 * The filled chip measured 8.73:1 against the card — brighter than every subtitle and body
 * line on the page — so a static list of platform names became the second-loudest element on
 * the surface, and fourteen of them spent the accent before the eye reached the one primary
 * button (600px below the fold). Coral fills are left to the things that are data or that are
 * actually interactive: CountTag, the active nav pill, the primary Button. The glyph keeps
 * the meaning off hue alone. */
const CHIP_TESTED = [
  "border-primary/30 bg-transparent text-foreground/85",
  "hover:border-primary/45 hover:text-foreground",
].join(" ");
const CHIP_PLAIN = [
  "border-white/[0.09] bg-white/[0.05] text-foreground/75",
  "hover:border-white/[0.16] hover:text-foreground",
].join(" ");

/** The one coral object in a chip. `--accent-muted` — the same token the card eyebrow glyphs
 * use — so "tested" is announced by a mark rather than by a wash, in the one hue the palette
 * designates for a decorative-but-legible glyph. */
const CHIP_TESTED_GLYPH = "text-accent-muted";

/** yt-dlp reports extractor ids in its own casing ("Youtube"), which contradicted every other
 * printing of the name on this page ("YouTube"). Route every name through the tested-platform
 * labels so a platform is spelled exactly one way. */
const CANONICAL = new Map(
  TESTED_PLATFORMS.map((p) => [
    p.label.toLowerCase().replace(/[^a-z0-9]/g, ""),
    p.label,
  ]),
);
const normalise = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, "");
const displayName = (raw: string) => CANONICAL.get(normalise(raw)) ?? raw;
/** Presentation only — decides which of the two chip states a name wears. */
const isTested = (raw: string) => CANONICAL.has(normalise(raw));

export function PlatformsSection() {
  const [extractors, setExtractors] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.sift.metadata
      .listExtractors()
      .then((list) => {
        if (cancelled) return;
        setExtractors(list);
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          "Install yt-dlp in Settings → Binaries to list all supported platforms.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!extractors) return [];
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? extractors.filter((name) => name.toLowerCase().includes(needle))
      : extractors;
    /* Display order only — the same names, the same count, nothing filtered out. yt-dlp
       reports its extractors alphabetically and there are ~1800 of them, so with one cloud
       instead of two the ten names this card is actually about ("YouTube", "Vimeo", …) fell
       past MAX_VISIBLE_EXTRACTORS and off the screen. Tested names lead the cloud; `sort` is
       stable, so everything else keeps yt-dlp's own order. */
    return [...matches].sort(
      (a, b) => Number(isTested(b)) - Number(isTested(a)),
    );
  }, [extractors, query]);

  const visible = filtered.slice(0, MAX_VISIBLE_EXTRACTORS);
  const overflowCount = filtered.length - visible.length;

  /* ONE group: the label, the search, the one cloud. The separate tested cloud that used to
     sit above this behind its own full-bleed rule is gone — it was a headless band whose
     contents are a subset of this list, and its rule went with it (the section card already
     opens `children` with a full-bleed hairline, so a second one 20px below read as a double
     border drawn around an unnamed strip). */
  return (
    <div data-testid="platforms-section">
      <GroupLabel>All supported</GroupLabel>

      {error ? (
        <p
          className="mt-3 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/12 px-3 py-2 text-xs leading-relaxed text-warning"
          data-testid="platforms-error"
        >
          <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        <>
          <div className="relative mt-3">
            {/* The field's only naming is its placeholder and this glyph, so neither may sit
                at the dimmest available alpha. /45 is visible without competing with typed
                text. */}
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45"
            />
            <Input
              placeholder="Search platforms…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={extractors === null}
              data-testid="platforms-search"
              className={cn(FIELD, "pl-10")}
            />
          </div>

          <div className={cn(NESTED_SURFACE, "mt-3 p-4")}>
            {/* Block header + CountTag — the exact structure the Saved sessions block uses,
                so it uses the same primitive. It was a MicroLabel (11px/medium/55%) against
                that one's GroupLabel (12px/semibold/70%), two visible sizes for one role. */}
            <div className="flex items-center">
              <GroupLabel>Extractors</GroupLabel>
              <CountTag data-testid="platforms-count">
                {extractors === null ? "…" : filtered.length}
              </CountTag>
            </div>

            {/* The only cloud on the card: one geometry, one casing, one wrap. Tested-ness is
                a hairline + a check on the chip itself, so it reads as a property of the
                platform rather than of a list it happened to be duplicated into. The
                `tested-platform` hook stays on the chips that still play that role. */}
            <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
              {visible.map((name) => {
                const tested = isTested(name);
                return (
                  <span
                    key={name}
                    className={cn(CHIP, tested ? CHIP_TESTED : CHIP_PLAIN)}
                    data-testid={tested ? "tested-platform" : undefined}
                  >
                    {tested && (
                      <Check
                        aria-hidden
                        className={cn("h-3 w-3 shrink-0", CHIP_TESTED_GLYPH)}
                      />
                    )}
                    {displayName(name)}
                  </span>
                );
              })}
            </div>

            {overflowCount > 0 && (
              <SettingsHint className="mt-3">
                …and {overflowCount} more — refine your search
              </SettingsHint>
            )}
          </div>
        </>
      )}
    </div>
  );
}
