import { describe, expect, it } from "vitest";
import { getTargetFormat } from "../../open-sse/services/provider.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { DefaultExecutor } from "../../open-sse/executors/default.js";

// A node created as Chat can later be switched to Responses; the stored API
// type, not the legacy ID, determines the target wire shape.
const provider = "openai-compatible-chat-test";
const credentials = { providerSpecificData: { apiType: "responses", baseUrl: "https://example.test/openai/v1" } };
const model = "gpt-5";

function translate(source, body, creds = credentials) {
  const target = getTargetFormat(provider, creds);
  return translateRequest(source, target, model, body, true, creds, provider);
}

describe("OpenAI-compatible Responses reasoning", () => {
  it.each(["none", "low", "medium", "high", "xhigh"])("converts Chat effort %s on the upstream wire", (effort) => {
    const request = translate(FORMATS.OPENAI, {
      model, messages: [{ role: "user", content: "hi" }], reasoning_effort: effort,
    });
    const executor = new DefaultExecutor(provider);
    const wire = executor.transformRequest(model, request, true, credentials);
    expect(executor.buildUrl(model, true, 0, credentials)).toBe("https://example.test/openai/v1/responses");
    expect(wire.reasoning.effort).toBe(effort);
    expect(wire.reasoning.summary).toBe(effort === "none" ? "auto" : "detailed");
    expect(wire.reasoning_effort).toBeUndefined();
    expect(wire.input).toBeDefined();
    expect(wire.messages).toBeUndefined();
  });

  it("preserves native Responses reasoning options and removes a stray Chat field", () => {
    const request = translate(FORMATS.OPENAI_RESPONSES, {
      model, input: "hi", reasoning: { effort: "high", summary: "detailed" }, reasoning_effort: "low",
    });
    expect(request.reasoning).toEqual({ effort: "low", summary: "detailed" });
    expect(request.reasoning_effort).toBeUndefined();
  });

  it("defaults native reasoning to a detailed summary", () => {
    const request = translate(FORMATS.OPENAI_RESPONSES, { model, input: "hi", reasoning: { effort: "high" } });
    expect(request.reasoning).toEqual({ effort: "high", summary: "detailed" });
  });

  it.each(["detailed", "concise", "auto", null])("preserves an explicit native summary %s", (summary) => {
    const request = translate(FORMATS.OPENAI_RESPONSES, { model, input: "hi", reasoning: { effort: "high", summary } });
    expect(request.reasoning).toEqual({ effort: "high", summary });
  });

  it("does not add a summary to native reasoning disabled with none", () => {
    const request = translate(FORMATS.OPENAI_RESPONSES, { model, input: "hi", reasoning: { effort: "none" } });
    expect(request.reasoning).toEqual({ effort: "none" });
  });

  it("normalizes effort from Claude requests to the Responses wire", () => {
    const request = translate(FORMATS.CLAUDE, {
      model, messages: [{ role: "user", content: "hi" }], output_config: { effort: "high" },
    });
    expect(request.reasoning.effort).toBe("high");
    expect(request.reasoning.summary).toBe("detailed");
    expect(request.reasoning_effort).toBeUndefined();
  });

  it("honors a model thinking suffix and clamps unsupported max", () => {
    const request = translateRequest(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, "gpt-5(max)", {
      model, messages: [{ role: "user", content: "hi" }], reasoning_effort: "low",
    }, true, credentials, provider);
    expect(request.reasoning.effort).toBe("xhigh");
    expect(request.reasoning_effort).toBeUndefined();
  });

  it("does not add reasoning when not requested", () => {
    const request = translate(FORMATS.OPENAI, { model, messages: [{ role: "user", content: "hi" }] });
    expect(request.reasoning).toBeUndefined();
    expect(request.reasoning_effort).toBeUndefined();
  });

  it("keeps Chat nodes on the Chat reasoning wire", () => {
    const request = translate(FORMATS.OPENAI, {
      model, messages: [{ role: "user", content: "hi" }], reasoning_effort: "high",
    }, { providerSpecificData: { apiType: "chat" } });
    expect(request.reasoning_effort).toBe("high");
    expect(request.reasoning).toBeUndefined();
  });
});
