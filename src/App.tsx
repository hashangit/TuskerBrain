import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from './components/AppShell';
import {
  TimelineScreen,
  TopicsScreen,
  SendersScreen,
  DealsScreen,
  SettingsScreen,
  type TimelineCardData,
  type TopicData,
  type SenderData,
  type DealData,
} from './components/screens';
import { toDealDataList } from './hooks/dealData';
import {
  EmailDetailView,
  TopicDetailView,
  SenderDetailView,
  type EmailDetailData,
  type TopicDetailData,
  type SenderDetailData,
} from './components/views';
import { Onboarding } from './components/Onboarding';
import { useGmailOAuth, useSync, useLLMProvider, useSyncProgress } from './hooks/ipc';
import { useDealMutations } from './hooks/useDealMutations';
import { useSyncIndicator } from './hooks/useSyncIndicator';
import { useSettingsStore } from './stores/settings';
import {
  getMockDealsData,
  getMockEmailDetail,
  getMockMonthStats,
  getMockSenderDetail,
  getMockSendersData,
  getMockTimelineData,
  getMockTopicDetail,
  getMockTopicsData,
  getMockWeekSenders,
  getMockYearStats,
} from './fixtures/mockAppData';

// View state type
type ViewType =
  | { type: 'list'; screen: 'timeline' | 'topics' | 'senders' | 'deals' | 'settings' }
  | { type: 'email'; data: EmailDetailData }
  | { type: 'topic'; data: TopicDetailData }
  | { type: 'sender'; data: SenderDetailData };

// Loading spinner component
function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mb-4" />
      <p className="text-text-muted">{message}</p>
    </div>
  );
}

// Check if running in Electron or browser
const isElectron = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';

type OAuthStartResult =
  | Awaited<ReturnType<ReturnType<typeof useGmailOAuth>['startOAuth']>>
  | { data?: { authUrl?: string } };

function getOAuthAuthUrl(result: OAuthStartResult) {
  if (!result) return undefined;
  if ('authUrl' in result) return result.authUrl;
  if ('data' in result) {
    return result.data?.authUrl;
  }
  return undefined;
}

// Check if user has completed onboarding
function useOnboardingStatus() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    const checkOnboarding = async () => {
      // In browser mode (not Electron), skip onboarding and show app with mock data
      if (!isElectron) {
        console.log('[App] Running in browser mode, skipping onboarding');
        setIsOnboarded(true);
        return;
      }

      try {
        const response = await window.electronAPI.getSetting('onboarding_complete') as { success?: boolean; data?: { value: unknown } };
        // Unwrap the IPC response - handler wraps in { success, data }
        const data = response && typeof response === 'object' && 'success' in response && 'data' in response
          ? response.data
          : response;
        setIsOnboarded((data as { value: unknown })?.value === true);
      } catch {
        const localOnboarded = localStorage.getItem('tuskerbrain_onboarded');
        setIsOnboarded(localOnboarded === 'true');
      }
    };
    checkOnboarding();
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      if (isElectron) {
        await window.electronAPI.setSetting('onboarding_complete', true);
      }
    } catch {
      localStorage.setItem('tuskerbrain_onboarded', 'true');
    }
    setIsOnboarded(true);
  }, []);

  return { isOnboarded, setIsOnboarded: completeOnboarding };
}

