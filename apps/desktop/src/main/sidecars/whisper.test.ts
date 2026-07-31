import { describe, expect, it, vi } from "vitest";
import { createWhisperRunner, parseWhisperJson } from "./whisper";

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

describe("createWhisperRunner", () => {
  it("execs whisper-cli with model + json output and parses the result", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const r = createWhisperRunner({
      getBinaryPath: () => "/bin/whisper-cli",
      getModelPath: () => "/models/ggml-small.bin",
      exec,
      readJson: () => SAMPLE,
    });
    const { segments } = await r.transcribe({ wavPath: "/a.wav", language: "en" });
    expect(segments).toHaveLength(2);
    const [file, args] = exec.mock.calls[0]!;
    expect(file).toBe("/bin/whisper-cli");
    expect(args).toContain("-m");
    expect(args).toContain("/models/ggml-small.bin");
    expect(args).toContain("-f");
    expect(args).toContain("/a.wav");
    expect(args).toContain("-oj");
    expect(args).toContain("-l");
    expect(args).toContain("en");
  });

  it("throws when the binary or model is missing", async () => {
    const r = createWhisperRunner({ getBinaryPath: () => null, getModelPath: () => "/m" });
    await expect(r.transcribe({ wavPath: "/a.wav", language: "en" })).rejects.toThrow(/whisper/i);
  });
});
