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
import {
  EmailDetailView,
  TopicDetailView,
  SenderDetailView,
  type EmailDetailData,
  type TopicDetailData,
  type SenderDetailData,
} from './components/views';
import { Onboarding } from './components/Onboarding';
import { useGmailOAuth, useSync, useSettings, useLLMProvider } from './hooks/ipc';
import { useSettingsStore } from './stores/settings';

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
        const onboarded = await window.electronAPI.getSetting('onboarding_complete');
        setIsOnboarded(onboarded === true);
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
    email: gmailEmail,
    isLoading: isOAuthLoading,
    startOAuth,
    handleCallback,
    checkStatus,
  } = useGmailOAuth();

  // LLM state
  const { setProvider, validateProvider } = useLLMProvider();

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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data for screens
  const [timelineUpdates, setTimelineUpdates] = useState<TimelineCardData[]>([]);
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [senders, setSenders] = useState<SenderData[]>([]);
  const [deals, setDeals] = useState<DealData[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading state

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
        setTopics(getMockTopicsData());
        setSenders(getMockSendersData());
        setDeals(getMockDealsData());
        setIsLoading(false);
        return;
      }

      // In Electron mode, try to load real data
      const result = await window.electronAPI.listTimelineUpdates();
      if (result?.success && result.data) {
        setTimelineUpdates(result.data.updates.map((u: any) => ({
          id: u.id,
          emailId: u.emailId,
          title: u.title,
          summary: u.description || u.summary,
          priority: u.priority || 'medium',
          hasActionItem: u.actionItem,
          financialImpact: u.financialImpact,
          followUpDate: u.followUpDate,
          createdAt: new Date(u.createdAt),
        })));
      } else {
        setTimelineUpdates(getMockTimelineData());
      }

      const topicsResult = await window.electronAPI.listTopics();
      if (topicsResult?.success && topicsResult.data) {
        setTopics(topicsResult.data.topics);
      } else {
        setTopics(getMockTopicsData());
      }

      setSenders(getMockSendersData());

      const dealsResult = await window.electronAPI.listDeals({ activeOnly: true });
      if (dealsResult?.success && dealsResult.data) {
        setDeals(dealsResult.data.deals);
      } else {
        setDeals(getMockDealsData());
      }
    } catch (error) {
      console.error('[App] Error loading data:', error);
      setTimelineUpdates(getMockTimelineData());
      setTopics(getMockTopicsData());
      setSenders(getMockSendersData());
      setDeals(getMockDealsData());
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Gmail connection
  const handleConnectGmail = async () => {
    try {
      const result = await startOAuth(3000);
      if (result?.authUrl) {
        window.open(result.authUrl, '_blank');
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
  const handleSaveApiKey = async (provider: string, key: string) => {
    setIsValidatingKey(true);
    setKeyInvalid(false);
    setValidationError(null);
    try {
      await setProvider(provider, key);
      const result = await validateProvider(provider);
      if (result && typeof result === 'object' && 'isValid' in result && result.isValid) {
        setKeyValid(true);
        settingsStore.setActiveProvider(provider);
        settingsStore.setApiKeyValid(true);
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
    setOnboardingStep('complete');
    try {
      await startSync(settingsStore.lookbackDays, false);
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
    await setIsOnboarded();
  };

  // Navigation handlers
  const handleNavigate = (path: string) => {
    window.location.hash = path;
  };

  const handleBackToList = () => {
    const currentScreen = currentPath.slice(1) as 'timeline' | 'topics' | 'senders' | 'deals' | 'settings';
    setView({ type: 'list', screen: currentScreen || 'timeline' });
  };

  // Navigate to detail views
  const handleEmailClick = (update: TimelineCardData) => {
    const emailData: EmailDetailData = getMockEmailDetail(update);
    setView({ type: 'email', data: emailData });
  };

  const handleTopicClick = (topic: TopicData) => {
    const topicData: TopicDetailData = getMockTopicDetail(topic);
    setView({ type: 'topic', data: topicData });
  };

  const handleSenderClick = (sender: SenderData) => {
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

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    console.log('Copied code:', code);
  };

  // Search handler
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    console.log('Search:', query);
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

  // Render detail views
  const renderDetailView = () => {
    switch (view.type) {
      case 'email':
        return (
          <EmailDetailView
            data={view.data}
            onBack={handleBackToList}
            onViewInGmail={() => console.log('View in Gmail')}
            onViewSender={() => {
              const sender = senders.find(s => s.domain === view.data.sender.email.split('@')[1]);
              if (sender) handleSenderClick(sender);
            }}
            onViewTopic={() => {
              if (view.data.topic) {
                const topic = topics.find(t => t.name === view.data.topic?.name);
                if (topic) handleTopicClick(topic);
              }
            }}
            onToggleActionItem={(id) => console.log('Toggle action:', id)}
          />
        );
      case 'topic':
        return (
          <TopicDetailView
            data={view.data}
            onBack={handleBackToList}
            onEmailClick={(email) => console.log('Email clicked:', email)}
            onToggleAction={(id) => console.log('Toggle action:', id)}
          />
        );
      case 'sender':
        return (
          <SenderDetailView
            data={view.data}
            onBack={handleBackToList}
            onViewInGmail={() => console.log('View in Gmail')}
            onEmailClick={(email) => console.log('Email clicked:', email)}
            onToggleAction={(id) => console.log('Toggle action:', id)}
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
          />
        );
      case '/settings':
        return (
          <SettingsScreen
            isAuthenticated={gmailConnected}
            email={gmailEmail}
            onConnect={handleConnectGmail}
            onDisconnect={() => console.log('Disconnect')}
            lookbackDays={settingsStore.lookbackDays}
            syncInterval={30}
            onLookbackChange={(days) => settingsStore.setLookbackDays(days)}
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
        processingStatus: syncStatus?.isRunning
          ? { isProcessing: true, count: syncStatus.progress?.processed }
          : undefined,
      }}
    >
      {view.type !== 'list' ? renderDetailView() : renderListView()}
    </AppLayout>
  );
}

// Mock data generators
function getMockTimelineData(): TimelineCardData[] {
  return [
    {
      id: '1',
      emailId: 'e1',
      title: 'AWS Invoice for March 2026',
      summary: 'Your AWS invoice for March is ready. Total amount: $247.12 due April 1.',
      priority: 'high',
      hasActionItem: true,
      financialImpact: 247.12,
      followUpDate: 'Apr 1',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      id: '2',
      emailId: 'e2',
      title: 'Amazon Order Shipped',
      summary: 'Your order #123-456 has shipped and will arrive by March 22.',
      priority: 'low',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    {
      id: '3',
      emailId: 'e3',
      title: 'Chase Statement Available',
      summary: 'Your March credit card statement is now available. Balance: $1,245.00',
      priority: 'medium',
      financialImpact: 1245,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  ];
}

function getMockTopicsData(): TopicData[] {
  return [
    {
      id: '1',
      name: 'Banking',
      emailCount: 45,
      summary: 'Financial updates from Chase, HSBC, and other banking institutions.',
      pendingActions: 2,
      senders: [
        { initial: 'C', color: 'bg-brand-50 text-brand' },
        { initial: 'H', color: 'bg-red-50 text-red-600' },
      ],
    },
    {
      id: '2',
      name: 'Shopping',
      emailCount: 89,
      summary: 'Order confirmations, shipping updates, and promotional offers.',
      senders: [
        { initial: 'A', color: 'bg-orange-50 text-orange-600' },
        { initial: 'T', color: 'bg-red-50 text-red-600' },
        { initial: 'B', color: 'bg-blue-50 text-blue-600' },
      ],
    },
    {
      id: '3',
      name: 'Travel',
      emailCount: 23,
      summary: 'Flight bookings, hotel reservations, and travel updates.',
      senders: [{ initial: 'D', color: 'bg-blue-50 text-blue-600' }],
    },
    {
      id: '4',
      name: 'Technology',
      emailCount: 67,
      summary: 'Development tools, subscriptions, and tech services.',
      pendingActions: 1,
      senders: [
        { initial: 'G', color: 'bg-gray-100 text-gray-700' },
        { initial: 'A', color: 'bg-orange-50 text-orange-600' },
      ],
    },
    {
      id: '5',
      name: 'Education',
      emailCount: 34,
      summary: 'Online courses, certifications, and learning resources.',
      senders: [
        { initial: 'U', color: 'bg-purple-50 text-purple-600' },
        { initial: 'C', color: 'bg-blue-50 text-blue-600' },
      ],
    },
    {
      id: '6',
      name: 'Health',
      emailCount: 12,
      summary: 'Medical appointments, insurance, and wellness updates.',
      senders: [{ initial: 'K', color: 'bg-teal-50 text-teal-600' }],
    },
  ];
}

function getMockSendersData(): SenderData[] {
  return [
    {
      id: '1',
      domain: 'amazon.com',
      name: 'Amazon',
      email: 'no-reply@amazon.com',
      category: 'Shopping',
      emailCount: 42,
      summary: 'Order confirmations, shipping updates, and promotional offers.',
      lastUpdated: '2h ago',
    },
    {
      id: '2',
      domain: 'chase.com',
      name: 'Chase',
      email: 'notifications@chase.com',
      category: 'Banking',
      emailCount: 15,
      summary: 'Account statements, payment reminders, and fraud alerts.',
      lastUpdated: 'Yesterday',
    },
    {
      id: '3',
      domain: 'linkedin.com',
      name: 'LinkedIn',
      email: 'notifications@linkedin.com',
      category: 'Social',
      emailCount: 28,
      summary: 'Connection requests, job recommendations, and network updates.',
      lastUpdated: '5h ago',
    },
    {
      id: '4',
      domain: 'github.com',
      name: 'GitHub',
      email: 'noreply@github.com',
      category: 'Technology',
      emailCount: 56,
      summary: 'Repository notifications, pull requests, and security alerts.',
      lastUpdated: '1h ago',
    },
    {
      id: '5',
      domain: 'udemy.com',
      name: 'Udemy',
      email: 'noreply@udemy.com',
      category: 'Education',
      emailCount: 18,
      summary: 'Course recommendations and promotional offers.',
      lastUpdated: '1w ago',
    },
    {
      id: '6',
      domain: 'netflix.com',
      name: 'Netflix',
      email: 'info@netflix.com',
      category: 'Entertainment',
      emailCount: 12,
      summary: 'New releases, watchlist reminders, and account updates.',
      lastUpdated: '3d ago',
    },
  ];
}

function getMockDealsData(): DealData[] {
  const now = new Date();
  return [
    {
      id: '1',
      title: '50% Off Electronics',
      brand: 'Amazon',
      code: 'SAVE50',
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
      status: 'active',
      category: 'Electronics',
      createdAt: now,
      emailId: 'email-1',
    },
    {
      id: '2',
      title: 'Free Shipping on Orders $50+',
      brand: 'Target',
      code: 'FREESHIP',
      expiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      isActive: true,
      status: 'active',
      category: 'Shopping',
      createdAt: now,
      emailId: 'email-2',
    },
    {
      id: '3',
      title: '$20 Off Your Order',
      brand: 'Best Buy',
      code: 'SAVE20',
      expiry: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      isActive: true,
      status: 'active',
      category: 'Electronics',
      createdAt: now,
      emailId: 'email-3',
    },
    {
      id: '4',
      title: '30% Off Courses',
      brand: 'Udemy',
      code: 'LEARN30',
      expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      isActive: true,
      status: 'active',
      category: 'Education',
      createdAt: now,
      emailId: 'email-4',
    },
    {
      id: '5',
      title: 'BOGO Special',
      brand: 'Dominos',
      code: 'BOGO',
      expiry: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      isActive: false,
      status: 'expired',
      category: 'Food',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      emailId: 'email-5',
    },
  ];
}

function getMockEmailDetail(update: TimelineCardData): EmailDetailData {
  return {
    id: update.id,
    subject: update.title,
    priority: update.priority || 'medium',
    sender: {
      name: 'Amazon Web Services',
      email: 'no-reply@amazon.com',
    },
    receivedAt: update.createdAt,
    topic: { name: 'Billing / AWS', path: '/topics/aws' },
    body: `Dear Customer,

Your AWS invoice for the billing period March 1 - March 18, 2026 is now available for viewing.

Total Amount Due: $247.12
Due Date: April 1, 2026

Summary of charges:
- Amazon Elastic Compute Cloud: $156.40
- Amazon Simple Storage Service: $42.22
- AWS Directory Service: $30.00
- Other Services: $18.50

You can view and pay your invoice through the AWS Billing Console. If you have any questions, please contact AWS Support.

Thank you for using Amazon Web Services.`,
    aiSummary: {
      bullets: [
        'AWS invoice for March 2026 is ready for payment',
        'Total amount due: $247.12 with April 1 deadline',
        'Largest charge is EC2 at $156.40 (63% of total)',
      ],
    },
    actionItems: [
      { id: 'a1', title: 'Pay AWS bill by April 1', completed: false },
    ],
    financialImpact: 247.12,
    threadUrl: 'https://mail.google.com',
  };
}

function getMockTopicDetail(topic: TopicData): TopicDetailData {
  return {
    id: topic.id,
    name: topic.name,
    parentCategory: 'Billing',
    emailCount: topic.emailCount,
    senderCount: topic.senders?.length || 2,
    aiSummary: `${topic.name} is one of your active categories. ${topic.summary} Over the last 30 days, there have been ${Math.floor(topic.emailCount * 0.3)} important updates requiring your attention.`,
    highlights: ['3 Pending Payments', '+15% AWS Spend'],
    emails: [
      {
        id: 'e1',
        subject: 'AWS Invoice Ready',
        snippet: 'Your AWS invoice for March is now available...',
        sender: { name: 'AWS', initial: 'A' },
        receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        tags: ['Billing'],
      },
      {
        id: 'e2',
        subject: 'Payment Confirmation',
        snippet: 'Your payment has been processed successfully...',
        sender: { name: 'Chase', initial: 'C' },
        receivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        tags: ['Payment'],
      },
      {
        id: 'e3',
        subject: 'Account Statement',
        snippet: 'Your monthly statement is ready to view...',
        sender: { name: 'HSBC', initial: 'H' },
        receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
    ],
    senders: [
      { name: 'Amazon Web Services', emailCount: 82 },
      { name: 'Google Cloud', emailCount: 42 },
    ],
    actionItems: [
      { id: 'a1', title: 'Review metrics dashboard', completed: false },
    ],
    totalSpend: 2450.75,
  };
}

function getMockSenderDetail(sender: SenderData): SenderDetailData {
  return {
    id: sender.id,
    domain: sender.domain,
    displayName: `${sender.name}.com & ${sender.name} Web Services`,
    category: sender.category,
    isSubscribed: true,
    stats: {
      totalEmails: sender.emailCount,
      actionItems: 8,
      activeDeals: 3,
    },
    aiSummary: {
      text: `${sender.name} is your most active sender, primarily sending order confirmations, shipping updates, and promotional offers. Over the last 30 days, there have been 14 shipping notifications for recent orders — 2 flagged as potentially delayed. ${sender.name} Web Services has been sending billing notices and usage alerts, with an upcoming invoice of $247 due on April 1st. You have 3 active promotional deals from ${sender.name} with codes expiring this week.`,
      updatedAt: '2h ago',
    },
    keyInsights: [
      { icon: 'truck', text: '2 delayed shipments', color: 'amber' },
      { icon: 'dollar', text: '$247 bill due Apr 1', color: 'red' },
      { icon: 'tag', text: '3 deals expiring soon', color: 'green' },
    ],
    recentEmails: [
      {
        id: 'e1',
        subject: 'Your order has shipped!',
        snippet: 'Order #123-456 is on its way. Expected delivery: March 22.',
        receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        tags: ['Shipping', '⚡ Action Required'],
        isRead: false,
      },
      {
        id: 'e2',
        subject: 'AWS Invoice for March 2026',
        snippet: 'Your invoice of $247.12 is due April 1, 2026.',
        receivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        tags: ['Billing', '$247 due'],
      },
      {
        id: 'e3',
        subject: 'Special Offer: 40% Off',
        snippet: 'Use code SPRING40 for 40% off your next order.',
        receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        tags: ['Promotion', '🏷 SPRING40'],
      },
    ],
    emailCategories: ['All', 'Orders', 'Billing', 'Promotions'],
    actionItems: [
      { id: 'a1', title: 'Pay AWS bill', dueDate: 'Apr 1', category: 'Billing', completed: false, urgent: false },
      { id: 'a2', title: 'Track shipment #123-456', category: 'Shipping', completed: false },
      { id: 'a3', title: 'Use SPRING40 code', category: 'Promotion', completed: true },
      { id: 'a4', title: 'Review usage metrics', category: 'AWS', completed: false },
    ],
    deals: [
      { id: 'd1', title: '40% Off SPRING40', code: 'SPRING40', expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
      { id: 'd2', title: 'Free Shipping', minPurchase: '$50', autoApplied: true },
    ],
  };
}