export default function App() {
  const { isOnboarded, setIsOnboarded } = useOnboardingStatus();
  const [currentPath, setCurrentPath] = useState(window.location.hash.slice(1) || '/timeline');
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'preferences' | 'llm' | 'complete'>('welcome');

  // View state for navigation
  const [view, setView] = useState<ViewType>({ type: 'list', screen: 'timeline' });

  // OAuth state
  const {
    isAuthenticated: gmailConnected,
    needsReauth: gmailNeedsReauth,
    email: gmailEmail,
    isLoading: isOAuthLoading,
    startOAuth,
    handleCallback,
    checkStatus,
  } = useGmailOAuth();

  // LLM state
  const { providers: llmProviders, activeProvider, listProviders, setProvider, validateProvider } = useLLMProvider();

  // Sync state
  const { status: syncStatus, startSync, getSyncStatus } = useSync();

  // Real-time sync progress
  const syncProgress = useSyncProgress();

  // Settings store
  const settingsStore = useSettingsStore();

  // Local state for onboarding flow
  const [preferencesSet, setPreferencesSet] = useState(false);
  const [keyValid, setKeyValid] = useState(false);
  const [keyInvalid, setKeyInvalid] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data for screens
  const [timelineUpdates, setTimelineUpdates] = useState<TimelineCardData[]>([]);
  const [weekSenders, setWeekSenders] = useState<Array<{ id: string; domain: string; category: string; count: number; summary: string; badgeBg: string; badgeText: string }>>([]);
  const [monthStats, setMonthStats] = useState<Array<{ id: string; month: string; weeks: number; emails: number; actionItems: number }>>([]);
  const [yearStats, setYearStats] = useState<Array<{ id: string; year: string; emails: number; actionItems: number; deals: number }>>([]);
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [senders, setSenders] = useState<SenderData[]>([]);
  const [deals, setDeals] = useState<DealData[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state
  const {
    handleMarkDealUsed,
    handleUnmarkDealUsed,
    handleDismissDeal,
    handleRestoreDeal,
  } = useDealMutations({ setDeals });
  const syncIndicator = useSyncIndicator(syncProgress, syncStatus);

  // Hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const path = window.location.hash.slice(1) || '/timeline';
      setCurrentPath(path);
      // Update view based on path
      const screen = path.slice(1) as 'timeline' | 'topics' | 'senders' | 'deals' | 'settings';
      if (['timeline', 'topics', 'senders', 'deals', 'settings'].includes(screen)) {
        setView({ type: 'list', screen });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Check auth status on load (only in Electron)
  useEffect(() => {
    if (isElectron) {
      checkStatus();
    }
  }, [checkStatus]);

  // Load LLM providers on mount (only in Electron)
  useEffect(() => {
    if (isElectron) {
      listProviders();
    }
  }, [listProviders]);

  // Poll sync status periodically (only in Electron)
  useEffect(() => {
    if (isOnboarded && isElectron) {
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

  // Load data when authenticated
  useEffect(() => {
    if (isOnboarded) {
      loadScreenData();
    }
  }, [isOnboarded]);

  // Load data for screens
  const loadScreenData = async () => {
    setIsLoading(true);
    try {
      // In browser mode, always use mock data
      if (!isElectron) {
        console.log('[App] Browser mode - loading mock data');
        setTimelineUpdates(getMockTimelineData());
        setWeekSenders(getMockWeekSenders());
        setMonthStats(getMockMonthStats());
        setYearStats(getMockYearStats());
        setTopics(getMockTopicsData());
        setSenders(getMockSendersData());
        setDeals(getMockDealsData());
        setIsLoading(false);
        return;
      }

      // In Electron mode, load real data from database
      const result = await window.electronAPI.listTimelineUpdates();
      if (result?.success && result.data) {
        setTimelineUpdates(result.data.updates.map((u) => ({
          id: u.id,
          emailId: u.emailId,
          threadId: u.threadId,
          title: u.title,
          summary: u.description ?? u.summary ?? undefined,
          priority: u.priority || 'medium',
          hasActionItem: u.actionItem ?? undefined,
          financialImpact: u.financialImpact ?? undefined,
          followUpDate: u.followUpDate ?? undefined,
          createdAt: new Date(u.createdAt),
          receivedAt: u.receivedAt ? new Date(u.receivedAt) : new Date(u.createdAt),
          sender: u.sender,
          topic: u.topic ?? undefined,
          isProcessed: u.isProcessed !== false,
        })));
      }

      // Fetch week senders aggregated data
      const weekSendersResult = await window.electronAPI.getTimelineWeekSenders({});
      if (weekSendersResult?.success && weekSendersResult.data) {
        setWeekSenders(weekSendersResult.data.senders.map((s, idx) => ({
          id: `ws-${idx}`,
          domain: s.domain,
          category: s.category,
          count: s.count,
          summary: s.summary,
          badgeBg: getCategoryBadgeBg(s.category),
          badgeText: getCategoryBadgeText(s.category),
        })));
      }

      // Fetch month stats aggregated data
      const monthStatsResult = await window.electronAPI.getTimelineMonthStats({ monthsBack: 3 });
      if (monthStatsResult?.success && monthStatsResult.data) {
        setMonthStats(monthStatsResult.data.stats.map((s, idx) => ({
          id: `ms-${idx}`,
          month: s.month,
          weeks: s.weeks,
          emails: s.emails,
          actionItems: s.actionItems,
        })));
      }

      // Fetch year stats aggregated data
      const yearStatsResult = await window.electronAPI.getTimelineYearStats({ yearsBack: 3 });
      if (yearStatsResult?.success && yearStatsResult.data) {
        setYearStats(yearStatsResult.data.stats.map((s, idx) => ({
          id: `ys-${idx}`,
          year: s.year,
          emails: s.emails,
          actionItems: s.actionItems,
          deals: s.deals,
        })));
      }

      const topicsResult = await window.electronAPI.listTopics();
      if (topicsResult?.success && topicsResult.data) {
        setTopics(topicsResult.data.topics);
      }

      const sendersResult = await window.electronAPI.listSenders();
      if (sendersResult?.success && sendersResult.data) {
        setSenders(sendersResult.data.senders.map((s) => ({
          id: s.id,
          domain: s.senderDomain,
          name: s.senderDomain.split('.')[0].charAt(0).toUpperCase() + s.senderDomain.split('.')[0].slice(1),
          email: `noreply@${s.senderDomain}`,
          emailCount: s.updateCount,
          category: 'Updates',
          summary: s.summary,
        })));
      }

      const dealsResult = await window.electronAPI.listDeals({ activeOnly: false });
      if (dealsResult?.success && dealsResult.data) {
        // Convert database records to UI-friendly DealData format
        const convertedDeals = toDealDataList(dealsResult.data.deals);
        setDeals(convertedDeals);
      }
    } catch (error) {
      console.error('[App] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Gmail connection
  const handleConnectGmail = async () => {
    try {
      const result = await startOAuth(3000);
      // IPC handler wraps response in { success: true, data: { authUrl } }
      const authUrl = getOAuthAuthUrl(result);
      if (authUrl) {
        const pollInterval = setInterval(async () => {
          const status = await checkStatus();
          if (status?.isAuthenticated) {
            clearInterval(pollInterval);
          }
        }, 2000);
        setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
      }
    } catch (error) {
      console.error('Failed to start OAuth:', error);
    }
  };

  // Handle preferences save
  const handleSetPreferences = (prefs: { lookbackDays: number; syncIntervalMinutes: number }) => {
    settingsStore.setLookbackDays(prefs.lookbackDays);
    setPreferencesSet(true);
    setOnboardingStep('llm');
  };

  // Handle API key save
  const handleSaveApiKey = async (provider: string, key: string, model?: string) => {
    setIsValidatingKey(true);
    setKeyInvalid(false);
    setValidationError(null);
    try {
      await setProvider(provider, key, model);
      const result = await validateProvider(provider);
      if (result && typeof result === 'object' && 'isValid' in result && result.isValid) {
        setKeyValid(true);
        settingsStore.setActiveProvider(provider);
        settingsStore.setApiKeyValid(true);
        // Refresh provider list to show updated status
        await listProviders();
      } else {
        setKeyInvalid(true);
        setValidationError(
          result && typeof result === 'object' && 'error' in result
            ? String(result.error)
            : 'Validation failed'
        );
      }
    } catch (error) {
      setKeyInvalid(true);
      setValidationError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsValidatingKey(false);
    }
  };

  // Handle starting processing
  const handleStartProcessing = async () => {
    // Start sync — user will see progress in SyncProgressStep
    try {
      await startSync(1, false); // Today only
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
  };

  // Handle sync completion (transition from onboarding to main app)
  const handleSyncComplete = useCallback(async () => {
    await setIsOnboarded();
    // Schedule backfill for remaining days
    const remainingDays = settingsStore.lookbackDays - 1;
    if (remainingDays > 0 && window.electronAPI?.startBackfill) {
      window.electronAPI.startBackfill(settingsStore.lookbackDays);
    }
  }, [setIsOnboarded, settingsStore.lookbackDays]);

  // Navigation handlers
  const handleNavigate = (path: string) => {
    window.location.hash = path;
  };

  const handleBackToList = () => {
    const currentScreen = currentPath.slice(1) as 'timeline' | 'topics' | 'senders' | 'deals' | 'settings';
    setView({ type: 'list', screen: currentScreen || 'timeline' });
  };

  // Navigate to detail views
  const handleEmailClick = async (update: TimelineCardData) => {
    // In browser mode, use mock data
    if (!isElectron) {
      const emailData: EmailDetailData = getMockEmailDetail(update);
      setView({ type: 'email', data: emailData });
      return;
    }

    // emailId is required to fetch email details from the backend
    if (!update.emailId) {
      console.error('[handleEmailClick] No emailId on timeline update — cannot fetch email detail. Update ID:', update.id);
      alert('Unable to open this email: the email reference is missing. Try syncing again.');
      return;
    }

    // In Electron mode, fetch real data from database
    try {
      const result = await window.electronAPI.getEmailDetail(update.emailId);

      if (result?.success && result.data) {
        // Backend returns data matching EmailDetailData directly
        const emailData: EmailDetailData = result.data as EmailDetailData;
        setView({ type: 'email', data: emailData });
      } else {
        const errMsg = result?.error ?? 'Unknown error';
        console.error('[handleEmailClick] API returned unsuccessful response:', errMsg);
        alert(`Failed to load email details: ${errMsg}`);
      }
    } catch (error) {
      console.error('[handleEmailClick] Failed to fetch email detail:', error);
      alert('Failed to load email details. Please try again.');
    }
  };

  const handleTopicClick = async (topic: TopicData) => {
    // In browser mode, use mock data
    if (!isElectron) {
      const topicData: TopicDetailData = getMockTopicDetail(topic);
      setView({ type: 'topic', data: topicData });
      return;
    }

    // In Electron mode, fetch real data from database
    try {
      const result = await window.electronAPI.getTopicDetail(topic.id);
      if (result?.success && result.data) {
        const topicData: TopicDetailData = {
          id: result.data.id,
          name: result.data.name,
          parentCategory: result.data.parentCategory || undefined,
          emailCount: result.data.emailCount,
          senderCount: result.data.senderCount,
          aiSummary: result.data.aiSummary,
          highlights: result.data.highlights,
          emails: result.data.emails.map((e) => ({
            id: e.id,
            subject: e.subject,
            snippet: e.snippet,
            sender: {
              name: e.sender.name,
              initial: e.sender.initial,
            },
            receivedAt: new Date(e.receivedAt),
            isRead: e.isRead,
            tags: e.tags,
          })),
          senders: result.data.senders,
          actionItems: result.data.actionItems,
          totalSpend: result.data.totalSpend,
          deals: result.data.deals?.map((d) => ({
            id: d.id,
            title: d.title,
            code: d.code,
            expiry: d.expiry ? new Date(d.expiry) : undefined,
            minPurchase: d.minPurchase,
            autoApplied: d.autoApplied,
          })),
        };
        setView({ type: 'topic', data: topicData });
      } else {
        // Fallback to mock data if fetch fails
        console.error('Failed to fetch topic detail:', result?.error);
        const topicData: TopicDetailData = getMockTopicDetail(topic);
        setView({ type: 'topic', data: topicData });
      }
    } catch (error) {
      console.error('Error fetching topic detail:', error);
      const topicData: TopicDetailData = getMockTopicDetail(topic);
      setView({ type: 'topic', data: topicData });
    }
  };

  const handleSenderClick = async (sender: SenderData) => {
    if (isElectron && window.electronAPI?.getSenderDetail) {
      try {
        const result = await window.electronAPI.getSenderDetail(sender.domain);
        if (result.success && result.data) {
          setView({ type: 'sender', data: result.data as SenderDetailData });
          return;
        }
      } catch (error) {
        console.error('Error fetching sender detail:', error);
      }
    }
    // Fallback to mock data
    const senderData: SenderDetailData = getMockSenderDetail(sender);
    setView({ type: 'sender', data: senderData });
  };

  const handleWeekSenderClick = (domain: string) => {
    // Find matching sender from the senders list by domain, or build a minimal one
    const existing = senders.find(s => s.domain.toLowerCase() === domain.toLowerCase());
    const sender: SenderData = existing ?? {
      id: domain,
      domain,
      name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
      email: `noreply@${domain}`,
      category: 'Other',
      emailCount: 0,
      summary: `Emails from ${domain} this week.`,
      lastUpdated: 'This week',
    };
    handleSenderClick(sender);
  };

  const handleDealClick = (deal: DealData) => {
    console.log('Deal clicked:', deal);
  };

  // Navigate to email detail from any view (sender, topic) by email ID
  const handleEmailDetailById = async (emailId: string) => {
    if (!isElectron) {
      const mockUpdate: TimelineCardData = {
        id: emailId,
        emailId,
        title: 'Email',
        priority: 'medium',
        createdAt: new Date(),
      };
      setView({ type: 'email', data: getMockEmailDetail(mockUpdate) });
      return;
    }

    try {
      const result = await window.electronAPI.getEmailDetail(emailId);
      if (result?.success && result.data) {
        setView({ type: 'email', data: result.data as EmailDetailData });
      } else {
        console.error('[handleEmailDetailById] Failed to fetch:', result?.error);
      }
    } catch (error) {
      console.error('[handleEmailDetailById] Error:', error);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    console.log('Copied code:', code);
  };

  // Search handler
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    console.log('Search:', query);
  };

  // Shared action item toggle handler with optimistic update
  const handleToggleActionItem = async (actionItemId: string) => {
    if (!isElectron || !window.electronAPI?.toggleActionItem) return;
    if (view.type === 'list') return;

    // Snapshot current state for rollback
    const currentView = view;

    // Find and toggle the action item optimistically
    const currentItems = currentView.data.actionItems ?? [];
    const updatedActionItems = currentItems.map((item) =>
      item.id === actionItemId
        ? { ...item, completed: !item.completed, completedAt: !item.completed ? new Date().toISOString() : undefined }
        : item
    );

    // Optimistic update
    setView({ ...currentView, data: { ...currentView.data, actionItems: updatedActionItems } } as ViewType);

    try {
      const result = await window.electronAPI.toggleActionItem(actionItemId);
      if (!result.success) {
        setView(currentView);
        console.error('Failed to toggle action item:', result.error);
      }
    } catch (error) {
      setView(currentView);
      console.error('Error toggling action item:', error);
    }
  };

  // Show loading state while checking onboarding status
  if (isOnboarded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <LoadingSpinner message="Loading TuskerBrain..." />
      </div>
    );
  }

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
        validationError={validationError ?? undefined}
        onSaveApiKey={handleSaveApiKey}
        onContinueAfterKeyValid={() => setOnboardingStep('complete')}
        setupComplete={onboardingStep === 'complete'}
        onStartProcessing={handleStartProcessing}
        syncProgress={syncProgress}
        onSyncComplete={handleSyncComplete}
        onGoBack={() => {
          if (onboardingStep === 'preferences') {
            setOnboardingStep('welcome');
          }
          if (onboardingStep === 'llm') {
            setPreferencesSet(false);
            setOnboardingStep('preferences');
          }
          if (onboardingStep === 'complete') {
            setKeyValid(false);
            setOnboardingStep('llm');
          }
        }}
      />
    );
  }

  // Render detail views
  const renderDetailView = () => {
    switch (view.type) {
      case 'email':
        return (
          <EmailDetailView
            data={view.data}
            onBack={handleBackToList}
            onRefocusEmail={(emailId) => handleEmailDetailById(emailId)}
            onViewInGmail={() => {
              const url = view.data.threadUrl;
              if (url) {
                window.electronAPI.openExternal(url);
              }
            }}
            onViewSender={() => {
              const sender = senders.find(s => s.domain === view.data.sender.email.split('@')[1]);
              if (sender) handleSenderClick(sender);
            }}
            onViewTopic={() => {
              if (view.data.topic) {
                const topic = topics.find(t => t.name === view.data.topic?.primary);
                if (topic) handleTopicClick(topic);
              }
            }}
            onToggleActionItem={(id) => handleToggleActionItem(id)}
          />
        );
      case 'topic':
        return (
          <TopicDetailView
            data={view.data}
            onBack={handleBackToList}
            onEmailClick={(email) => handleEmailDetailById(email.id)}
            onToggleAction={(id) => handleToggleActionItem(id)}
            onCopyDealCode={handleCopyCode}
          />
        );
      case 'sender':
        return (
          <SenderDetailView
            data={view.data}
            onBack={handleBackToList}
            onViewInGmail={() => console.log('View in Gmail')}
            onEmailClick={(email) => handleEmailDetailById(email.id)}
            onToggleAction={(id) => handleToggleActionItem(id)}
            onCopyDealCode={handleCopyCode}
          />
        );
      default:
        return null;
    }
  };

  // Render list view
  const renderListView = () => {
    switch (currentPath) {
      case '/timeline':
        return (
          <TimelineScreen
            updates={timelineUpdates.filter(u =>
              searchQuery ? u.title.toLowerCase().includes(searchQuery.toLowerCase()) : true
            )}
            weekSenders={weekSenders}
            monthStats={monthStats}
            yearStats={yearStats}
            isLoading={isLoading}
            onCardClick={handleEmailClick}
            onWeekSenderClick={handleWeekSenderClick}
          />
        );
      case '/topics':
        return (
          <TopicsScreen
            topics={topics.filter(t =>
              searchQuery ? t.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
            )}
            isLoading={isLoading}
            onTopicClick={handleTopicClick}
          />
        );
      case '/senders':
        return (
          <SendersScreen
            senders={senders.filter(s =>
              searchQuery
                ? s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  s.domain.toLowerCase().includes(searchQuery.toLowerCase())
                : true
            )}
            isLoading={isLoading}
            onSenderClick={handleSenderClick}
          />
        );
      case '/deals':
        return (
          <DealsScreen
            deals={deals.filter(d =>
              searchQuery
                ? d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  d.brand.toLowerCase().includes(searchQuery.toLowerCase())
                : true
            )}
            isLoading={isLoading}
            onDealClick={handleDealClick}
            onCopyCode={handleCopyCode}
            onMarkUsed={handleMarkDealUsed}
            onUnmarkUsed={handleUnmarkDealUsed}
            onDismiss={handleDismissDeal}
            onRestore={handleRestoreDeal}
          />
        );
      case '/settings':
        return (
          <SettingsScreen
            activeProvider={activeProvider}
            isAuthenticated={gmailConnected}
            needsReauth={gmailNeedsReauth}
            email={gmailEmail}
            onConnect={handleConnectGmail}
            onDisconnect={() => console.log('Disconnect')}
            lookbackDays={settingsStore.lookbackDays}
            syncInterval={30}
            onLookbackChange={(days) => settingsStore.setLookbackDays(days)}
            providers={llmProviders.map(p => ({
              id: p.id,
              name: p.name,
              hasKey: p.isConfigured,
              isValid: p.isValid,
            }))}
            onSaveApiKey={handleSaveApiKey}
          />
        );
      default:
        window.location.hash = '/timeline';
        return null;
    }
  };

  // Sync status for sidebar
  const sidebarSyncStatus = {
    isSynced: !syncStatus?.isRunning,
    lastSync: syncStatus?.isRunning
      ? 'Syncing...'
      : 'Last synced 5 min ago',
  };

  return (
    <AppLayout
      currentPath={currentPath}
      onNavigate={handleNavigate}
      syncStatus={sidebarSyncStatus}
      topBarProps={{
        searchPlaceholder: 'Search emails, topics, deals...',
        onSearch: handleSearch,
        syncIndicator,
      }}
    >
      {view.type !== 'list' ? renderDetailView() : renderListView()}
    </AppLayout>
  );
}

// Category badge color helpers
function getCategoryBadgeBg(category: string): string {
  const colors: Record<string, string> = {
    'Shopping': '#FFF3E0',
    'Banking': '#EEF5F6',
    'Social': '#EDECF9',
    'Travel': '#E1F0FF',
    'Entertainment': '#FCE4E4',
    'Developer': '#E8F5E9',
    'Technology': '#E8F5E9',
    'Education': '#FFF8E1',
    'Health': '#E0F2F1',
    'General': '#F5F5F5',
  };
  return colors[category] || '#F5F5F5';
}

function getCategoryBadgeText(category: string): string {
  const colors: Record<string, string> = {
    'Shopping': '#E65100',
    'Banking': '#4a4653',
    'Social': '#4a4653',
    'Travel': '#4a4653',
    'Entertainment': '#C62828',
    'Developer': '#2E7D32',
    'Technology': '#2E7D32',
    'Education': '#F57C00',
    'Health': '#00695C',
    'General': '#4a4653',
  };
  return colors[category] || '#4a4653';
}
