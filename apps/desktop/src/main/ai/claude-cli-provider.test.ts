import { describe, expect, it, vi } from "vitest";
import { createClaudeCliProvider, mapClaudeModel, type ClaudeCliExec } from "./claude-cli-provider";

describe("mapClaudeModel", () => {
  it("passes short aliases through and maps unknowns to themselves", () => {
    expect(mapClaudeModel("opus")).toBe("opus");
    expect(mapClaudeModel("claude-sonnet-5")).toBe("claude-sonnet-5");
  });
});

describe("createClaudeCliProvider", () => {
  it("spawns claude -p with the model and pipes the prompt on stdin", async () => {
    const exec = vi.fn<ClaudeCliExec>(async () => ({ stdout: "polished text\n", stderr: "", exitCode: 0 }));
    const provider = createClaudeCliProvider({ exec });

    const tokens: string[] = [];
    const out = await provider.summarize(
      { model: "opus", systemPrompt: "SYS", content: "raw", maxTokens: 4096 },
      (t) => tokens.push(t),
    );

    expect(out).toBe("polished text"); // trailing newline trimmed
    expect(tokens).toEqual(["polished text"]); // non-streaming: one token at the end
    const [args, input] = exec.mock.calls[0]!;
    expect(args).toEqual(["-p", "--model", "opus"]);
    expect(input).toContain("SYS");
    expect(input).toContain("raw");
  });

  it("rejects with a claude-naming message on a non-zero exit", async () => {
    const exec = vi.fn(async () => ({ stdout: "", stderr: "not logged in", exitCode: 1 }));
    const provider = createClaudeCliProvider({ exec });
    await expect(
      provider.summarize({ model: "opus", systemPrompt: "s", content: "c", maxTokens: 10 }, () => {}),
    ).rejects.toThrow(/claude/i);
  });

  it("surfaces a missing-binary spawn error", async () => {
    const exec = vi.fn(async () => {
      throw Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    });
    const provider = createClaudeCliProvider({ exec });
    await expect(
      provider.summarize({ model: "opus", systemPrompt: "s", content: "c", maxTokens: 10 }, () => {}),
    ).rejects.toThrow(/claude/i);
  });
});
