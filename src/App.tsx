import { useState, useEffect, useCallback } from 'react';
import { Timeline } from './components/Timeline';
import { TopicList } from './components/TopicList';
import { DealsList, type Deal } from './components/DealsList';
import { Settings } from './components/Settings';
import { Onboarding } from './components/Onboarding';
import type { TimelineUpdate } from './components/Timeline';
import { useGmailOAuth, useSync, useSettings, useLLMProvider, useJobQueue } from './hooks/ipc';
import { useSettingsStore } from './stores/settings';
import { useTimelineStore } from './stores/timeline';
import { useJobsStore } from './stores/jobs';

// Navigation component
function Navigation({ currentPath, syncStatus }: { currentPath: string; syncStatus?: { isRunning: boolean; progress?: { processed: number; total: number } } }) {
  const navItems = [
    { path: '/timeline', label: 'Timeline' },
    { path: '/topics', label: 'Topics' },
    { path: '/deals', label: 'Deals' },
    { path: '/settings', label: 'Settings' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold text-blue-600">TuskerBrain</span>
            {syncStatus?.isRunning && (
              <span className="text-xs text-gray-500 ml-2">
                Syncing... {syncStatus.progress?.processed || 0}/{syncStatus.progress?.total || 0}
              </span>
            )}
          </div>
          <div className="flex space-x-1">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={`#${item.path}`}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentPath === item.path
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

// Main layout wrapper
function Layout({ children, path, syncStatus }: { children: React.ReactNode; path: string; syncStatus?: { isRunning: boolean; progress?: { processed: number; total: number } } }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPath={path} syncStatus={syncStatus} />
      <main className="max-w-7xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}

// Loading spinner component
function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
      <p className="text-gray-500">{message}</p>
    </div>
  );
}

// Error display component
function ErrorDisplay({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <p className="text-red-700">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// Timeline page with real data
function TimelinePage() {
  const { updates, isLoading, error, setFilter, setLoading, setError, setUpdates } = useTimelineStore();

  // Fetch timeline updates from IPC
  useEffect(() => {
    const loadTimeline = async () => {
      setLoading(true);
      try {
        const result = await window.electronAPI.listTimelineUpdates();
        if (result.success && result.data) {
          setUpdates(result.data.updates.map((u: any) => ({
            id: u.id,
            emailId: u.emailId,
            title: u.title,
            description: u.description || undefined,
            summary: u.summary || undefined,
            priority: u.priority || undefined,
            sentiment: u.sentiment || undefined,
            urgency: u.urgency || false,
            actionItem: u.actionItem || false,
            actionItemTitle: u.actionItemTitle || undefined,
            followUpDate: u.followUpDate || undefined,
            financialImpact: u.financialImpact || undefined,
            keyEntities: u.keyEntities || undefined,
            createdAt: u.createdAt,
          })));
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timeline');
      } finally {
        setLoading(false);
      }
    };
    loadTimeline();
  }, [setUpdates, setLoading, setError]);

  const handleFilterChange = useCallback((filter: { priority?: 'high' | 'medium' | 'low' }) => {
    setFilter(filter);
  }, [setFilter]);

  if (isLoading && updates.length === 0) {
    return <LoadingSpinner message="Loading timeline..." />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (updates.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No timeline updates yet.</p>
        <p className="text-sm mt-2">Process some emails to see updates here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Timeline</h1>
        <div className="flex space-x-2">
          <select
            onChange={(e) => handleFilterChange({ priority: e.target.value as 'high' | 'medium' | 'low' | undefined })}
            className="text-sm border rounded-md px-2 py-1"
          >
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <Timeline updates={updates.map(u => ({
        id: u.id,
        title: u.title,
        description: u.description || undefined,
        priority: u.priority || undefined,
        createdAt: new Date(u.createdAt),
        emailId: u.emailId,
      }))} />
    </div>
  );
}

// Topics page with real data
function TopicsPage() {
  const [topics, setTopics] = useState<Array<{
    id: string;
    name: string;
    fullPath: string;
    emailCount: number;
    summary?: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load topics from IPC
    const loadTopics = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.listTopics();
        if (result.success && result.data) {
          setTopics(result.data.topics);
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load topics');
      } finally {
        setIsLoading(false);
      }
    };
    loadTopics();
  }, []);

  if (isLoading) {
    return <LoadingSpinner message="Loading topics..." />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No topics yet.</p>
        <p className="text-sm mt-2">Process some emails to see topics here.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Topics</h1>
      <TopicList topics={topics} />
    </div>
  );
}

// Deals page with real data
function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  useEffect(() => {
    const loadDeals = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.listDeals({ activeOnly: showOnlyActive });
        if (result.success && result.data) {
          setDeals(result.data.deals.map((d: any) => ({
            id: d.id,
            brand: d.brandName || 'Unknown',
            title: d.dealTitle,
            code: d.dealCode || null,
            expiry: d.dealExpiry ? new Date(d.dealExpiry) : null,
            isActive: d.isActive,
          })));
        } else if (result.error) {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deals');
      } finally {
        setIsLoading(false);
      }
    };
    loadDeals();
  }, [showOnlyActive]);

  if (isLoading) {
    return <LoadingSpinner message="Loading deals..." />;
  }

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  if (deals.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No deals yet.</p>
        <p className="text-sm mt-2">Process promotional emails to see deals here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showOnlyActive}
            onChange={(e) => setShowOnlyActive(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-600">Show only active</span>
        </label>
      </div>
      <DealsList deals={deals} showOnlyActive={showOnlyActive} />
    </div>
  );
}

// Check if user has completed onboarding
function useOnboardingStatus() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const { getSetting, setSetting } = useSettings();

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const onboarded = await getSetting<boolean>('onboarding_complete');
        setIsOnboarded(onboarded === true);
      } catch {
        // If we can't get the setting, check localStorage as fallback
        const localOnboarded = localStorage.getItem('tuskerbrain_onboarded');
        setIsOnboarded(localOnboarded === 'true');
      }
    };
    checkOnboarding();
  }, [getSetting]);

  const completeOnboarding = useCallback(async () => {
    try {
      await setSetting('onboarding_complete', true);
    } catch {
      // Fallback to localStorage
      localStorage.setItem('tuskerbrain_onboarded', 'true');
    }
    setIsOnboarded(true);
  }, [setSetting]);

  return { isOnboarded, setIsOnboarded: completeOnboarding };
}

