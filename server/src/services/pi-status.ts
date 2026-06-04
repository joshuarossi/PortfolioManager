import { getModel } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

let authStorage: AuthStorage | null = null;
let modelRegistry: ModelRegistry | null = null;

function getAuthStorage(): AuthStorage {
  if (!authStorage) {
    authStorage = AuthStorage.create();
    if (process.env.ANTHROPIC_API_KEY) {
      authStorage.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY);
    }
    if (process.env.OPENAI_API_KEY) {
      authStorage.setRuntimeApiKey("openai", process.env.OPENAI_API_KEY);
    }
    if (process.env.GOOGLE_API_KEY) {
      authStorage.setRuntimeApiKey("google", process.env.GOOGLE_API_KEY);
    }
  }
  return authStorage;
}

function getModelRegistry(): ModelRegistry {
  if (!modelRegistry) {
    modelRegistry = ModelRegistry.create(getAuthStorage());
  }
  return modelRegistry;
}

function parseModelRef(): { provider: string; id: string } | null {
  const ref = process.env.PI_MODEL?.trim();
  if (!ref) return null;
  const slash = ref.indexOf("/");
  if (slash <= 0) return null;
  return { provider: ref.slice(0, slash), id: ref.slice(slash + 1) };
}

async function resolveModel() {
  const registry = getModelRegistry();
  const preferred = parseModelRef();
  if (preferred) {
    const model = registry.find(preferred.provider, preferred.id) ?? getModel(preferred.provider, preferred.id);
    if (model) return model;
  }

  const available = await registry.getAvailable();
  if (available.length === 0) return null;

  const pick =
    available.find((m) => m.provider === "anthropic") ??
    available.find((m) => m.provider === "openai") ??
    available[0];

  return pick;
}

export async function getPiAssistantStatus(): Promise<{
  available: boolean;
  model: string | null;
  providers: string[];
}> {
  const model = await resolveModel();
  const available = await getModelRegistry().getAvailable();
  return {
    available: model != null,
    model: model ? `${model.provider}/${model.id}` : null,
    providers: [...new Set(available.map((m) => m.provider))],
  };
}
