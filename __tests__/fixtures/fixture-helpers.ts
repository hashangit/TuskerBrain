import * as fs from 'fs';
import * as path from 'path';

// Type definitions
export type EmailType = 'regular' | 'updates' | 'social' | 'promotional';
export type GmailCategory = 'primary' | 'promotional' | 'social' | 'updates';
export type Priority = 'high' | 'medium' | 'low';

export interface DealExpectation {
  title: string;
  code?: string | null;
  value: string;
  category?: string;
  minimumPurchase?: string | number;
  expiryDate?: string;
  membershipRequired?: boolean;
  multiple?: boolean;
  count?: number;
  deals?: DealExpectation[];
}

export interface UpdateExpectation {
  type: string;
  actionItem?: boolean;
  followUpDate?: string;
  provider?: string;
  accountLastFour?: string;
  periodEnd?: string;
  balance?: number;
  carrier?: string;
  orderId?: string;
  estimatedDelivery?: string;
  itemCount?: number;
  service?: string;
  plan?: string;
  price?: number;
  currency?: string;
  renewalDate?: string;
  alertType?: string;
  amount?: number;
  merchant?: string;
  returnDate?: string;
  phase?: string;
  previousAmount?: number;
}

export interface EmailFixture {
  id: string;
  threadId: string;
  from: { email: string; name?: string };
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  category?: GmailCategory;
  _meta: {
    expectedType: EmailType;
    expectedTopic?: string;
    expectedPriority?: Priority;
    expectedDeal?: DealExpectation | null;
    expectedUpdate?: UpdateExpectation;
    notes?: string;
  };
}

export interface ExpectedExtraction {
  fixtureId: string;
  expectedExtraction: Record<string, unknown>;
  validationRules: Record<string, { required?: boolean; exactMatch?: string | number; pattern?: string; type?: string; min?: number; minLength?: number }>;
}

export interface SyncInterval {
  value: number;
  unit: string;
  label: string;
  default?: boolean;
}

export interface LookbackPeriod {
  lookbackPeriods: number[];
  defaultLookback: number;
  descriptions: Record<string, string>;
}

export interface LLMProvider {
  id: string;
  name: string;
  apiFormat: string;
  endpoint: string;
  validates?: string;
  models?: string[];
  defaultModel?: string | null;
  supportsStreaming?: boolean;
  maxTokens?: number | null;
  requiresEndpoint?: boolean;
}

export interface LLMProvidersConfig {
  primary: LLMProvider[];
  secondary: LLMProvider[];
}

export interface TopicParent {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface TopicHierarchy {
  name: string;
  children?: TopicHierarchy[];
}

const FIXTURES_DIR = __dirname;

/**
 * Helper class for loading and manipulating test fixtures
 */
export class FixtureHelpers {
  // Cache for loaded fixtures
  private static emailCache: Map<string, EmailFixture> = new Map();
  private static emailsByTypeCache: Map<EmailType, EmailFixture[]> = new Map();

  /**
   * Load a single email fixture by ID
   */
  static loadEmail(fixtureId: string): EmailFixture | undefined {
    if (this.emailCache.has(fixtureId)) {
      return this.emailCache.get(fixtureId);
    }

    const allEmails = this.loadAllEmails();
    const email = allEmails.find(e => e.id === fixtureId);

    if (email) {
      this.emailCache.set(fixtureId, email);
    }

    return email;
  }

  /**
   * Load multiple email fixtures by pattern (matches against ID)
   */
  static loadEmails(pattern: string): EmailFixture[] {
    const allEmails = this.loadAllEmails();
    const regex = new RegExp(pattern, 'i');
    return allEmails.filter(e => regex.test(e.id));
  }

  /**
   * Load all email fixtures of a specific type
   */
  static loadEmailsByType(type: EmailType): EmailFixture[] {
    if (this.emailsByTypeCache.has(type)) {
      return this.emailsByTypeCache.get(type)!;
    }

    const typeDir = path.join(FIXTURES_DIR, 'emails', type);
    const emails: EmailFixture[] = [];

    if (fs.existsSync(typeDir)) {
      const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(typeDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const email = JSON.parse(content) as EmailFixture;
        emails.push(email);
        this.emailCache.set(email.id, email);
      }
    }

    this.emailsByTypeCache.set(type, emails);
    return emails;
  }

  /**
   * Load all email fixtures
   */
  static loadAllEmails(): EmailFixture[] {
    const types: EmailType[] = ['regular', 'updates', 'social', 'promotional'];
    const allEmails: EmailFixture[] = [];

    for (const type of types) {
      allEmails.push(...this.loadEmailsByType(type));
    }

    // Also include edge cases
    allEmails.push(...this.loadEdgeCases());

    return allEmails;
  }

