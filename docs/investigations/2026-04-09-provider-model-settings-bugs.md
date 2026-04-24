# Investigation: Provider & Model Settings Bugs

**Date**: 2026-04-09
**Status**: Found 6 bugs (2 critical, 2 high, 2 medium) — solutions designed + reviewed by 12 specialized agents
**Review outcome**: Bugs 1-3, 5 need revisions. Bug 4 is sound. Bug 6 is superseded by Bug 4.

---

## Bug 1 (CRITICAL): Model Selection is Completely Dropped

The UI collects a model via the tier selector, but the model ID is **never stored or used**.

| Layer | File | What happens to model |
|-------|------|----------------------|
| UI | `src/components/screens/SettingsScreen.tsx:65` | `onSaveApiKey(provider, key, selectedModel?.id)` — model IS passed |
| App | `src/App.tsx:346` | `await setProvider(provider, key)` — **model DROPPED** |
| Hook | `src/hooks/ipc.ts:176` | `setProvider(providerId, apiKey)` — only 2 params |
| Preload | `electron/preload.ts:46` | `{ providerId, apiKey }` — no model field |
| Types | `electron/ipc/channels.ts:117` | `LLMProviderSetRequest` has no model field |
| Handler | `electron/ipc/handlers.ts` | `setProvider(payload.providerId, payload.apiKey)` — no model |
| Manager | `core/llm/provider-manager.ts` | `createLLMProvider({ provider, apiKey })` — no model |
| Factory | `core/llm/provider.ts` | Falls back to hardcoded `DEFAULT_MODELS` |

**Impact**: The tier selector (Fast/Balanced/Power) is purely cosmetic. The app always uses the hardcoded default model.

### Solution: Thread Model Through the Entire Chain (11 files)

**Architecture**: Additive changes only — model is `optional` everywhere. Falls back to provider default if not specified. Fully backward compatible.

#### 1. `core/settings/manager.ts` — Add model persistence

```typescript
// Add to SettingsFile interface
interface SettingsFile {
  settings: Record<string, unknown>;
  apiKeys: Record<string, string>;
  activeProvider: LLMProvider | null;
  providerValidationStatus: Record<string, { isValid: boolean; timestamp: number }>;
  activeModels: Record<string, string>; // NEW: provider -> model mapping
}

// Add static property
private static persistentActiveModels: Map<string, string> = new Map();

// In loadFromDisk(): add
SettingsManager.persistentActiveModels = new Map(Object.entries(parsed.activeModels || {}));

// In saveToDisk(): add
activeModels: Object.fromEntries(SettingsManager.persistentActiveModels),

// New methods
async getActiveModel(provider: LLMProvider): Promise<string | null> {
  return SettingsManager.persistentActiveModels.get(provider) ?? null;
}

async setActiveModel(provider: LLMProvider, model: string): Promise<void> {
  const configured = await this.getConfiguredProviders();
  if (!configured.includes(provider)) {
    throw new Error(`Provider ${provider} is not configured`);
  }
  SettingsManager.persistentActiveModels.set(provider, model);
  SettingsManager.saveToDisk();
}

// In resetAllSettings(): add
SettingsManager.persistentActiveModels.clear();
```

#### 2. `core/llm/provider-manager.ts` — Accept and persist model

```typescript
// Update setProvider signature
async setProvider(providerId: ProviderName, apiKey: string, model?: string): Promise<void> {
  // ... existing validation ...
  await this.settingsManager.setApiKey(providerId, apiKey);
  await this.settingsManager.setActiveProvider(providerId);

  // NEW: Store the active model if provided
  if (model) {
    await this.settingsManager.setActiveModel(providerId, model);
  }

  this.validationCache.delete(providerId);
  const provider = createLLMProvider({ provider: providerId, apiKey, model });
  this.providers.set(providerId, provider);
}

// Update getActiveProvider to load persisted model
async getActiveProvider(): Promise<LLMProvider | null> {
  // ... existing lookup ...
  const model = await this.settingsManager.getActiveModel(activeId);
  provider = createLLMProvider({ provider: activeId, apiKey, model });
  // ...
}
```

#### 3. `core/llm/provider.ts` — Align DEFAULT_MODELS with UI

