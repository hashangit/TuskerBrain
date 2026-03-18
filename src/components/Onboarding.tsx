import type { ReactNode, MouseEvent } from 'react';
import { useState } from 'react';
import { LLM_PROVIDERS, getAvailableModels, type ProviderId, type ModelConfig } from '../config/models';

export interface OnboardingProps {
  // Step 1: Welcome
  isConnecting?: boolean;
  onConnectGmail?: () => void;

  // Step 2: Preferences
  gmailConnected?: boolean;
  email?: string;
  onSetPreferences?: (prefs: { lookbackDays: number; syncIntervalMinutes: number }) => void;

  // Step 3: LLM Provider
  preferencesSet?: boolean;
  isValidatingKey?: boolean;
  keyValid?: boolean;
  keyInvalid?: boolean;
  validationError?: string; // Actual error message from API
  onSaveApiKey?: (provider: string, key: string, model?: string) => void;
  onContinueAfterKeyValid?: () => void;

  // Step 4: Complete
  setupComplete?: boolean;
  onStartProcessing?: () => void;

  // Navigation
  onGoBack?: () => void;
}

const LOOKBACK_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
];

const SYNC_INTERVAL_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 1440, label: 'Daily' },
];

type OnboardingStep = 'welcome' | 'preferences' | 'llm' | 'complete';

function getStep(props: OnboardingProps): OnboardingStep {
  if (props.setupComplete) return 'complete';
  if (props.preferencesSet) return 'llm';
  if (props.gmailConnected) return 'preferences';
  return 'welcome';
}

/**
 * Onboarding component for first-time user setup.
 */
export function Onboarding(props: OnboardingProps): ReactNode {
  const step = getStep(props);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md space-y-8">
        {step === 'welcome' && <WelcomeStep {...props} />}
        {step === 'preferences' && <PreferencesStep {...props} />}
        {step === 'llm' && <LLMStep {...props} />}
        {step === 'complete' && <CompleteStep {...props} />}
      </div>
    </div>
  );
}

function WelcomeStep({ isConnecting, onConnectGmail }: OnboardingProps): ReactNode {
  return (
    <div className="text-center space-y-6">
      <h1 className="text-3xl font-bold">Welcome to TuskerBrain</h1>
      <p className="text-muted-foreground">
        Your AI-powered Gmail assistant. Let's get you set up.
      </p>
      <button
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          onConnectGmail?.();
        }}
        disabled={isConnecting}
        className="w-full px-4 py-3 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isConnecting ? 'Connecting...' : 'Connect Gmail'}
      </button>
    </div>
  );
}

