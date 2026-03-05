import type { Email, EmailType } from '@core/types/email';

export interface ExtractedUpdate {
  title: string;
  description?: string;
  summary?: string;
  priority: 'high' | 'medium' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  urgency?: boolean;
  importanceReason?: string;
  actionItem: boolean;
  actionItemTitle?: string;
  followUpDate?: string;
  financialImpact?: number;
  keyEntities?: {
    dates: string[];
    amounts: number[];
    names: string[];
  };
}

export interface ExtractedDeal {
  dealTitle: string;
  dealDescription?: string;
  brandName: string;
  dealValue?: string;
  dealCode?: string;
  dealExpiry?: string;
  dealLink?: string;
  minimumPurchase?: string;
  dealCategory?: string;
}

export interface ExtractionResult {
  type: 'update' | 'deal' | 'none';
  update?: ExtractedUpdate | null;
  deal?: ExtractedDeal | null;
}

// Priority keywords
const HIGH_PRIORITY_KEYWORDS = [
  'urgent', 'asap', 'immediately', 'important', 'critical',
  'action required', 'response needed', 'deadline', 'due date',
  'expires', 'last chance', 'final notice', 'action required',
  'by friday', 'by monday', 'please review', 'please respond',
];

const LOW_PRIORITY_KEYWORDS = [
  'fyi', 'for your information', 'just sharing', 'heads up',
  'newsletter', 'weekly update', 'monthly summary',
];

// Action item keywords
const ACTION_KEYWORDS = [
  'action required', 'please respond', 'reply by', 'approve',
  'confirm', 'complete', 'submit', 'sign', 'review and',
  'you need to', 'please complete', 'please review',
];

// Deal/promotional keywords
const DEAL_KEYWORDS = [
  '% off', 'save $', 'discount', 'promo code', 'use code',
  'limited time', 'offer expires', 'sale ends', 'free shipping',
  'buy now', 'shop now', 'order today', 'sale',
];

// Date patterns
const DATE_PATTERNS = [
  /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
  /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
  /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
  /\b(by|before|due|expires?)\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
  /(november \d{1,2}-\d{1,2})/gi,
];

// Amount patterns
const AMOUNT_PATTERNS = [
  /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
  /(\d+(?:\.\d{2})?)\s*(?:dollars|usd)/gi,
  /\$(\d+)/g,
];

/**
 * Extracts update information from an email.
 * Returns null if the email doesn't appear to contain an update.
 */
export async function extractUpdate(email: Email): Promise<ExtractedUpdate | null> {
  const subject = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const content = `${subject} ${snippet}`;

  // Check if this looks like an update email
  const isUpdate = 
    content.includes('statement') ||
    content.includes('notification') ||
    content.includes('your account') ||
    content.includes('update') ||
    content.includes('confirmation') ||
    content.includes('alert') ||
    content.includes('reminder') ||
    content.includes('enrollment') ||
    content.includes('please review') ||
    ACTION_KEYWORDS.some(kw => content.includes(kw));

  if (!isUpdate) {
    return null;
  }

  // Extract title from subject
  const title = extractTitle(email.subject || '', subject);

  // Determine priority
  const priority = determinePriority(content);

  // Check for action items
  const hasActionItem = ACTION_KEYWORDS.some(kw => content.includes(kw));
  const actionItemTitle = hasActionItem ? extractActionItemTitle(content) : undefined;

  // Extract dates
  const dates = extractDates(content);

  // Extract amounts
  const amounts = extractAmounts(content);

  // Extract follow-up date
  const followUpDate = dates.length > 0 ? dates[0] : undefined;

  // Determine sentiment
  const sentiment = determineSentiment(content);

  // Check urgency
  const urgency = HIGH_PRIORITY_KEYWORDS.some(kw => content.includes(kw));

  // Extract financial impact
  const financialImpact = amounts.length > 0 ? amounts[0] : undefined;

  return {
    title,
    description: email.snippet?.substring(0, 200),
    summary: generateSummary(email.snippet || ''),
    priority,
    sentiment,
    urgency,
    actionItem: hasActionItem,
    actionItemTitle,
    followUpDate,
    financialImpact,
    keyEntities: {
      dates,
      amounts,
      names: [], // Would need NER for proper name extraction
    },
  };
}

/**
 * Extracts deal information from a promotional email.
 * Returns null if the email doesn't appear to contain a deal.
 */
export async function extractDeal(email: Email): Promise<ExtractedDeal | null> {
  const subject = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const content = `${subject} ${snippet}`;

  // Check if this looks like a deal email
  const hasDealKeywords = DEAL_KEYWORDS.some(kw => content.includes(kw));
  const hasPromoCode = /code[:\s]+(\w+)/i.test(content);
  const hasDiscount = /\d+%?\s*off/i.test(content);

  if (!hasDealKeywords && !hasPromoCode && !hasDiscount) {
    return null;
  }

  // Extract brand name from sender
  const brandName = extractBrandName(email.senderName || '', email.senderDomain);

  // Extract deal title
  const dealTitle = extractDealTitle(subject, snippet);

  // Extract promo code
  const dealCode = extractPromoCode(content);

  // Extract deal value/percentage
  const dealValue = extractDealValue(content);

  // Extract expiry
  const dealExpiry = extractExpiryDate(content);

  // Extract minimum purchase
  const minimumPurchase = extractMinPurchase(content);

  return {
    dealTitle,
    dealDescription: snippet.substring(0, 150),
    brandName,
    dealValue,
    dealCode,
    dealExpiry,
    minimumPurchase,
  };
}

