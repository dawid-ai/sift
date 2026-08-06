import { describe, expect, it, vi } from "vitest";
import { createOllamaSlideClassifier, parseSlideAnswer } from "./frame-classifier";

describe("parseSlideAnswer", () => {
  it("keeps on yes, drops on no (with punctuation / trailing prose)", () => {
    expect(parseSlideAnswer("yes")).toBe(true);
    expect(parseSlideAnswer("Yes.")).toBe(true);
    expect(parseSlideAnswer("No, this is a talking head.")).toBe(false);
    expect(parseSlideAnswer("not a slide — it's a webcam")).toBe(false);
  });
  it("fail-opens (keeps) on an unclear answer", () => {
    expect(parseSlideAnswer("I think it could be something")).toBe(true);
    expect(parseSlideAnswer("")).toBe(true);
  });
});

describe("createOllamaSlideClassifier", () => {
  const readImage = () => Buffer.from("imgbytes");

  it("posts the frame as base64 and returns the parsed decision", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "no" } }),
    });
    const c = createOllamaSlideClassifier({ model: "moondream", fetchImpl: fetchImpl as never, readImage });
    expect(await c.classify("/f.jpg")).toBe(false);
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body);
    expect(body.model).toBe("moondream");
    expect(body.stream).toBe(false);
    expect(body.messages[0].images[0]).toBe(Buffer.from("imgbytes").toString("base64"));
  });

  it("throws a clear error when the model isn't available (non-ok)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const c = createOllamaSlideClassifier({ model: "missing", fetchImpl: fetchImpl as never, readImage });
    await expect(c.classify("/f.jpg")).rejects.toThrow(/vision model pulled/);
  });

  it("throws when the daemon is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const c = createOllamaSlideClassifier({ model: "x", fetchImpl: fetchImpl as never, readImage });
    await expect(c.classify("/f.jpg")).rejects.toThrow(/Could not reach Ollama/);
  });
});
