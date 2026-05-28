import { getModel } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";

const SESSION_TTL_MS = 30 * 60 * 1000;

interface CachedSession {
  session: AgentSession;
  expiresAt: number;
}

const sessionCache = new Map<string, CachedSession>();

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

async function createPiSession(systemPrompt: string): Promise<AgentSession> {
  const model = await resolveModel();
  if (!model) {
    throw new Error("No pi models available — configure ANTHROPIC_API_KEY, OPENAI_API_KEY, or PI_MODEL");
  }

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    authStorage: getAuthStorage(),
    modelRegistry: getModelRegistry(),
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    noTools: "all",
    tools: [],
  });

  return session;
}

async function getOrCreateSession(conversationId: string, systemPrompt: string): Promise<AgentSession> {
  const cached = sessionCache.get(conversationId);
  if (cached && cached.expiresAt > Date.now()) {
    cached.session.agent.state.systemPrompt = systemPrompt;
    cached.expiresAt = Date.now() + SESSION_TTL_MS;
    return cached.session;
  }

  if (cached) {
    cached.session.dispose();
    sessionCache.delete(conversationId);
  }

  const session = await createPiSession(systemPrompt);
  sessionCache.set(conversationId, {
    session,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return session;
}

async function promptAndCollect(session: AgentSession, userMessage: string): Promise<string> {
  let response = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      response += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(userMessage);
    if (session.agent.state.errorMessage) {
      throw new Error(session.agent.state.errorMessage);
    }
    return response.trim();
  } finally {
    unsubscribe();
  }
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

export async function chatWithPi(
  conversationId: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  try {
    const session = await getOrCreateSession(conversationId, systemPrompt);
    const reply = await promptAndCollect(session, userMessage);
    return reply || null;
  } catch (err) {
    console.error("Pi assistant error:", err);
    return null;
  }
}

export function disposePiSession(conversationId: string) {
  const cached = sessionCache.get(conversationId);
  if (cached) {
    cached.session.dispose();
    sessionCache.delete(conversationId);
  }
}
