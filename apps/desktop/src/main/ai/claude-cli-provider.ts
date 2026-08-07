import { spawn } from "node:child_process";
import type { AiModelInfo, AiProvider } from "@sift/core";

export const CLAUDE_CLI_ID = "claude-cli";

// Claude Code accepts short aliases (opus/sonnet/haiku) and resolves them to the current
// model in that family — version-agnostic, so we ship the aliases as the model ids rather
// than pinning claude-opus-4-8 etc. that would drift as the CLI updates.
export const CLAUDE_CLI_MODELS: AiModelInfo[] = [
  { id: "opus", label: "Claude Opus (subscription)" },
  { id: "sonnet", label: "Claude Sonnet (subscription)" },
  { id: "haiku", label: "Claude Haiku (subscription)" },
];

/** Currently a pass-through — the alias IS what Claude Code's `--model` wants. Kept as a
 * seam so a future dropdown of full model ids can normalise here without touching callers. */
export function mapClaudeModel(model: string): string {
  return model;
}

/** Runs the `claude` CLI once with `args`, feeding `input` on stdin; resolves its output. */
export type ClaudeCliExec = (
  args: string[],
  input: string,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

const defaultExec: ClaudeCliExec = (args, input) =>
  new Promise((resolve, reject) => {
    const proc = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject); // ENOENT etc.
    proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    proc.stdin.write(input);
    proc.stdin.end();
  });

/** Whether the `claude` CLI is present and runnable (`claude --version` exits 0). Feeds the
 * Settings availability badge — not a login check (that only surfaces at call time). */
export async function isClaudeCliAvailable(exec: ClaudeCliExec = defaultExec): Promise<boolean> {
  try {
    return (await exec(["--version"], "")).exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * AI provider backed by the user's logged-in Claude Code CLI (`claude -p`), using their
 * Claude.ai subscription rather than API credits. Keyless — availability is checked at call
 * time (a missing/logged-out `claude` throws). ponytail: v1 is non-streaming — `onToken`
 * fires once with the full text; `--output-format stream-json` is the upgrade path.
 */
export function createClaudeCliProvider(deps: { exec?: ClaudeCliExec } = {}): AiProvider {
  const exec = deps.exec ?? defaultExec;
  return {
    id: CLAUDE_CLI_ID,
    label: "Claude Code CLI (subscription)",
    needsKey: false,
    models: () => CLAUDE_CLI_MODELS,
    async summarize(input, onToken) {
      // Claude Code has its own system prompt; fold ours into the piped prompt so no
      // provider-specific flag is required. maxTokens has no CLI equivalent — ignored.
      const prompt = `${input.systemPrompt}\n\n${input.content}`;
      let res;
      try {
        res = await exec(["-p", "--model", mapClaudeModel(input.model)], prompt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Could not run the \`claude\` CLI. Is Claude Code installed and logged in? (${msg})`);
      }
      if (res.exitCode !== 0) {
        throw new Error(`\`claude\` exited with code ${res.exitCode}: ${res.stderr.trim() || "no output"}`);
      }
      const text = res.stdout.trim();
      if (text) onToken(text);
      return text;
    },
  };
}
