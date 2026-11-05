import { describe, it, expect } from "vitest";
import { createPassthroughStreamWithLogger } from "../../open-sse/utils/stream.js";

// Upstream shape captured live from LiteLLM chat stream (stream_options.include_usage=true):
// the usage trailer has choices[0].delta = {} and NO finish_reason, after the finish chunk.
const CHUNKS = [
  'data: {"id":"r1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"KODE 4821"}}]}\n\n',
  'data: {"id":"r1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: {"id":"r1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{}}],"usage":{"prompt_tokens":368,"completion_tokens":38,"total_tokens":406}}\n\n',
  "data: [DONE]\n\n",
];

async function collect(chunks) {
  const body = { model: "m", messages: [{ role: "user", content: "x".repeat(15000) }], stream: true };
  const t = createPassthroughStreamWithLogger("openai-compatible-chat-x", null, "m", null, body, null, null, null);
  const writer = t.writable.getWriter();
  const reader = t.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  (async () => {
    for (const c of chunks) await writer.write(enc.encode(c));
    await writer.close();
  })();
  const out = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(dec.decode(value));
  }
  return out.join("");
}

function usageEvents(text) {
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
    .map((l) => JSON.parse(l.slice(6)))
    .filter((j) => j.usage)
    .map((j) => j.usage);
}

describe("passthrough: real usage trailer after finish_reason", () => {
  it("forwards the upstream trailer (choices[0].delta={}) so the client gets real prompt_tokens", async () => {
    const text = await collect(CHUNKS);
    const usages = usageEvents(text);
    expect(usages.length).toBeGreaterThan(0);
    expect(usages[usages.length - 1].prompt_tokens).toBe(368);
  });
});
