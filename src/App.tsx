import { useState, useEffect } from 'react';
import { Timeline } from './components/Timeline';
import { TopicList } from './components/TopicList';
import { DealsList, type Deal } from './components/DealsList';
import { Settings } from './components/Settings';
import { Onboarding } from './components/Onboarding';
import type { TimelineUpdate } from './components/Timeline';

// Navigation component
function Navigation({ currentPath }: { currentPath: string }) {
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
function Layout({ children, path }: { children: React.ReactNode; path: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPath={path} />
      <main className="max-w-7xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}

// Placeholder components for pages that need data
function TimelinePage() {
  const mockUpdates: TimelineUpdate[] = [
    {
      id: '1',
      title: 'Bank Statement Ready',
      description: 'Your January statement is now available',
      priority: 'medium',
      createdAt: new Date('2024-01-20'),
      emailId: 'email-1',
    },
    {
      id: '2',
      title: 'Action Required',
      description: 'Please review the attached document',
      priority: 'high',
      createdAt: new Date('2024-01-19'),
      emailId: 'email-2',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Timeline</h1>
      <Timeline updates={mockUpdates} />
    </div>
  );
}

function TopicsPage() {
  const mockTopics = [
    {
      id: '1',
      name: 'Chase',
      fullPath: 'Banking/Chase',
      emailCount: 15,
      summary: 'Banking notifications and statements from Chase.',
    },
    {
      id: '2',
      name: 'Amazon',
      fullPath: 'Shopping/Amazon',
      emailCount: 42,
      summary: 'Order confirmations and delivery updates from Amazon.',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Topics</h1>
      <TopicList topics={mockTopics} />
    </div>
  );
}

function DealsPage() {
  const mockDeals: Deal[] = [
    {
      id: '1',
      brand: 'Amazon',
      title: '20% Off Electronics',
      code: 'SAVE20',
      expiry: new Date('2024-02-28'),
      isActive: true,
    },
    {
      id: '2',
      brand: 'Best Buy',
      title: 'Free Shipping',
      code: null,
      isActive: true,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Deals</h1>
      <DealsList deals={mockDeals} showOnlyActive={false} />
    </div>
  );
}

// Check if user has completed onboarding
function useOnboardingStatus() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if onboarding is complete
    const onboarded = localStorage.getItem('tuskerbrain_onboarded');
    setIsOnboarded(onboarded === 'true');
  }, []);

  return { isOnboarded, setIsOnboarded };
}

export default function App() {
  const { isOnboarded, setIsOnboarded } = useOnboardingStatus();
  const [currentPath, setCurrentPath] = useState(window.location.hash.slice(1) || '/timeline');
  const [onboardingStep, setOnboardingStep] = useState<
    'welcome' | 'preferences' | 'llm' | 'complete'
  >('welcome');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [preferencesSet, setPreferencesSet] = useState(false);
  const [keyValid, setKeyValid] = useState(false);

  // Simple hash-based routing for Electron
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash.slice(1) || '/timeline');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Show loading state while checking onboarding status
  if (isOnboarded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Show onboarding if not completed
  if (!isOnboarded) {
    return (
      <Onboarding
        isConnecting={false}
        onConnectGmail={() => {
          // In real app, would trigger OAuth
          setGmailConnected(true);
          setOnboardingStep('preferences');
        }}
        gmailConnected={gmailConnected}
        email="user@example.com"
        onSetPreferences={(prefs) => {
          console.log('Preferences:', prefs);
          setPreferencesSet(true);
          setOnboardingStep('llm');
        }}
        preferencesSet={preferencesSet}
        isValidatingKey={false}
        keyValid={keyValid}
        keyInvalid={false}
        onSaveApiKey={(provider, _key) => {
          console.log('Save API key:', provider);
          // In real app, would validate and save
          setKeyValid(true);
        }}
        onContinueAfterKeyValid={() => {
          setOnboardingStep('complete');
        }}
        setupComplete={onboardingStep === 'complete'}
        onStartProcessing={() => {
          localStorage.setItem('tuskerbrain_onboarded', 'true');
          setIsOnboarded(true);
        }}
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

  return <Layout path={currentPath}>{renderPage()}</Layout>;
}
