import { describe, expect, it } from "vitest";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";

// Live path: client speaks Chat Completions (pi), upstream is openai-compatible-responses
// (LiteLLM /v1/responses). Upstream events below mirror what LiteLLM actually sent.
async function run(chunks) {
  const enc = new TextEncoder();
  const input = chunks.map((c) => `event: ${c.type}\ndata: ${JSON.stringify(c)}\n\n`).join("");
  const src = new ReadableStream({ start(ctrl) { ctrl.enqueue(enc.encode(input)); ctrl.close(); } });
  const out = src.pipeThrough(
    createSSETransformStreamWithLogger(
      FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, "azure-foundry-9k", null, null, "gpt-6-luna", null,
      { messages: [{ role: "user", content: "x".repeat(40000) }] },
    ),
  );
  const reader = out.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
  }
  return text + dec.decode();
}

const R = "resp_test";
const upstream = [
  { type: "response.created", response: { id: R, object: "response", status: "in_progress" } },
  { type: "response.output_item.added", output_index: 0, item: { id: "msg_1", type: "message", role: "assistant", content: [] } },
  { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, content_index: 0, delta: "KODE 4821" },
  { type: "response.output_text.done", item_id: "msg_1", output_index: 0, content_index: 0, text: "KODE 4821" },
  { type: "response.output_item.done", output_index: 0, item: { id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "KODE 4821" }] } },
  { type: "response.completed", response: { id: R, object: "response", status: "completed", usage: { input_tokens: 368, output_tokens: 34, total_tokens: 402 } } },
];

describe("responses upstream -> chat client: real usage reaches the client", () => {
  it("client receives input_tokens-derived real usage (368), not the body-size estimate", async () => {
    const text = await run(upstream);
    expect(text).toContain('"prompt_tokens":368');
    expect(text).not.toMatch(/"prompt_tokens":\d{4,}/);
  });
});
