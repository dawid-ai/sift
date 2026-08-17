import { describe, expect, it, vi } from "vitest";
import { createWhisperRunner, parseWhisperJson } from "./whisper";
import type { SpawnedProcess } from "./ytdlp";

const SAMPLE = {
  transcription: [
    { offsets: { from: 0, to: 2000 }, text: " Hello world" },
    { offsets: { from: 2000, to: 4500 }, text: " second line " },
  ],
};

describe("parseWhisperJson", () => {
  it("maps ms offsets to second-based segments and trims text", () => {
    expect(parseWhisperJson(SAMPLE)).toEqual([
      { start: 0, end: 2, text: "Hello world" },
      { start: 2, end: 4.5, text: "second line" },
    ]);
  });

  it("returns [] for a shapeless payload", () => {
    expect(parseWhisperJson({})).toEqual([]);
    expect(parseWhisperJson(null)).toEqual([]);
  });

  it("skips null/non-object elements instead of throwing", () => {
    expect(
      parseWhisperJson({
        transcription: [null, { offsets: { from: 0, to: 1000 }, text: "a" }],
      }),
    ).toEqual([{ start: 0, end: 1, text: "a" }]);
  });
});

/** A fake ChildProcess that replays stderr chunks then closes with `code`. */
function fakeSpawn(opts: { stderr?: string[]; code?: number } = {}) {
  const spawn = vi.fn((_file: string, _args: string[]) => {
    const handlers: Record<string, ((arg: unknown) => void)[]> = {};
    const stderrCbs: ((c: string) => void)[] = [];
    queueMicrotask(() => {
      for (const chunk of opts.stderr ?? [])
        stderrCbs.forEach((cb) => cb(chunk));
      (handlers.close ?? []).forEach((cb) => cb(opts.code ?? 0));
    });
    return {
      stdout: { on: () => {} },
      stderr: {
        on: (_e: "data", cb: (c: string) => void) => void stderrCbs.push(cb),
      },
      on: (e: string, cb: (arg: unknown) => void) => {
        (handlers[e] ??= []).push(cb);
      },
    } as unknown as SpawnedProcess;
  });
  return spawn;
}

describe("createWhisperRunner", () => {
  it("spawns whisper-cli with model + json + progress flags and parses the result", async () => {
    const spawn = fakeSpawn();
    const r = createWhisperRunner({
      getBinaryPath: () => "/bin/whisper-cli",
      getModelPath: () => "/models/ggml-small.bin",
      spawn,
      readJson: () => SAMPLE,
    });
    const { segments } = await r.transcribe({
      wavPath: "/a.wav",
      language: "en",
    });
    expect(segments).toHaveLength(2);
    const [file, args] = spawn.mock.calls[0]!;
    expect(file).toBe("/bin/whisper-cli");
    expect(args).toContain("-m");
    expect(args).toContain("/models/ggml-small.bin");
    expect(args).toContain("-f");
    expect(args).toContain("/a.wav");
    expect(args).toContain("-oj");
    expect(args).toContain("-pp");
    expect(args).toContain("-l");
    expect(args).toContain("en");
  });

  it("reports increasing progress from stderr `progress = N%` lines", async () => {
    const spawn = fakeSpawn({
      stderr: [
        "whisper_print_progress_callback: progress =  10%\n",
        "whisper_print_progress_callback: progress =  10%\n", // dup — must not re-fire
        "whisper_print_progress_callback: progress =  55%\n",
      ],
    });
    const r = createWhisperRunner({
      getBinaryPath: () => "/b",
      getModelPath: () => "/m",
      spawn,
      readJson: () => SAMPLE,
    });
    const seen: number[] = [];
    await r.transcribe({ wavPath: "/a.wav", language: "en" }, (ratio) =>
      seen.push(ratio),
    );
    expect(seen).toEqual([0.1, 0.55]);
  });

  it("rejects on a non-zero exit code", async () => {
    const spawn = fakeSpawn({ code: 1 });
    const r = createWhisperRunner({
      getBinaryPath: () => "/b",
      getModelPath: () => "/m",
      spawn,
      readJson: () => SAMPLE,
    });
    await expect(
      r.transcribe({ wavPath: "/a.wav", language: "en" }),
    ).rejects.toThrow(/whisper failed/i);
  });

  it("throws when the binary or model is missing", () => {
    const r = createWhisperRunner({
      getBinaryPath: () => null,
      getModelPath: () => "/m",
    });
    expect(() => r.transcribe({ wavPath: "/a.wav", language: "en" })).toThrow(
      /whisper/i,
    );
  });
});
