import { describe, it, expect } from "vitest";
import { mediaFileUrl } from "./utils";

describe("mediaFileUrl", () => {
  it("encodes the path into the sift-media protocol", () => {
    expect(mediaFileUrl("C:\\v\\a b.mp4")).toBe("sift-media://file/C%3A%5Cv%5Ca%20b.mp4");
  });
});