/**
 * Main extraction function that determines what to extract based on email type.
 */
export async function extractFromEmail(
  email: Email,
  emailType: EmailType
): Promise<ExtractionResult> {
  switch (emailType) {
    case 'updates':
    case 'regular': {
      const update = await extractUpdate(email);
      if (update) {
        return { type: 'update', update };
      }
      return { type: 'none' };
    }

    case 'promotional': {
      const deal = await extractDeal(email);
      if (deal) {
        return { type: 'deal', deal };
      }
      return { type: 'none' };
    }

    case 'social':
      // Social emails typically don't have extractable content
      return { type: 'none' };

    default:
      return { type: 'none' };
  }
}

// Helper functions

function extractTitle(subject: string, _subjectLower: string): string {
  // Remove common prefixes
  let title = subject
    .replace(/^(re|fw|fwd):\s*/i, '')
    .replace(/\s*-\s*(amazon|best buy|walmart|target).*$/i, '')
    .replace(/^your\s+/i, '')
    .replace(/\s+is\s+(ready|available)$/i, '')
    .trim();

  // Capitalize first letter of each word
  return title.replace(/\b\w/g, (c) => c.toUpperCase());
}

function determinePriority(content: string): 'high' | 'medium' | 'low' {
  if (HIGH_PRIORITY_KEYWORDS.some(kw => content.includes(kw))) {
    return 'high';
  }
  if (LOW_PRIORITY_KEYWORDS.some(kw => content.includes(kw))) {
    return 'low';
  }
  return 'medium';
}

function extractActionItemTitle(content: string): string | undefined {
  for (const kw of ACTION_KEYWORDS) {
    const idx = content.indexOf(kw);
    if (idx !== -1) {
      // Get surrounding context
      const start = Math.max(0, idx - 20);
      const end = Math.min(content.length, idx + kw.length + 50);
      return content.substring(start, end).trim();
    }
  }
  return undefined;
}

function extractDates(content: string): string[] {
  const dates: string[] = [];

  for (const pattern of DATE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      dates.push(...matches);
    }
  }

  return [...new Set(dates)];
}

function extractAmounts(content: string): number[] {
  const amounts: number[] = [];

  for (const pattern of AMOUNT_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount)) {
        amounts.push(amount);
      }
    }
  }

  return [...new Set(amounts)];
}

function determineSentiment(content: string): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['congratulations', 'approved', 'accepted', 'welcome', 'success', 'completed'];
  const negativeWords = ['declined', 'rejected', 'failed', 'error', 'urgent', 'warning', 'alert'];

  const positiveCount = positiveWords.filter(w => content.includes(w)).length;
  const negativeCount = negativeWords.filter(w => content.includes(w)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function generateSummary(_snippet: string): string {
  // Simple truncation for now - in production would use LLM
  const cleaned = _snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 150) return cleaned;
  return cleaned.substring(0, 147) + '...';
}

function extractBrandName(senderName: string, senderDomain: string): string {
  // Use sender name if it looks like a brand
  if (senderName && !senderName.includes('@')) {
    // Remove common suffixes
    return senderName
      .replace(/\s+(Deals|Offers|Newsletter|Promotions|Store)$/i, '')
      .trim();
  }

  // Fall back to domain
  const domain = senderDomain.replace(/\.(com|net|org|io)$/, '');
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function extractDealTitle(subject: string,  __snippet: string): string {
  // Extract percentage off with category
  const percentWithCategory = subject.match(/(\d+%)?\s*off\s+(\w+)/i);
  if (percentWithCategory) {
    const pct = percentWithCategory[1] || '';
    const cat = percentWithCategory[2];
    return `${pct}${pct ? ' ' : ''}Off ${cat}`.trim();
  }

  // Extract from subject first
  const percentMatch = subject.match(/(\d+%)\s*off/i);
  if (percentMatch) {
    return percentMatch[1] + ' Off';
  }

  const saveMatch = subject.match(/save\s+(\$\d+|\d+%)/i);
  if (saveMatch) {
    return `Save ${saveMatch[1]}`;
  }

  // Fall back to first sentence of subject
  return subject.split(/[!:]/)[0].trim();
}

function extractPromoCode(content: string): string | undefined {
  const patterns = [
    /code[:\s]+([A-Z0-9]{4,15})/i,
    /use\s+(?:code\s+)?([A-Z0-9]{4,15})/i,
    /promo\s*code[:\s]+([A-Z0-9]{4,15})/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return undefined;
}

function extractDealValue(content: string): string | undefined {
  const percentMatch = content.match(/(\d+)%\s*off/i);
  if (percentMatch) {
    return `${percentMatch[1]}% off`;
  }

  const dollarMatch = content.match(/save\s+\$(\d+)/i);
  if (dollarMatch) {
    return `$${dollarMatch[1]}`;
  }

  return undefined;
}

function extractExpiryDate(content: string): string | undefined {
  const patterns = [
    /expires?\s+(today|midnight|tonight)/i,
    /ends?\s+(today|midnight|tonight|friday|saturday|sunday)/i,
    /ends?\s+(\w+ \d{1,2})/i,
    /through\s+(\w+ \d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function extractMinPurchase(content: string): string | undefined {
  const match = content.match(/min(?:imum)?\s*(?:purchase|order)?[:\s]+\$?(\d+)/i);
  if (match) {
    return `$${match[1]}`;
  }
  return undefined;
}
