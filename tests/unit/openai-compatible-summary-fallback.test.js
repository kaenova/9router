import { beforeEach, describe, expect, it, vi } from "vitest";

const proxyAwareFetch = vi.hoisted(() => vi.fn());
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch }));

import { DefaultExecutor } from "../../open-sse/executors/default.js";

const provider = "openai-compatible-chat-test";
const credentials = { apiKey: "test", providerSpecificData: { apiType: "responses", baseUrl: "https://example.test/v1" } };
const error = (message, param = "reasoning.summary", code = "invalid_value") =>
  Response.json({ error: { message, param, code } }, { status: 400 });

function execute(body = { input: "hi", reasoning: { effort: "high", summary: "detailed" } }, creds = credentials) {
  return new DefaultExecutor(provider).execute({ model: "gpt-5", body, stream: false, credentials: creds });
}

beforeEach(() => proxyAwareFetch.mockReset());

describe("compatible Responses detailed summary fallback", () => {
  it("retries exactly once with auto after a specific detailed-summary rejection", async () => {
    proxyAwareFetch.mockResolvedValueOnce(error("Unsupported value: 'detailed' for reasoning.summary"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const body = { input: "hi", reasoning: { effort: "high", summary: "detailed", context: "current_turn" } };
    const result = await execute(body);
    expect(result.response.status).toBe(200);
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(proxyAwareFetch.mock.calls[0][1].body);
    const second = JSON.parse(proxyAwareFetch.mock.calls[1][1].body);
    expect(first.reasoning.summary).toBe("detailed");
    expect(second.reasoning).toEqual({ effort: "high", summary: "auto", context: "current_turn" });
    expect(result.transformedBody.reasoning.summary).toBe("auto");
    expect(body.reasoning.summary).toBe("detailed");
  });

  it("passes through unrelated errors without consuming the response", async () => {
    proxyAwareFetch.mockResolvedValueOnce(error("Unsupported value: 'high' for reasoning.effort", "reasoning.effort"));
    const result = await execute();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect((await result.response.json()).error.param).toBe("reasoning.effort");
  });

  it("does not retry a rejection of the summary parameter itself", async () => {
    proxyAwareFetch.mockResolvedValueOnce(error("Unsupported parameter: reasoning.summary", "reasoning.summary", "unsupported_parameter"));
    const result = await execute();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(400);
  });

  it("returns the auto retry error without another retry", async () => {
    proxyAwareFetch.mockResolvedValueOnce(error("Invalid 'detailed' for reasoning.summary"))
      .mockResolvedValueOnce(error("Invalid 'auto' for reasoning.summary"));
    const result = await execute();
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    expect((await result.response.json()).error.message).toContain("auto");
  });

  it("does not retry explicit auto or Chat Completions requests", async () => {
    proxyAwareFetch.mockResolvedValue(error("Invalid 'detailed' for reasoning.summary"));
    await execute({ input: "hi", reasoning: { effort: "high", summary: "auto" } });
    await execute({ messages: [], reasoning: { effort: "high", summary: "detailed" } }, {
      ...credentials, providerSpecificData: { ...credentials.providerSpecificData, apiType: "chat" },
    });
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
  });
});
