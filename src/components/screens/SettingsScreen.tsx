import type { ReactNode } from 'react';
import { Card, Button, Select, Input } from '../ui';

export interface SettingsScreenProps {
  // Gmail Connection
  isAuthenticated?: boolean;
  email?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;

  // Processing Preferences
  lookbackDays?: number;
  syncInterval?: number;
  onLookbackChange?: (days: number) => void;
  onSyncIntervalChange?: (minutes: number) => void;

  // LLM Providers
  providers?: Array<{
    id: string;
    name: string;
    hasKey?: boolean;
    isValid?: boolean;
  }>;
  onSaveApiKey?: (provider: string, key: string) => void;

  // App Info
  version?: string;
}

/**
 * SettingsScreen matching TuskerBrain design system.
 */
export function SettingsScreen({
  isAuthenticated = false,
  email,
  onConnect,
  onDisconnect,
  lookbackDays = 30,
  syncInterval = 30,
  onLookbackChange,
  onSyncIntervalChange,
  providers = [
    { id: 'openai', name: 'OpenAI' },
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'google', name: 'Google AI' },
  ],
  onSaveApiKey,
  version = '1.0.0',
}: SettingsScreenProps): ReactNode {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <h1 className="font-display text-2xl font-bold text-text-primary">Settings</h1>

      {/* Gmail Connection Section */}
      <Card padding="lg">
        <h2 className="font-display font-semibold text-text-primary mb-4">Gmail Connection</h2>

        <div className="flex items-center justify-between p-4 bg-surface rounded-lg border border-border">
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <div className="w-3 h-3 rounded-full bg-brand" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Connected</p>
                  <p className="text-sm text-text-muted">{email}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-3 h-3 rounded-full bg-border" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Not Connected</p>
                  <p className="text-sm text-text-muted">Connect your Gmail account to start</p>
                </div>
              </>
            )}
          </div>

          {isAuthenticated ? (
            <Button variant="ghost" onClick={onDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={onConnect}>
              Connect
            </Button>
          )}
        </div>
      </Card>

      {/* Processing Preferences Section */}
      <Card padding="lg">
        <h2 className="font-display font-semibold text-text-primary mb-4">Processing Preferences</h2>

        <div className="flex flex-col gap-4">
          {/* Initial Lookback Period */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Initial lookback period</span>
            <Select
              value={lookbackDays.toString()}
              onChange={(e) => onLookbackChange?.(parseInt(e.target.value))}
              options={[
                { value: '7', label: '7 days' },
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
                { value: '60', label: '60 days' },
                { value: '90', label: '90 days' },
              ]}
              className="w-[160px]"
            />
          </div>

          {/* Sync Interval */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Sync interval</span>
            <Select
              value={syncInterval.toString()}
              onChange={(e) => onSyncIntervalChange?.(parseInt(e.target.value))}
              options={[
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
                { value: '60', label: '1 hour' },
                { value: '120', label: '2 hours' },
                { value: '1440', label: 'Daily' },
              ]}
              className="w-[160px]"
            />
          </div>
        </div>
      </Card>

      {/* LLM Providers Section */}
      <Card padding="lg">
        <h2 className="font-display font-semibold text-text-primary mb-2">LLM Providers</h2>
        <p className="text-[13px] text-text-muted mb-4">
          Keys are stored locally and encrypted.
        </p>

        <div className="flex flex-col gap-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between p-3.5 bg-surface rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-text-primary">{provider.name}</span>
                {provider.hasKey && provider.isValid && (
                  <span className="text-[10px] text-brand font-medium px-1.5 py-0.5 bg-brand-50 rounded">
                    Validated
                  </span>
                )}
              </div>

              <form
                className="flex items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const input = form.querySelector('input') as HTMLInputElement;
                  if (input?.value) {
                    onSaveApiKey?.(provider.id, input.value);
                    input.value = '';
                  }
                }}
              >
                <input
                  type="password"
                  placeholder="API Key"
                  className="h-9 w-[200px] px-3 text-sm bg-white rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <Button size="sm" type="submit">
                  Save
                </Button>
              </form>
            </div>
          ))}
        </div>
      </Card>

      {/* About Section */}
      <Card padding="lg">
        <h2 className="font-display font-semibold text-text-primary mb-4">About TuskerBrain</h2>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Version</span>
            <span className="text-sm text-text-muted">{version}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">License</span>
            <span className="text-sm text-text-muted">MIT Open Source</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
