import { describe, it, expect } from "vitest";
import { estimateInputTokens, mergeUsage } from "../../open-sse/utils/usageTracking.js";

const pngB64 = "A".repeat(15000); // ~15 KB of base64, like a small screenshot

describe("estimateInputTokens — base64 images", () => {
  it("does not count base64 image payload as text tokens", () => {
    const body = {
      model: "azure-foundry-9k/gpt-6-luna",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Baca teks di gambar ini." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${pngB64}` } },
        ],
      }],
    };
    const tokens = estimateInputTokens(body);
    // Old behaviour: JSON length / 4 ≈ 4000+ for this body. New: text + 1 image estimate.
    expect(tokens).toBeLessThan(1500);
    expect(tokens).toBeGreaterThan(1000); // includes the per-image estimate
  });

  it("text-only bodies are unchanged (length / 4)", () => {
    const body = { messages: [{ role: "user", content: "Balas hanya: PONG" }] };
    expect(estimateInputTokens(body)).toBe(Math.ceil(JSON.stringify(body).length / 4));
  });
});

describe("mergeUsage — real usage overrides estimate", () => {
  it("replaces an estimated prompt count with the real one", () => {
    const est = { prompt_tokens: 5891, completion_tokens: 2, total_tokens: 5893, estimated: true };
    const real = { prompt_tokens: 368, completion_tokens: 34, total_tokens: 402 };
    const merged = mergeUsage(est, real);
    expect(merged.prompt_tokens).toBe(368);
    expect(merged.completion_tokens).toBe(34);
    expect(merged.estimated).toBeUndefined();
  });

  it("still max-merges two real readings (Anthropic message_start + message_delta)", () => {
    const a = { prompt_tokens: 100, completion_tokens: 1 };
    const b = { completion_tokens: 50 };
    const merged = mergeUsage(a, b);
    expect(merged.prompt_tokens).toBe(100);
    expect(merged.completion_tokens).toBe(50);
  });
});