function PreferencesStep({
  email,
  onSetPreferences,
  onGoBack,
}: OnboardingProps): ReactNode {
  const handleContinue = (e: MouseEvent) => {
    e.preventDefault();
    const form = (e.target as HTMLButtonElement).closest('form');
    const lookbackSelect = form?.querySelector('#lookback') as HTMLSelectElement;
    const syncSelect = form?.querySelector('#sync-interval') as HTMLSelectElement;

    onSetPreferences?.({
      lookbackDays: parseInt(lookbackSelect?.value || '30', 10),
      syncIntervalMinutes: parseInt(syncSelect?.value || '30', 10),
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Setup Preferences</h2>
        <p className="text-sm text-muted-foreground">Connected as {email}</p>
      </div>

      <form className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="lookback" className="text-sm font-medium">
            Initial Lookback Period
          </label>
          <select
            id="lookback"
            className="w-full h-10 px-3 rounded-md border border-input bg-background"
            defaultValue={30}
          >
            {LOOKBACK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="sync-interval" className="text-sm font-medium">
            Sync Interval
          </label>
          <select
            id="sync-interval"
            className="w-full h-10 px-3 rounded-md border border-input bg-background"
            defaultValue={30}
          >
            {SYNC_INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              onGoBack?.();
            }}
            className="flex-1 px-4 py-2 text-sm rounded-md border border-input hover:bg-muted"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="flex-1 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

function LLMStep({
  isValidatingKey,
  keyValid,
  keyInvalid,
  validationError,
  onSaveApiKey,
  onGoBack,
  onContinueAfterKeyValid,
}: OnboardingProps): ReactNode {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('anthropic');
  const [selectedTier, setSelectedTier] = useState<'low' | 'medium' | 'high'>('medium');

  const handleSubmit = (e: MouseEvent) => {
    e.preventDefault();
    const form = (e.target as HTMLButtonElement).closest('form');
    const keyInput = form?.querySelector('#api-key') as HTMLInputElement;

    const models = getAvailableModels(selectedProvider);
    const selectedModel = models.find(m => m.tier === selectedTier);

    if (keyInput?.value) {
      onSaveApiKey?.(selectedProvider, keyInput.value, selectedModel?.id);
    }
  };

  const handleContinue = (e: MouseEvent) => {
    e.preventDefault();
    onContinueAfterKeyValid?.();
  };

  const currentModels = getAvailableModels(selectedProvider);
  const selectedModel = currentModels.find(m => m.tier === selectedTier);

  // Detect if error is rate limit or model related
  const isRateLimitError = validationError?.toLowerCase().includes('rate') ||
    validationError?.toLowerCase().includes('quota') ||
    validationError?.toLowerCase().includes('limit') ||
    validationError?.toLowerCase().includes('exceeded');
  const isModelError = validationError?.toLowerCase().includes('model') ||
    validationError?.toLowerCase().includes('not found') ||
    validationError?.toLowerCase().includes('unsupported');

  // Determine error type for better messaging
  const getErrorDisplay = () => {
    if (!keyInvalid || !validationError) return 'API key is invalid';

    if (isRateLimitError) {
      return 'Rate limit exceeded. Try selecting a different tier or wait a moment.';
    }
    if (isModelError) {
      return 'Model error. Try selecting a different tier.';
    }
    if (validationError.toLowerCase().includes('invalid') ||
        validationError.toLowerCase().includes('unauthorized') ||
        validationError.toLowerCase().includes('api key')) {
      return 'Invalid API key. Please check your key and try again.';
    }
    // Return the actual error for other cases
    return validationError;
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose LLM Provider</h2>
        <p className="text-sm text-muted-foreground">
          Select your AI provider and model tier
        </p>
      </div>

      <form className="space-y-4">
        {/* Provider Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <div className="space-y-1">
            {LLM_PROVIDERS.slice(0, 3).map((provider) => (
              <label
                key={provider.id}
                className="flex items-center gap-3 p-3 rounded-md border border-input cursor-pointer hover:bg-muted"
              >
                <input
                  type="radio"
                  name="provider"
                  value={provider.id}
                  checked={selectedProvider === provider.id}
                  onChange={() => setSelectedProvider(provider.id as ProviderId)}
                  className="h-4 w-4"
                />
                <span className="font-medium">{provider.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Model Tier Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Model Tier</label>
          <div className="grid grid-cols-3 gap-2">
            {currentModels.map((model) => (
              <label
                key={model.id}
                className={`flex flex-col p-3 rounded-md border cursor-pointer hover:bg-muted ${
                  selectedTier === model.tier ? 'border-primary bg-muted' : 'border-input'
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value={model.tier}
                  checked={selectedTier === model.tier}
                  onChange={() => setSelectedTier(model.tier)}
                  className="sr-only"
                />
                <span className="font-medium text-sm capitalize">{model.tier}</span>
                <span className="text-xs text-muted-foreground">{model.name}</span>
              </label>
            ))}
          </div>
          {selectedModel && (
            <p className="text-xs text-muted-foreground">{selectedModel.description}</p>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <label htmlFor="api-key" className="text-sm font-medium">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            placeholder={LLM_PROVIDERS.find(p => p.id === selectedProvider)?.placeholder || 'API Key'}
            className="w-full h-10 px-3 rounded-md border border-input bg-background"
          />
        </div>

        {/* Status Messages */}
        {isValidatingKey && (
          <p className="text-sm text-muted-foreground">Validating API key...</p>
        )}
        {keyValid && (
          <p className="text-sm text-green-600">API key is valid</p>
        )}
        {keyInvalid && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{getErrorDisplay()}</p>
            {validationError && !isRateLimitError && !isModelError && (
              <p className="text-xs text-muted-foreground">Details: {validationError}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              onGoBack?.();
            }}
            className="flex-1 px-4 py-2 text-sm rounded-md border border-input hover:bg-muted"
          >
            Back
          </button>
          {keyValid ? (
            <button
              type="button"
              onClick={handleContinue}
              className="flex-1 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isValidatingKey}
              className="flex-1 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save Key
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function CompleteStep({ onStartProcessing }: OnboardingProps): ReactNode {
  return (
    <div className="text-center space-y-6">
      <h2 className="text-2xl font-bold">Ready to Start!</h2>
      <p className="text-muted-foreground">
        Your TuskerBrain is configured and ready to process your emails.
      </p>
      <button
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          onStartProcessing?.();
        }}
        className="w-full px-4 py-3 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Start Processing
      </button>
    </div>
  );
}