  /**
   * Load all edge case fixtures
   */
  static loadEdgeCases(): EmailFixture[] {
    const edgeCasesDir = path.join(FIXTURES_DIR, 'emails', 'edge-cases');
    const emails: EmailFixture[] = [];

    if (fs.existsSync(edgeCasesDir)) {
      const files = fs.readdirSync(edgeCasesDir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        const filePath = path.join(edgeCasesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const email = JSON.parse(content) as EmailFixture;
        emails.push(email);
      }
    }

    return emails;
  }

  /**
   * Create a copy of a fixture with a date offset
   */
  static withDateOffset(fixture: EmailFixture, days: number): EmailFixture {
    const originalDate = new Date(fixture.receivedAt);
    const newDate = new Date(originalDate);
    newDate.setDate(newDate.getDate() + days);

    return {
      ...fixture,
      id: `${fixture.id}-offset-${days}`,
      receivedAt: newDate.toISOString()
    };
  }

  /**
   * Create a copy of a fixture with a different Gmail category
   */
  static withCategory(fixture: EmailFixture, category: GmailCategory): EmailFixture {
    return {
      ...fixture,
      id: `${fixture.id}-cat-${category}`,
      category
    };
  }

  /**
   * Load expected extraction for a fixture
   */
  static loadExpectedExtraction(fixtureId: string): ExpectedExtraction | undefined {
    // Try updates directory first
    const updatesPath = path.join(FIXTURES_DIR, 'expected-extractions', 'updates', `${fixtureId}-expected.json`);
    if (fs.existsSync(updatesPath)) {
      const content = fs.readFileSync(updatesPath, 'utf-8');
      return JSON.parse(content) as ExpectedExtraction;
    }

    // Try deals directory
    const dealsPath = path.join(FIXTURES_DIR, 'expected-extractions', 'deals', `${fixtureId}-expected.json`);
    if (fs.existsSync(dealsPath)) {
      const content = fs.readFileSync(dealsPath, 'utf-8');
      return JSON.parse(content) as ExpectedExtraction;
    }

    return undefined;
  }

  /**
   * Load sync intervals configuration
   */
  static loadSyncIntervals(): SyncInterval[] {
    const filePath = path.join(FIXTURES_DIR, 'configurations', 'sync-intervals.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.intervals as SyncInterval[];
  }

  /**
   * Load lookback periods configuration
   */
  static loadLookbackPeriods(): LookbackPeriod {
    const filePath = path.join(FIXTURES_DIR, 'configurations', 'lookback-periods.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as LookbackPeriod;
  }

  /**
   * Load LLM providers configuration
   */
  static loadLLMProviders(): LLMProvidersConfig {
    const filePath = path.join(FIXTURES_DIR, 'configurations', 'llm-providers.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as LLMProvidersConfig;
  }

  /**
   * Load predefined topic parents
   */
  static loadPredefinedParents(): TopicParent[] {
    const filePath = path.join(FIXTURES_DIR, 'topics', 'predefined-parents.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.predefinedParents as TopicParent[];
  }

  /**
   * Load sample topic hierarchy
   */
  static loadSampleHierarchy(): TopicHierarchy {
    const filePath = path.join(FIXTURES_DIR, 'topics', 'sample-hierarchy.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    return data.hierarchy as TopicHierarchy;
  }

  /**
   * Get all promotional emails that have deals
   */
  static loadDealsWithEmails(): { email: EmailFixture; deal: DealExpectation }[] {
    const promotionalEmails = this.loadEmailsByType('promotional');
    const dealsWithEmails: { email: EmailFixture; deal: DealExpectation }[] = [];

    for (const email of promotionalEmails) {
      if (email._meta.expectedDeal) {
        dealsWithEmails.push({ email, deal: email._meta.expectedDeal });
      }
    }

    return dealsWithEmails;
  }

  /**
   * Get all update emails with their expected extractions
   */
  static loadUpdatesWithExtractions(): { email: EmailFixture; extraction: ExpectedExtraction }[] {
    const updateEmails = this.loadEmailsByType('updates');
    const updatesWithExtractions: { email: EmailFixture; extraction: ExpectedExtraction }[] = [];

    for (const email of updateEmails) {
      const extraction = this.loadExpectedExtraction(email.id);
      if (extraction) {
        updatesWithExtractions.push({ email, extraction });
      }
    }

    return updatesWithExtractions;
  }

  /**
   * Generate a batch of fixtures for matrix testing
   */
  static generateMatrixFixtures(
    baseFixture: EmailFixture,
    dateOffsets: number[],
    categories: GmailCategory[]
  ): EmailFixture[] {
    const fixtures: EmailFixture[] = [];

    for (const offset of dateOffsets) {
      for (const category of categories) {
        fixtures.push(
          this.withCategory(
            this.withDateOffset(baseFixture, offset),
            category
          )
        );
      }
    }

    return fixtures;
  }

  /**
   * Clear all caches (useful for testing)
   */
  static clearCache(): void {
    this.emailCache.clear();
    this.emailsByTypeCache.clear();
  }
}

// Export convenience functions
export const loadEmail = (id: string) => FixtureHelpers.loadEmail(id);
export const loadEmails = (pattern: string) => FixtureHelpers.loadEmails(pattern);
export const loadEmailsByType = (type: EmailType) => FixtureHelpers.loadEmailsByType(type);
export const loadEdgeCases = () => FixtureHelpers.loadEdgeCases();
export const loadExpectedExtraction = (fixtureId: string) => FixtureHelpers.loadExpectedExtraction(fixtureId);
export const loadSyncIntervals = () => FixtureHelpers.loadSyncIntervals();
export const loadLookbackPeriods = () => FixtureHelpers.loadLookbackPeriods();
export const loadLLMProviders = () => FixtureHelpers.loadLLMProviders();