```typescript
// Update to match src/config/models.ts
const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-5.4-mini',          // was 'gpt-5.1'
  anthropic: 'claude-sonnet-4-6',   // was 'claude-sonnet-4-20250514'
  google: 'gemini-3-flash-preview', // unchanged
};

export const AVAILABLE_MODELS: Record<ProviderName, string[]> = {
  openai: ['gpt-5.1-nano', 'gpt-5.4-mini', 'gpt-5.4'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  google: ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
};
```

#### 4. `electron/ipc/channels.ts` — Add model to IPC contract

```typescript
export interface LLMProviderSetRequest {
  channel: 'llm:provider:set';
  payload: {
    providerId: string;
    apiKey: string;
    model?: string; // NEW
  };
}

export interface LLMProviderSetResponse {
  success: boolean;
  activeModel?: string; // NEW
}
```

#### 5. `electron/ipc/handlers.ts` — Pass model through

```typescript
// In the llm:provider:set handler:
const result = await dependencies.llmProvider.setProvider(
  payload.providerId, payload.apiKey, payload.model  // NEW: pass model
);
```

#### 6-7. `electron/preload.ts` + `electron/preload.cjs` — Bridge model

```typescript
// preload.ts
setProvider: (providerId: string, apiKey: string, model?: string) =>
  ipcRenderer.invoke('llm:provider:set', { providerId, apiKey, model }),

// preload.cjs
setProvider: (providerId, apiKey, model) =>
  ipcRenderer.invoke('llm:provider:set', { providerId, apiKey, model }),
```

#### 8. `src/hooks/ipc.ts` — Add model to React hook

```typescript
const setProvider = useCallback(async (providerId: string, apiKey: string, model?: string) => {
  // ...
  const response = await window.electronAPI.setProvider(providerId, apiKey, model);
  // ...
}, []);
```

#### 9. `src/App.tsx` — Pass model from UI (THE KEY FIX)

```typescript
const handleSaveApiKey = async (provider: string, key: string, model?: string) => {
  // ...
  await setProvider(provider, key, model);  // was: setProvider(provider, key)
  // ...
  if (model) {
    settingsStore.setActiveModel(model);  // NEW
  }
  // ...
};
```

#### 10. `electron/utility/index.ts` — Receive model in worker

```typescript
type MessageType =
  // ...
  | { type: 'set-llm-provider'; provider: ProviderName; apiKey: string; model?: string }
  // ...

// In message handler:
if (message.type === 'set-llm-provider') {
  const provider = createLLMProvider({
    provider: message.provider, apiKey: message.apiKey, model: message.model
  });
}
```

#### 11. `src/stores/settings.ts` — Store active model

```typescript
interface SettingsState {
  activeModel?: string;
  setActiveModel: (model: string) => void;
  // ... existing fields
}
```

**Files changed**: 11 | **Lines added**: ~150 | **Breaking changes**: None

---

## Bug 2 (CRITICAL): GLM and Kimi Providers in UI but Not in Backend

- **UI** (`src/config/models.ts`): 5 providers — `openai | anthropic | google | glm | kimi`
- **Backend** (`core/llm/provider.ts`): 3 providers — `openai | anthropic | google`

If a user selects GLM or Kimi:
1. The key format validation in `SettingsManager.validateApiKey` will fail — `patterns['glm']` is `undefined`
2. Even if bypassed, `createLLMProvider` would `throw new Error('Unknown provider')`

**Impact**: GLM and Kimi options are broken — users can't use them at all.

### Solution: Remove GLM and Kimi from UI (1 file)

