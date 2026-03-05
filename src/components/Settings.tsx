import type { ReactNode, FormEvent, MouseEvent } from 'react';

export interface SettingsProps {
  isAuthenticated?: boolean;
  email?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSaveApiKey?: (provider: string, key: string) => void;
}

const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google AI', placeholder: 'AIza...' },
] as const;

/**
 * Settings component for configuring LLM providers and Gmail connection.
 */
export function Settings({
  isAuthenticated = false,
  email,
  onConnect,
  onDisconnect,
  onSaveApiKey,
}: SettingsProps): ReactNode {
  const handleConnect = (e: MouseEvent) => {
    e.preventDefault();
    onConnect?.();
  };

  const handleDisconnect = (e: MouseEvent) => {
    e.preventDefault();
    onDisconnect?.();
  };

  const handleApiKeySubmit = (provider: string, key: string) => {
    onSaveApiKey?.(provider, key);
  };

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto p-6">
      {/* Gmail Connection Section */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Gmail Connection</h2>
        {isAuthenticated ? (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Connected</span>
              <span className="text-sm text-muted-foreground">{email}</span>
            </div>
            <button
              role="button"
              name="disconnect"
              className="px-4 py-2 text-sm rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Not Connected</span>
              <span className="text-sm text-muted-foreground">
                Connect your Gmail account to start processing emails
              </span>
            </div>
            <button
              role="button"
              name="connect"
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleConnect}
            >
                Connect
            </button>
          </div>
        )}
      </section>

      {/* LLM Provider Settings Section */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">LLM Providers</h2>
        <p className="text-sm text-muted-foreground">
              Configure your AI provider API keys. Keys are stored locally and encrypted.
        </p>
        {LLM_PROVIDERS.map((provider) => (
          <ProviderSetting
            key={provider.id}
            provider={provider}
            onSave={handleApiKeySubmit}
          />
        ))}
      </section>
    </div>
  );
}

interface ProviderSettingProps {
  provider: { id: string; name: string; placeholder: string };
  onSave: (provider: string, key: string) => void;
}

function ProviderSetting({
  provider,
  onSave,
}: ProviderSettingProps): ReactNode {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    if (input?.value) {
      onSave(provider.id, input.value);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounded-lg border"
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between">
        <label className="font-medium" htmlFor={`${provider.id}-key`}>
          {provider.name}
        </label>
        <button
          type="submit"
          role="button"
          className="px-3 py-1 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
      </div>
      <input
        id={`${provider.id}-key`}
        type="password"
        placeholder={`API Key (${provider.placeholder})`}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </form>
  );
}
