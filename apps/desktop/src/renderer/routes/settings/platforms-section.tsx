import { useEffect, useMemo, useState } from "react";
import { listTestedPlatforms } from "@sift/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const MAX_VISIBLE_EXTRACTORS = 300;

const TESTED_PLATFORMS = listTestedPlatforms();

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
    if (!needle) return extractors;
    return extractors.filter((name) => name.toLowerCase().includes(needle));
  }, [extractors, query]);

  const visible = filtered.slice(0, MAX_VISIBLE_EXTRACTORS);
  const overflowCount = filtered.length - visible.length;

  return (
    <div data-testid="platforms-section" className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tested platforms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TESTED_PLATFORMS.map((platform) => (
            <Badge key={platform.id} data-testid="tested-platform">
              {platform.label}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All supported (searchable)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p className="text-sm text-foreground/70" data-testid="platforms-error">
              {error}
            </p>
          ) : (
            <>
              <Input
                placeholder="Search platforms…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={extractors === null}
                data-testid="platforms-search"
              />
              <p className="text-sm text-foreground/70" data-testid="platforms-count">
                {extractors === null
                  ? "Loading…"
                  : `${filtered.length} platform${filtered.length === 1 ? "" : "s"}`}
              </p>
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
                {visible.map((name) => (
                  <li key={name} className="text-foreground/80">
                    {name}
                  </li>
                ))}
              </ul>
              {overflowCount > 0 && (
                <p className="text-sm text-foreground/50">
                  …and {overflowCount} more — refine your search
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
