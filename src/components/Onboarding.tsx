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
  validationError?: string;
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

function getStepNumber(step: OnboardingStep): number {
  switch (step) {
    case 'welcome': return 1;
    case 'preferences': return 2;
    case 'llm': return 3;
    case 'complete': return 4;
  }
}

/**
 * Onboarding component for first-time user setup.
 * Desktop-optimized design with split-panel layout.
 */
export function Onboarding(props: OnboardingProps): ReactNode {
  const step = getStep(props);
  const stepNumber = getStepNumber(step);

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-surface-muted">
      <div className="w-[720px] h-[540px] bg-surface rounded-2xl border border-border overflow-hidden shadow-modal flex">
        {/* Left Brand Panel */}
        <div className="w-[280px] bg-brand flex flex-col items-center justify-center p-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center">
              <svg
                className="w-8 h-8 text-brand"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
                <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
                <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
                <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
                <path d="M6 18a4 4 0 0 1-1.967-.516" />
                <path d="M19.967 17.484A4 4 0 0 1 18 18" />
              </svg>
            </div>
            <span className="font-display text-[22px] font-bold text-white">TuskerBrain</span>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col p-12 justify-center">
          {step === 'welcome' && <WelcomeStep {...props} />}
          {step === 'preferences' && <PreferencesStep {...props} />}
          {step === 'llm' && <LLMStep {...props} />}
          {step === 'complete' && <CompleteStep {...props} />}

          {/* Step Indicator */}
          <div className="flex gap-2 mt-8 justify-center">
            {[1, 2, 3, 4].map((num) => (
              <div
                key={num}
                className={`h-[6px] rounded-full transition-all duration-200 ${
                  num === stepNumber ? 'w-6 bg-brand' : 'w-[6px] bg-border-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ isConnecting, onConnectGmail }: OnboardingProps): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[28px] font-bold text-text-primary">
          Welcome to TuskerBrain
        </h1>
        <p className="text-[14px] text-text-secondary leading-relaxed max-w-[320px]">
          Your AI-powered Gmail assistant that helps you manage emails intelligently.
          Let's get you set up in just a few steps.
        </p>
      </div>

      <button
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          onConnectGmail?.();
        }}
        disabled={isConnecting}
        className="w-full py-3 px-4 text-[13px] font-semibold rounded-xl bg-brand text-white
                   hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors shadow-button"
      >
        {isConnecting ? 'Connecting...' : 'Connect Gmail Account'}
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          Email Preferences
        </h2>
        <div className="flex items-center gap-2 px-3.5 py-2 bg-surface-hover rounded-lg w-fit">
          <svg className="w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span className="text-[13px] font-medium text-text-primary">{email}</span>
        </div>
      </div>

      <form className="flex flex-col gap-5">
        <div className="bg-surface-card rounded-xl border border-border p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="lookback" className="text-[13px] font-semibold text-text-primary">
              Initial Lookback Period
            </label>
            <select
              id="lookback"
              className="w-full h-11 px-3.5 rounded-xl border border-border-muted bg-surface-card
                         text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                         appearance-none cursor-pointer"
              defaultValue={30}
            >
              {LOOKBACK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="sync-interval" className="text-[13px] font-semibold text-text-primary">
              Sync Interval
            </label>
            <select
              id="sync-interval"
              className="w-full h-11 px-3.5 rounded-xl border border-border-muted bg-surface-card
                         text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
                         appearance-none cursor-pointer"
              defaultValue={30}
            >
              {SYNC_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 justify-between">
          <button
            type="button"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              onGoBack?.();
            }}
            className="px-4 py-2.5 text-[13px] font-semibold rounded-xl border border-border-muted
                       text-text-primary bg-surface-card hover:bg-surface-hover transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="px-4 py-2.5 text-[13px] font-semibold rounded-xl bg-brand text-white
                       hover:bg-brand-600 transition-colors shadow-button"
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

  const isRateLimitError = validationError?.toLowerCase().includes('rate') ||
    validationError?.toLowerCase().includes('quota') ||
    validationError?.toLowerCase().includes('limit') ||
    validationError?.toLowerCase().includes('exceeded');
  const isModelError = validationError?.toLowerCase().includes('model') ||
    validationError?.toLowerCase().includes('not found') ||
    validationError?.toLowerCase().includes('unsupported');

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
    return validationError;
  };

  const providers = [
    { id: 'anthropic' as const, name: 'Anthropic' },
    { id: 'openai' as const, name: 'OpenAI' },
    { id: 'google' as const, name: 'Google' },
  ];

  const tiers = [
    { tier: 'low' as const, label: 'Fast', model: currentModels.find(m => m.tier === 'low')?.name || 'Fast' },
    { tier: 'medium' as const, label: 'Balanced', model: currentModels.find(m => m.tier === 'medium')?.name || 'Balanced' },
    { tier: 'high' as const, label: 'Power', model: currentModels.find(m => m.tier === 'high')?.name || 'Power' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[22px] font-bold text-text-primary">
          AI Provider Setup
        </h2>
        <p className="text-[13px] text-text-secondary">
          Select your preferred AI provider and model
        </p>
      </div>

      <form className="flex flex-col gap-4">
        <div className="bg-surface-card rounded-xl border border-border p-4 flex flex-col gap-3.5">
          {/* Provider Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold text-text-primary">Provider</label>
            <div className="flex gap-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProvider(provider.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-all
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
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* Model Tier Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-semibold text-text-primary">Model Tier</label>
            <div className="flex gap-2">
              {tiers.map((tier) => (
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
                  <span className={`text-[10px]
                    ${selectedTier === tier.tier ? 'text-brand' : 'text-text-muted'}`}
                  >
                    {tier.model}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-2">
            <label htmlFor="api-key" className="text-[12px] font-semibold text-text-primary">
              API Key
            </label>
            <input
              id="api-key"
              type="password"
              placeholder="sk-ant-api03-..."
              className="w-full h-11 px-3.5 rounded-xl border border-border-muted bg-surface-card
                         text-[13px] text-text-primary placeholder:text-text-subtle
                         focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Status Messages */}
          {isValidatingKey && (
            <p className="text-[12px] text-text-muted">Validating API key...</p>
          )}
          {keyValid && (
            <p className="text-[12px] text-green-600">API key is valid</p>
          )}
          {keyInvalid && (
            <div className="flex flex-col gap-1">
              <p className="text-[12px] text-red-600">{getErrorDisplay()}</p>
              {validationError && !isRateLimitError && !isModelError && (
                <p className="text-[10px] text-text-muted">Details: {validationError}</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3 justify-between">
          <button
            type="button"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              onGoBack?.();
            }}
            className="px-4 py-2.5 text-[13px] font-semibold rounded-xl border border-border-muted
                       text-text-primary bg-surface-card hover:bg-surface-hover transition-colors"
          >
            Back
          </button>
          {keyValid ? (
            <button
              type="button"
              onClick={handleContinue}
              className="px-4 py-2.5 text-[13px] font-semibold rounded-xl bg-brand text-white
                         hover:bg-brand-600 transition-colors shadow-button"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isValidatingKey}
              className="px-4 py-2.5 text-[13px] font-semibold rounded-xl bg-brand text-white
                         hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors shadow-button"
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
    <div className="flex flex-col gap-7 items-center text-center">
      {/* Success Icon */}
      <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center shadow-[0_8px_24px_rgba(15,132,138,0.25)]">
        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[28px] font-bold text-text-primary">
          You're All Set!
        </h2>
        <p className="text-[14px] text-text-secondary leading-relaxed max-w-[300px]">
          Your TuskerBrain is configured and ready to intelligently process your emails.
        </p>
      </div>

      <button
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          onStartProcessing?.();
        }}
        className="w-full py-3 px-4 text-[13px] font-semibold rounded-xl bg-brand text-white
                   hover:bg-brand-600 transition-colors shadow-button"
      >
        Start Processing
      </button>
    </div>
  );
}
