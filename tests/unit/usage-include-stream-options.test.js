import { describe, it, expect } from "vitest";
import { DefaultExecutor } from "open-sse/executors/default.js";

const body = () => ({
  model: "gpt-6-luna",
  stream: true,
  messages: [{ role: "user", content: "Balas hanya: PONG" }],
});

describe("openai-compatible chat stream asks upstream for usage", () => {
  it("adds stream_options.include_usage for openai-compatible-* streams", () => {
    const exec = new DefaultExecutor("openai-compatible-responses-test");
    const out = exec.transformRequest("gpt-6-luna", body(), true, {});
    expect(out.stream_options).toEqual({ include_usage: true });
  });

  it("does not add it for non-stream requests", () => {
    const exec = new DefaultExecutor("openai-compatible-responses-test");
    const out = exec.transformRequest("gpt-6-luna", { ...body(), stream: false }, false, {});
    expect(out.stream_options).toBeUndefined();
  });

  it("keeps a client-provided stream_options untouched", () => {
    const exec = new DefaultExecutor("openai-compatible-responses-test");
    const out = exec.transformRequest(
      "gpt-6-luna",
      { ...body(), stream_options: { include_usage: false } },
      true,
      {}
    );
    expect(out.stream_options).toEqual({ include_usage: false });
  });

  it("does not change other providers", () => {
    const exec = new DefaultExecutor("openai");
    const out = exec.transformRequest("gpt-4o", body(), true, {});
    expect(out.stream_options).toBeUndefined();
  });
});