**Decision**: REMOVE, not add. Rationale:
- API compatibility is unverified (base URLs, auth patterns are speculative)
- Zero existing users affected (they can't work anyway)
- YAGNI — no customer demand for these providers
- A broken feature is worse than no feature

**File**: `src/config/models.ts`

```typescript
// OLD:
export type ProviderId = 'openai' | 'anthropic' | 'google' | 'glm' | 'kimi';

// NEW:
export type ProviderId = 'openai' | 'anthropic' | 'google';
```

Remove the entire GLM and Kimi provider objects from `LLM_PROVIDERS` array, and their entries from `AVAILABLE_MODELS` and `DEFAULT_MODELS` maps.

No backend changes needed — it already only supports 3 providers.

**Risk**: LOW — removing broken functionality, TypeScript catches stale references.

---

## Bug 3 (HIGH): Model IDs Mismatch Between UI and Backend

The model IDs in `src/config/models.ts` don't match `core/llm/provider.ts`:

| Provider | UI (`src/config/models.ts`) | Backend (`core/llm/provider.ts`) |
|----------|----------------------------|----------------------------------|
| Anthropic | `claude-haiku-4-5` | `claude-3-5-haiku-latest` |
| Anthropic | `claude-sonnet-4-6` | `claude-sonnet-4-20250514` |
| Anthropic | `claude-opus-4-6` | `claude-opus-4-20250514` |
| OpenAI | `gpt-5.1-nano` | `gpt-5.1-mini` |
| OpenAI | `gpt-5.4-mini` | `gpt-5.1` |
| OpenAI | `gpt-5.4` | `gpt-5-pro` |
| Google | (all match) | (all match) |

### Solution: Single Source of Truth — `src/config/models.ts` (1 file)

Make `src/config/models.ts` the authoritative source. Backend imports from it instead of maintaining duplicate constants.

**File**: `core/llm/provider.ts`

```typescript
// OLD: Duplicate definitions
const DEFAULT_MODELS: Record<ProviderName, string> = { ... };
export const AVAILABLE_MODELS: Record<ProviderName, string[]> = { ... };

// NEW: Import from single source of truth
import {
  LLM_PROVIDERS,
  DEFAULT_MODELS,
  AVAILABLE_MODELS,
  type ProviderId
} from '../../../src/config/models';

// Re-export for backward compatibility
export type ProviderName = ProviderId;
export { DEFAULT_MODELS, AVAILABLE_MODELS };

// Update getAvailableProviders to filter supported providers
export function getAvailableProviders(): ProviderName[] {
  const SUPPORTED: ProviderId[] = ['openai', 'anthropic', 'google'];
  return LLM_PROVIDERS.filter(p => SUPPORTED.includes(p.id)).map(p => p.id as ProviderName);
}
```

**Why `src/config/models.ts` is the source of truth**:
- Has the correct, current model IDs
- More comprehensive (descriptions, tiers, display names, helper functions)
- Frontend-native, designed for React components
- Backend file imports from frontend (one-way, no circular deps)

**Import path resolution**: `core/llm/provider.ts` → `../../../src/config/models` resolves correctly because Electron main process runs from project root.

**Future-proofing**: Adding a new model means updating only `src/config/models.ts` instead of two files.

---

## Bug 4 (HIGH): Settings Page Doesn't Reflect Current Provider

`SettingsScreen.tsx` initializes state with hardcoded defaults:

```typescript
const [selectedProvider, setSelectedProvider] = useState<ProviderId>('anthropic');
const [selectedTier, setSelectedTier] = useState<ModelTier>('medium');
```

There's no `useEffect` to load the current active provider from the backend. So if a user previously configured Google:
- Settings page still shows **Anthropic** selected
- The tier always shows **medium** regardless of what was saved

### Solution: Thread activeProvider through IPC and props (5 files)

**Approach**: Lift data to `App.tsx` (single source of truth), pass down via props. Add `activeProvider` to the `llm:provider:list` response.

#### 1. `electron/ipc/channels.ts` — Add to response type

```typescript
export interface LLMProviderListResponse {
  providers: Array<{ id: string; name: string; isConfigured: boolean; isValid: boolean }>;
  activeProvider: string | null;  // NEW
}
```

#### 2. `electron/ipc/handlers.ts` — Include in response

```typescript
'llm:provider:list': async () => {
  const providers = await dependencies.llmProvider.listProviders();
  const activeProvider = await dependencies.settings.get('activeProvider');  // NEW
  return { providers, activeProvider };
},
```

#### 3. `src/hooks/ipc.ts` — Track in hook

```typescript
const [activeProvider, setActiveProvider] = useState<string | null>(null);

const listProviders = useCallback(async () => {
  // ... existing fetch ...
  const active = data?.activeProvider ?? null;
  setProviders(providers);
  setActiveProvider(active);  // NEW
  return { providers, activeProvider: active };
}, []);

return { providers, activeProvider, /* ... */ };
```

#### 4. `src/App.tsx` — Extract and pass to SettingsScreen

```typescript
const { providers: llmProviders, activeProvider, listProviders, setProvider, validateProvider } = useLLMProvider();

// In SettingsScreen render:
<SettingsScreen
  activeProvider={activeProvider}
  providers={...}
  onSaveApiKey={handleSaveApiKey}
/>
```

#### 5. `src/components/screens/SettingsScreen.tsx` — Initialize from prop

```typescript
export interface SettingsScreenProps {
  activeProvider?: string | null;  // NEW
  // ... existing props
}

export function SettingsScreen({ activeProvider, ... }: SettingsScreenProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    () => (activeProvider as ProviderId) || 'anthropic'
  );

  // Sync when prop changes
  useEffect(() => {
    if (activeProvider) {
      setSelectedProvider(activeProvider as ProviderId);
      const config = LLM_PROVIDERS.find(p => p.id === activeProvider);
      if (config) setSelectedTier(config.defaultTier);
    }
  }, [activeProvider]);
```

**Edge cases**: No provider configured → defaults to `'anthropic'`. First-time user → no validation checkmarks.

---

## Bug 5 (MEDIUM): `setProvider` Silently Switches Active Provider

`LLMProviderManager.setProvider()` (`core/llm/provider-manager.ts:98`):

```typescript
await this.settingsManager.setActiveProvider(providerId);
```

Every time a user enters an API key, it changes the active provider. There's no separate "select active provider" control. If a user configures OpenAI, then later adds an Anthropic key, it silently switches to Anthropic.

### Solution: Conditional auto-activation — first provider only (1 file)

**Assessment**: This IS a bug, but removing ALL auto-activation breaks first-time users. The correct fix: auto-activate only when no active provider exists.

#### `core/llm/provider-manager.ts` — Conditional activation

```typescript
async setProvider(providerId: ProviderName, apiKey: string, model?: string): Promise<void> {
  // ... validation ...
  await this.settingsManager.setApiKey(providerId, apiKey);

  // Auto-activate ONLY if this is the first provider configured
  const currentActive = await this.settingsManager.getActiveProvider();
  if (!currentActive) {
    await this.settingsManager.setActiveProvider(providerId);
  }

  // ... rest (clear cache, create provider instance) ...
}
```

**DO NOT remove `settingsStore.setActiveProvider(provider)` from App.tsx line 350** — that's UI state sync, separate from backend activation.

**Future enhancement**: Add explicit "Set as Active" button in SettingsScreen + `llm:provider:set-active` IPC channel.

---

## Bug 6 (MEDIUM): Settings Store Doesn't Sync from Backend on Startup

The Zustand store's `activeProvider` is only set locally when the user saves a key (`settingsStore.setActiveProvider(provider)` at `App.tsx:350`). There's no initial sync from the backend's `SettingsManager.persistentActiveProvider` to the UI on startup.

### ~~Solution: Add startup sync hook~~ — SKIPPED

**Reviewer verdict**: Bug 4 already solves this problem. Bug 4 adds `activeProvider` to the `llm:provider:list` response, which is fetched on mount. This is cleaner than a separate sync hook because:
- Single IPC call (no extra `settings:get`)
- No race conditions between two sync paths
- No IPC response unwrapping bugs
- `providerValidationStatus` is already exposed per-provider in the list response

~~The proposed `useProviderSettingsSync` hook is superseded by Bug 4's approach.~~

---

## Data Flow Diagram (Current — Broken)

```
UI (SettingsScreen)
  |  collects: provider, model (tier), apiKey
  v
App.tsx handleSaveApiKey(provider, key, model?)
  |  DROPS model parameter at line 346
  v
hooks/ipc.ts setProvider(providerId, apiKey)
  |  only 2 params
  v
preload.ts -> IPC: llm:provider:set { providerId, apiKey }
  |  no model in payload
  v
handlers.ts -> provider-manager.setProvider(providerId, apiKey)
  |  no model passed
  v
provider-manager -> createLLMProvider({ provider, apiKey })
  |  no model in config
  v
provider.ts -> config.model || DEFAULT_MODELS[provider]
  |  always falls back to hardcoded default
  v
  Uses outdated model IDs that don't match UI config
```

## Data Flow Diagram (After All Fixes)

```
UI (SettingsScreen) — initialized from activeProvider prop
  |  collects: provider, model (tier), apiKey
  v
App.tsx handleSaveApiKey(provider, key, model)
  |  PASSES model through
  v
hooks/ipc.ts setProvider(providerId, apiKey, model)
  |  3 params
  v
preload.ts -> IPC: llm:provider:set { providerId, apiKey, model }
  |  model in payload
  v
handlers.ts -> provider-manager.setProvider(providerId, apiKey, model)
  |  model passed through
  v
provider-manager -> setActiveModel() + createLLMProvider({ provider, apiKey, model })
  |  model persisted and used
  v
provider.ts -> config.model (user's selection)
  v
  Uses correct model ID from src/config/models.ts (single source of truth)
```

---

## Implementation Order

1. **Bug 2** first — Remove GLM/Kimi (5+ files including `src/config/llm-config.ts`, re-evaluate vs completing support)
2. **Bug 3** second — Unify model IDs into single source of truth (1 file, fix import path to `../../src/`, verify build)
3. **Bug 5** third — Auto-activate only first provider, not subsequent ones (conditional activation, not removal)
4. **Bug 1** fourth — Thread model through IPC chain (11 files, callers not factory — `createLLMProvider` already accepts model)
5. **Bug 4** fifth — Sync active provider to UI (5 files, architecture verified correct by review)
6. ~~**Bug 6**~~ — SKIPPED. Bug 4's `activeProvider` in `llm:provider:list` response already solves this cleanly.

**Total files modified**: ~15 (some overlap between bugs)

---

## Review Corrections (from 6 senior code reviewers)

### Bug 1 Corrections
- `createLLMProvider({ provider, apiKey, model? })` already accepts `model` — don't modify the factory, fix the callers
- `settingsStore.setActiveModel()` doesn't exist yet — need complete implementation (state, default, setter)
- `SettingsFile` interface must include `activeModels: Record<string, string>` for persistence
- Add migration logic in `loadFromDisk()` for existing users without `activeModels`
- Conflicts with Bug 5 — Bug 5 should be implemented first

### Bug 2 Corrections
- **Found `src/config/llm-config.ts`** with existing partial GLM implementation (base URL, model IDs) — solution missed this file entirely
- **5+ files need changes**, not 1: `models.ts`, `llm-config.ts`, test files, docs
- Re-evaluate decision: GLM has partial implementation using existing `@ai-sdk/openai` SDK — completing support may be easier than removing
- If removing: also remove `ZAI_GLM_CONFIG` from `llm-config.ts` and `isZaiApi` logic

### Bug 3 Corrections
- **Import path is wrong**: from `core/llm/provider.ts`, path to `src/config/models.ts` is `../../src/config/models` (2 levels up), NOT `../../../src/config/models` (3 levels)
- Alternatively, use path alias `@/config/models` (defined in tsconfig but needs Electron runtime verification)
- **Bug 2 must be done first** — `ProviderId` includes `'glm' | 'kimi'`, so `export type ProviderName = ProviderId` would break backend type safety
- Verify build output: `src/` may compile to `dist/` and `core/` to `dist-electron/` — cross-import may fail at runtime
- Add architecture comment documenting the cross-dependency as intentional

### Bug 4 Corrections
- ✅ `dependencies.settings` IS available in `registerLLMHandlers` scope — reviewer confirmed
- ✅ Onboarding doesn't need changes (first-time setup, correct to use defaults)
- ⚠️ Need to add `activeProvider` to `LLMProviderListResponse` type in channels.ts
- ⚠️ Need to add `activeProvider` state tracking in `useLLMProvider` hook
- ⚠️ Need to add `activeProvider` prop to `SettingsScreenProps` interface

### Bug 5 Corrections
- **DO NOT remove auto-activation entirely** — breaks first-time users
- **DO NOT remove `settingsStore.setActiveProvider(provider)` from App.tsx line 350** — this is UI state sync, separate from backend activation
- Instead: auto-activate ONLY when no active provider exists (first provider)
- ```typescript
  const currentActive = await this.settingsManager.getActiveProvider();
  if (!currentActive) {
    await this.settingsManager.setActiveProvider(providerId);
  }
  ```
- Future: add explicit "Set as Active" UI + IPC channel for switching

### Bug 6 Decision
- **SKIP entirely** — Bug 4 already syncs `activeProvider` via `llm:provider:list` response
- Implementing both creates race conditions (two code paths calling `settingsStore.setActiveProvider()`)
- Bug 4's approach is cleaner: single source of truth, no extra IPC call, no duplication
