import type { ReactNode, MouseEvent } from 'react';

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
  onSaveApiKey?: (provider: string, key: string) => void;
  onContinueAfterKeyValid?: () => void;

  // Step 4: Complete
  setupComplete?: boolean;
  onStartProcessing?: () => void;

  // Navigation
  onGoBack?: () => void;
}

const LLM_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google AI', placeholder: 'AIza...' },
] as const;

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
  onSaveApiKey,
  onGoBack,
  onContinueAfterKeyValid,
}: OnboardingProps): ReactNode {
  const handleSubmit = (e: MouseEvent) => {
    e.preventDefault();
    const form = (e.target as HTMLButtonElement).closest('form');
    const providerInput = form?.querySelector('input[name="provider"]:checked') as HTMLInputElement;
    const keyInput = form?.querySelector('#api-key') as HTMLInputElement;

    if (providerInput?.value && keyInput?.value) {
      onSaveApiKey?.(providerInput.value, keyInput.value);
    }
  };

  const handleContinue = (e: MouseEvent) => {
    e.preventDefault();
    onContinueAfterKeyValid?.();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Choose LLM Provider</h2>
        <p className="text-sm text-muted-foreground">
          Select your preferred AI provider and enter your API key
        </p>
      </div>

      <form className="space-y-4">
        <div className="space-y-2">
          {LLM_PROVIDERS.map((provider) => (
            <label
              key={provider.id}
              className="flex items-center gap-3 p-3 rounded-md border border-input cursor-pointer hover:bg-muted"
            >
              <input
                type="radio"
                name="provider"
                value={provider.id}
                defaultChecked={provider.id === 'openai'}
                className="h-4 w-4"
              />
              <span className="font-medium">{provider.name}</span>
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="api-key" className="text-sm font-medium">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            placeholder="API Key (sk-...)"
            className="w-full h-10 px-3 rounded-md border border-input bg-background"
          />
        </div>

        {isValidatingKey && (
          <p className="text-sm text-muted-foreground">Validating API key...</p>
        )}
        {keyValid && (
          <p className="text-sm text-green-600">API key is valid</p>
        )}
        {keyInvalid && (
          <p className="text-sm text-destructive">API key is invalid</p>
        )}

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
