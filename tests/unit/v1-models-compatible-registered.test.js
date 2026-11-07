import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(),
  getCustomModels: vi.fn(),
  getModelAliases: vi.fn(),
}));
const disabled = vi.hoisted(() => vi.fn());
const resolveKiroModels = vi.hoisted(() => vi.fn());
vi.mock("@/lib/localDb", () => db);
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: disabled }));
vi.mock("open-sse/services/kiroModels.js", () => ({ resolveKiroModels }));

const { buildModelsList } = await import("../../src/app/api/v1/models/route.js");

function connection(provider, extra = {}) {
  return {
    id: provider, provider, apiKey: "test-key", isActive: true,
    providerSpecificData: { prefix: "foundry", baseUrl: "https://example.test/v1", ...extra },
  };
}

beforeEach(() => {
  db.getProviderConnections.mockResolvedValue([]);
  db.getCombos.mockResolvedValue([]);
  db.getCustomModels.mockResolvedValue([]);
  db.getModelAliases.mockResolvedValue({});
  disabled.mockResolvedValue({});
  resolveKiroModels.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network fetch")));
});
afterEach(() => vi.unstubAllGlobals());

describe("/v1/models compatible providers", () => {
  it.each(["openai-compatible-responses-test", "anthropic-compatible-test"])(
    "lists registered models without fetching %s upstream", async (provider) => {
      db.getProviderConnections.mockResolvedValue([connection(provider)]);
      db.getCustomModels.mockResolvedValue([
        { providerAlias: "foundry", id: "custom-gpt", type: "llm" },
        { providerAlias: provider, id: "disabled-gpt", type: "llm" },
      ]);
      db.getModelAliases.mockResolvedValue({ friendly: "foundry/alias-gpt" });
      db.getCombos.mockResolvedValue([{ name: "my-combo", models: ["foundry/custom-gpt"] }]);
      disabled.mockResolvedValue({ foundry: ["disabled-gpt"] });

      const ids = (await buildModelsList(["llm"])).map((model) => model.id);
      expect(ids).toContain("foundry/custom-gpt");
      expect(ids).toContain("foundry/alias-gpt");
      expect(ids).toContain("my-combo");
      expect(ids).not.toContain("foundry/disabled-gpt");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it("includes explicitly enabled models with their configured prefix", async () => {
    db.getProviderConnections.mockResolvedValue([connection("openai-compatible-chat-test", {
      enabledModels: ["gpt-5", "foundry/gpt-5", "custom-deployment"],
    })]);
    const foundry = (await buildModelsList(["llm"])).filter((m) => m.owned_by === "foundry");
    expect(foundry.map((m) => m.id).sort()).toEqual(["foundry/custom-deployment", "foundry/gpt-5"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not enumerate upstream models when none are registered", async () => {
    db.getProviderConnections.mockResolvedValue([connection("openai-compatible-responses-test")]);
    const foundry = (await buildModelsList(["llm"])).filter((m) => m.owned_by === "foundry");
    expect(foundry).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps live model discovery for built-in providers", async () => {
    db.getProviderConnections.mockResolvedValue([{ id: "kiro", provider: "kiro", isActive: true, accessToken: "test" }]);
    resolveKiroModels.mockResolvedValue({ models: [{ id: "live-model" }] });
    const models = await buildModelsList(["llm"]);
    expect(resolveKiroModels).toHaveBeenCalledOnce();
    expect(models.map((m) => m.id)).toContain("kr/live-model");
  });
});
