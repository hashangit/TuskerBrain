import type { ReactNode } from 'react';
import { useState } from 'react';
import { Card, Button, Select } from '../ui';
import { LLM_PROVIDERS, getAvailableModels, type ProviderId, type ModelTier } from '../../config/models';

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
  onSaveApiKey?: (provider: string, key: string, model?: string) => void;

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
  providers = [],
  onSaveApiKey,
  version = '1.0.0',
}: SettingsScreenProps): ReactNode {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('anthropic');
  const [selectedTier, setSelectedTier] = useState<ModelTier>('medium');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const currentModels = getAvailableModels(selectedProvider);
  const selectedModel = currentModels.find(m => m.tier === selectedTier);

  const providerConfig = LLM_PROVIDERS.find(p => p.id === selectedProvider);
  const providerStatus = providers.find(p => p.id === selectedProvider);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    try {
      onSaveApiKey?.(selectedProvider, apiKey.trim(), selectedModel?.id);
      setApiKey('');
    } finally {
      setIsSaving(false);
    }
  };

  const tiers = [
    { tier: 'low' as const, label: 'Fast', description: 'Quick & cost-effective' },
    { tier: 'medium' as const, label: 'Balanced', description: 'Best value' },
    { tier: 'high' as const, label: 'Power', description: 'Most capable' },
  ];

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
        <h2 className="font-display font-semibold text-text-primary mb-2">AI Provider</h2>
        <p className="text-[13px] text-text-muted mb-4">
          Select your preferred AI provider and model. Keys are stored locally and encrypted.
        </p>

        <div className="flex flex-col gap-4">
          {/* Provider Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold text-text-primary">Provider</label>
            <div className="flex gap-2">
              {LLM_PROVIDERS.map((provider) => {
                const status = providers.find(p => p.id === provider.id);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => setSelectedProvider(provider.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-all
                      ${selectedProvider === provider.id
                        ? 'bg-surface-hover border-2 border-brand text-brand'
                        : 'bg-surface-card border border-border-muted text-text-primary hover:bg-surface-hover'
                      }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center
                      ${selectedProvider === provider.id ? 'bg-brand' : 'border border-border-muted'}`}
                    >
                      {selectedProvider === provider.id && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </span>
                    <span>{provider.name.split(' ')[0]}</span>
                    {status?.isValid && (
                      <span className="text-[9px] text-green-600 font-medium">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Tier Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold text-text-primary">Model Tier</label>
            <div className="flex gap-2">
              {tiers.map((tier) => {
                const model = currentModels.find(m => m.tier === tier.tier);
                return (
                  <button
                    key={tier.tier}
                    type="button"
                    onClick={() => setSelectedTier(tier.tier)}
                    className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-lg transition-all
                      ${selectedTier === tier.tier
                        ? 'bg-surface-hover border-2 border-brand'
                        : 'bg-surface-card border border-border-muted hover:bg-surface-hover'
                      }`}
                  >
                    <span className={`text-[11px] font-semibold
                      ${selectedTier === tier.tier ? 'text-brand' : 'text-text-primary'}`}
                    >
                      {tier.label}
                    </span>
                    <span className={`text-[10px] text-center
                      ${selectedTier === tier.tier ? 'text-brand' : 'text-text-muted'}`}
                    >
                      {model?.name || tier.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Key Input */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold text-text-primary">API Key</label>
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={providerConfig?.placeholder || 'API Key'}
                className="flex-1 h-10 px-3.5 text-[13px] bg-white rounded-lg border border-border-muted
                           focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <Button
                size="sm"
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim() || isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {providerStatus?.isValid && (
              <p className="text-[11px] text-green-600 flex items-center gap-1">
                <span>✓</span> API key validated
              </p>
            )}
            {providerStatus?.hasKey && !providerStatus?.isValid && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1">
                <span>⚠</span> API key set but not validated
              </p>
            )}
          </div>
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