export default function App() {
  const { isOnboarded, setIsOnboarded } = useOnboardingStatus();
  const [currentPath, setCurrentPath] = useState(window.location.hash.slice(1) || '/timeline');
  const [onboardingStep, setOnboardingStep] = useState<
    'welcome' | 'preferences' | 'llm' | 'complete'
  >('welcome');

  // OAuth state
  const {
    isAuthenticated: gmailConnected,
    email: gmailEmail,
    isLoading: isOAuthLoading,
    startOAuth,
    handleCallback,
    checkStatus,
  } = useGmailOAuth();

  // LLM state
  const {
    providers,
    setProvider,
    validateProvider,
    isLoading: isLLMLoading,
  } = useLLMProvider();

  // Sync state
  const { status: syncStatus, startSync, getSyncStatus } = useSync();

  // Settings store
  const settingsStore = useSettingsStore();

  // Local state for onboarding flow
  const [preferencesSet, setPreferencesSet] = useState(false);
  const [keyValid, setKeyValid] = useState(false);
  const [keyInvalid, setKeyInvalid] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Simple hash-based routing for Electron
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash.slice(1) || '/timeline');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Check auth status on load
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Poll sync status periodically
  useEffect(() => {
    if (isOnboarded) {
      getSyncStatus();
      const interval = setInterval(getSyncStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isOnboarded, getSyncStatus]);

  // Handle OAuth callback from URL
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const hash = window.location.hash;
      if (hash.includes('code=')) {
        const params = new URLSearchParams(hash.split('?')[1] || hash.split('&')[0]);
        const code = params.get('code');
        const state = params.get('state');
        if (code && state) {
          await handleCallback(code, state);
          window.location.hash = '/timeline';
        }
      }
    };
    handleOAuthCallback();
  }, [handleCallback]);

  // Show loading state while checking onboarding status
  if (isOnboarded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner message="Loading TuskerBrain..." />
      </div>
    );
  }

  // Handle Gmail connection
  const handleConnectGmail = async () => {
    try {
      const result = await startOAuth(3000);
      if (result?.authUrl) {
        // Open OAuth URL in browser
        window.open(result.authUrl, '_blank');

        // Start polling for auth status (backend handles callback directly)
        const pollInterval = setInterval(async () => {
          const status = await checkStatus();
          if (status?.isAuthenticated) {
            clearInterval(pollInterval);
          }
        }, 2000);

        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
      }
    } catch (error) {
      console.error('Failed to start OAuth:', error);
    }
  };

  // Handle preferences save
  const handleSetPreferences = (prefs: { lookbackDays: number; syncIntervalMinutes: number; autoSync?: boolean }) => {
    settingsStore.setLookbackDays(prefs.lookbackDays);
    if (prefs.autoSync !== undefined) {
      settingsStore.setAutoSync(prefs.autoSync);
    }
    setPreferencesSet(true);
    setOnboardingStep('llm');
  };

  // Handle API key save
  const handleSaveApiKey = async (provider: string, key: string, model?: string) => {
    console.log('[App] handleSaveApiKey called with provider:', provider, 'model:', model);
    setIsValidatingKey(true);
    setKeyInvalid(false);
    setValidationError(null);
    try {
      // First save the key
      console.log('[App] Calling setProvider...');
      await setProvider(provider, key);
      console.log('[App] setProvider done, calling validateProvider...');
      // Then validate it
      const result = await validateProvider(provider);
      console.log('[App] validateProvider result:', result);
      if (result?.isValid) {
        setKeyValid(true);
        settingsStore.setActiveProvider(provider);
        settingsStore.setApiKeyValid(true);
      } else {
        setKeyInvalid(true);
        setValidationError(result?.error || 'Validation failed');
      }
    } catch (error) {
      console.error('[App] Failed to validate API key:', error);
      setKeyInvalid(true);
      setValidationError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsValidatingKey(false);
    }
  };

  // Handle starting processing
  const handleStartProcessing = async () => {
    setOnboardingStep('complete');
    // Start initial sync
    try {
      await startSync(settingsStore.lookbackDays, false);
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
    // Mark onboarding as complete
    await setIsOnboarded();
  };

  // Show onboarding if not completed
  if (!isOnboarded) {
    return (
      <Onboarding
        isConnecting={isOAuthLoading}
        onConnectGmail={handleConnectGmail}
        gmailConnected={gmailConnected}
        email={gmailEmail || 'user@example.com'}
        onSetPreferences={handleSetPreferences}
        preferencesSet={preferencesSet}
        isValidatingKey={isValidatingKey}
        keyValid={keyValid}
        keyInvalid={keyInvalid}
        validationError={validationError}
        onSaveApiKey={handleSaveApiKey}
        onContinueAfterKeyValid={() => setOnboardingStep('complete')}
        setupComplete={onboardingStep === 'complete'}
        onStartProcessing={handleStartProcessing}
        onGoBack={() => {
          if (onboardingStep === 'preferences') setOnboardingStep('welcome');
          if (onboardingStep === 'llm') setOnboardingStep('preferences');
          if (onboardingStep === 'complete') setOnboardingStep('llm');
        }}
      />
    );
  }

  // Render current page based on path
  const renderPage = () => {
    switch (currentPath) {
      case '/timeline':
        return <TimelinePage />;
      case '/topics':
        return <TopicsPage />;
      case '/deals':
        return <DealsPage />;
      case '/settings':
        return <Settings />;
      default:
        window.location.hash = '/timeline';
        return <TimelinePage />;
    }
  };

  return (
    <Layout path={currentPath} syncStatus={syncStatus || undefined}>
      {renderPage()}
    </Layout>
  );
}
