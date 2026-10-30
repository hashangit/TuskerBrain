import type { Email, EmailType } from '@foundations/types/email';

export interface ClassificationResult {
  type: EmailType;
  confidence: number;
  reason?: string;
}

// Domain patterns for classification
const PROMOTIONAL_DOMAINS = [
  'deals', 'offers', 'promo', 'marketing', 'newsletter', 'mail.',
  'notifications@amazon', 'deals@', 'offers@', 'promo@',
];

const SOCIAL_DOMAINS = [
  'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'notifications@', 'noreply@social',
];

const UPDATE_DOMAINS = [
  'noreply@', 'no-reply@', 'donotreply@', 'alerts@',
  'statements@', 'notifications@bank', 'updates@',
];

const PROMOTIONAL_KEYWORDS = [
  '% off', 'save $', 'sale', 'deal', 'offer', 'discount',
  'limited time', 'today only', 'expires', 'promo code',
  'free shipping', 'buy now', 'shop now',
  // Spanish promotional keywords
  'oferta', 'descuento', 'ofertas', 'promoción',
  // French promotional keywords
  'offre', 'remise', 'soldes', 'promotion',
  // German promotional keywords
  'angebot', 'rabatt',
];

const SOCIAL_KEYWORDS = [
  'endorsed you', 'liked your', 'commented on', 'shared your',
  'posted a photo', 'tagged you', 'mentioned you',
  'friend request', 'new connection', 'follower',
];

const UPDATE_KEYWORDS = [
  'statement is ready', 'your account', 'bill is available',
  'payment received', 'order confirmed', 'shipping update',
  'password changed', 'security alert', 'verification code',
];

/**
 * Classifies email type based on Gmail category, sender patterns, and content.
 * This is a rule-based classifier. In production, this would be enhanced with LLM.
 */
export async function classifyEmailType(email: Email): Promise<ClassificationResult> {
  // First, trust Gmail's classification if available
  if (email.gmailCategory) {
    switch (email.gmailCategory) {
      case 'promotions':
        return { type: 'promotional', confidence: 0.95, reason: 'Gmail promotions category' };
      case 'social':
        return { type: 'social', confidence: 0.95, reason: 'Gmail social category' };
      case 'updates':
        return { type: 'updates', confidence: 0.95, reason: 'Gmail updates category' };
      case 'forums':
        return { type: 'updates', confidence: 0.85, reason: 'Gmail forums category' };
      case 'primary':
        // Primary category is typically regular (personal/business) emails
        return { type: 'regular', confidence: 0.85, reason: 'Gmail primary category' };
    }
  }

  // Check sender domain patterns
  const senderEmail = email.senderEmail.toLowerCase();
  const senderDomain = email.senderDomain.toLowerCase();

  // Check promotional patterns
  for (const pattern of PROMOTIONAL_DOMAINS) {
    if (senderEmail.includes(pattern)) {
      return { type: 'promotional', confidence: 0.85, reason: `Promotional sender pattern: ${pattern}` };
    }
  }

  // Check social patterns
  for (const pattern of SOCIAL_DOMAINS) {
    if (senderEmail.includes(pattern) || senderDomain.includes(pattern)) {
      return { type: 'social', confidence: 0.85, reason: `Social sender pattern: ${pattern}` };
    }
  }

  // Check update patterns
  for (const pattern of UPDATE_DOMAINS) {
    if (senderEmail.includes(pattern)) {
      // But not if it's clearly social
      if (!senderDomain.includes('linkedin') && !senderDomain.includes('facebook')) {
        return { type: 'updates', confidence: 0.80, reason: `Update sender pattern: ${pattern}` };
      }
    }
  }

  // Check content keywords
  const subject = (email.subject || '').toLowerCase();
  const snippet = (email.snippet || '').toLowerCase();
  const content = `${subject} ${snippet}`;

  // Check promotional keywords
  for (const keyword of PROMOTIONAL_KEYWORDS) {
    if (content.includes(keyword)) {
      return { type: 'promotional', confidence: 0.75, reason: `Promotional keyword: ${keyword}` };
    }
  }

  // Check social keywords
  for (const keyword of SOCIAL_KEYWORDS) {
    if (content.includes(keyword)) {
      return { type: 'social', confidence: 0.75, reason: `Social keyword: ${keyword}` };
    }
  }

  // Check update keywords
  for (const keyword of UPDATE_KEYWORDS) {
    if (content.includes(keyword)) {
      return { type: 'updates', confidence: 0.70, reason: `Update keyword: ${keyword}` };
    }
  }

  // Default to regular for personal/business emails
  // Check if sender looks like an individual (firstname.lastname or similar pattern)
  const senderLocalPart = senderEmail.split('@')[0];
  const looksLikeIndividual = /^[a-z]+\.[a-z]+/.test(senderLocalPart) ||
    /^[a-z]+_[a-z]+/.test(senderLocalPart) ||
    /^[a-z]+$/.test(senderLocalPart);

  if (looksLikeIndividual && !email.gmailCategory) {
    return { type: 'regular', confidence: 0.70, reason: 'Individual sender pattern' };
  }

  // Default to updates for noreply addresses without other signals
  if (senderEmail.includes('noreply') || senderEmail.includes('no-reply')) {
    return { type: 'updates', confidence: 0.65, reason: 'No-reply address' };
  }

  // Final default
  return { type: 'regular', confidence: 0.50, reason: 'Default classification' };
}

/**
 * LLM-based classification (for use when rule-based is insufficient).
 * This is a placeholder that would integrate with the LLM provider.
 */
export async function classifyWithEmail(
  email: Email,
  _llmProvider: unknown
): Promise<ClassificationResult> {
  // For now, fall back to rule-based classification
  // In production, this would use the LLM provider for semantic understanding
  return classifyEmailType(email);
}
