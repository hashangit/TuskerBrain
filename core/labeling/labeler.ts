import type { Email } from '@core/types/email';

// Predefined parent topic categories
export const PREDEFINED_PARENTS = [
  'Banking',
  'Education',
  'Projects',
  'Shopping',
  'Travel',
  'Health',
  'Personal',
  'Business',
  'Technology',
  'Entertainment',
] as const;

// Domain to parent category mappings
const DOMAIN_TO_PARENT: Record<string, string> = {
  // Banking
  'chase.com': 'Banking',
  'wellsfargo.com': 'Banking',
  'bankofamerica.com': 'Banking',
  'citi.com': 'Banking',
  'hsbc.com': 'Banking',
  'capitalone.com': 'Banking',
  'amex.com': 'Banking',
  'americanexpress.com': 'Banking',
  'paypal.com': 'Banking',
  'venmo.com': 'Banking',
  
  // Education
  'udemy.com': 'Education',
  'coursera.org': 'Education',
  'edx.org': 'Education',
  'linkedin.com': 'Education', // Also Business
  'skillshare.com': 'Education',
  'duolingo.com': 'Education',
  
  // Shopping
  'amazon.com': 'Shopping',
  'ebay.com': 'Shopping',
  'walmart.com': 'Shopping',
  'target.com': 'Shopping',
  'bestbuy.com': 'Shopping',
  'etsy.com': 'Shopping',
  
  // Travel
  'united.com': 'Travel',
  'delta.com': 'Travel',
  'southwest.com': 'Travel',
  'airbnb.com': 'Travel',
  'booking.com': 'Travel',
  'expedia.com': 'Travel',
  'marriott.com': 'Travel',
  'hilton.com': 'Travel',
  
  // Health
  'myfitnesspal.com': 'Health',
  'fitbit.com': 'Health',
  'healthcare.gov': 'Health',
  'cvs.com': 'Health',
  'walgreens.com': 'Health',
  
  // Technology
  'github.com': 'Technology',
  'gitlab.com': 'Technology',
  'vercel.com': 'Technology',
  'netlify.com': 'Technology',
  'digitalocean.com': 'Technology',
  'aws.amazon.com': 'Technology',
  'cloudflare.com': 'Technology',
  
  // Entertainment
  'netflix.com': 'Entertainment',
  'spotify.com': 'Entertainment',
  'hulu.com': 'Entertainment',
  'disney.com': 'Entertainment',
  'hbomax.com': 'Entertainment',
  'youtube.com': 'Entertainment',
};

// Subject keywords to parent category
const KEYWORD_TO_PARENT: Record<string, string> = {
  // Banking
  'statement': 'Banking',
  'payment': 'Banking',
  'transaction': 'Banking',
  'balance': 'Banking',
  'credit card': 'Banking',
  'invoice': 'Banking',
  'receipt': 'Banking',
  
  // Projects
  'project': 'Projects',
  'sprint': 'Projects',
  'milestone': 'Projects',
  'deadline': 'Projects',
  'client': 'Projects',
  'deliverable': 'Projects',
  
  // Travel
  'flight': 'Travel',
  'hotel': 'Travel',
  'reservation': 'Travel',
  'booking': 'Travel',
  'trip': 'Travel',
  'vacation': 'Travel',
};

// Child topic normalization mappings
const CHILD_NORMALIZATIONS: Record<string, string> = {
  'chase bank': 'Chase',
  'jpmorgan chase': 'Chase',
  'chase credit card': 'Chase',
  'bank of america': 'Bank of America',
  'boa': 'Bank of America',
  'wells fargo bank': 'Wells Fargo',
  'american express': 'Amex',
  'americanexpress': 'Amex',
};

export interface TopicResult {
  parentTopic: string;
  childTopic: string;
  fullPath: string;
  confidence: number;
}

export interface Topic {
  parent: string;
  child: string;
}

export class TopicLabeler {
  private existingTopics: Map<string, TopicResult> = new Map();

  /**
   * Classifies an email into a topic hierarchy.
   */
  async classifyTopic(email: Email): Promise<TopicResult> {
    // 1. Check if we have an existing topic match for this sender
    const existingMatch = this.findExistingTopic(email);
    if (existingMatch) {
      return existingMatch;
    }

    // 2. Determine parent category
    const parentTopic = this.determineParentTopic(email);

    // 3. Determine child topic
    const childTopic = this.determineChildTopic(email, parentTopic);

    // 4. Normalize child topic name
    const normalizedChild = this.normalizeChildTopic(childTopic);

    // 5. Build result
    const result: TopicResult = {
      parentTopic,
      childTopic: normalizedChild,
      fullPath: `${parentTopic}/${normalizedChild}`,
      confidence: 0.8, // Default confidence
    };

    // 6. Store for future matching
    this.existingTopics.set(email.senderDomain.toLowerCase(), result);

    return result;
  }

  /**
   * Generates Gmail label path from topic.
   */
  generateGmailLabelPath(topic: Topic): string {
    const sanitize = (name: string) => {
      return name
        .replace(/[()]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9\-\/]/g, '');
    };

    const sanitizedParent = sanitize(topic.parent);
    const sanitizedChild = sanitize(topic.child);

    return `TuskerBrain/Topic/${sanitizedParent}/${sanitizedChild}`;
  }

  private findExistingTopic(email: Email): TopicResult | null {
    const domain = email.senderDomain.toLowerCase();
    
    // Check by domain
    if (this.existingTopics.has(domain)) {
      return this.existingTopics.get(domain)!;
    }

    return null;
  }

  private determineParentTopic(email: Email): string {
    const domain = email.senderDomain.toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const snippet = (email.snippet || '').toLowerCase();
    const senderEmail = email.senderEmail.toLowerCase();
    const senderName = (email.senderName || '').toLowerCase();

    // 1. Check domain mapping
    for (const [domainPattern, category] of Object.entries(DOMAIN_TO_PARENT)) {
      if (domain.includes(domainPattern) || senderEmail.includes(domainPattern)) {
        return category;
      }
    }

    // 2. Check sender name against predefined parents
    for (const parent of PREDEFINED_PARENTS) {
      if (senderName.includes(parent.toLowerCase())) {
        return parent;
      }
    }

    // 3. Check subject/snippet keywords
    const content = `${subject} ${snippet}`;
    for (const [keyword, category] of Object.entries(KEYWORD_TO_PARENT)) {
      if (content.includes(keyword)) {
        return category;
      }
    }

    // 4. Check for project-like patterns
    if (subject.includes('re:') || subject.includes('fwd:')) {
      const cleanSubject = subject.replace(/^(re|fwd|fw):\s*/i, '');
      if (cleanSubject.includes('project') || cleanSubject.includes('sprint')) {
        return 'Projects';
      }
    }

    // 5. Check for client domains (non-common TLDs might be business)
    const domainParts = domain.split('.');
    if (domainParts.length === 2 && !['gmail', 'yahoo', 'outlook', 'hotmail'].includes(domainParts[0])) {
      // Likely a business domain
      if (content.includes('project') || content.includes('client')) {
        return 'Projects';
      }
      return 'Business';
    }

    // Default to Personal
    return 'Personal';
  }

  private determineChildTopic(email: Email, parentTopic: string): string {
    const senderName = email.senderName || '';
    const domain = email.senderDomain;

    // Extract brand/company name from sender
    let childName = senderName;

    // Remove common suffixes
    childName = childName
      .replace(/\s+(Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co)\.?$/i, '')
      .replace(/\s+(Deals|Offers|Newsletter|Notifications|Alerts)$/i, '')
      .trim();

    // If no sender name, use domain
    if (!childName) {
      childName = domain
        .split('.')[0]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // For Projects, try to extract project/client name from subject
    if (parentTopic === 'Projects') {
      const subject = email.subject || '';
      
      // Look for project name patterns
      const projectMatch = subject.match(/project\s+([a-z0-9\-]+)/i);
      if (projectMatch) {
        childName = projectMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      } else {
        // Use domain as client name
        const domainWithoutTld = domain.split('.')[0];
        childName = domainWithoutTld.charAt(0).toUpperCase() + domainWithoutTld.slice(1);
      }
    }

    return childName;
  }

  private normalizeChildTopic(name: string): string {
    const lower = name.toLowerCase().trim();

    // Check normalization mappings
    if (CHILD_NORMALIZATIONS[lower]) {
      return CHILD_NORMALIZATIONS[lower];
    }

    // Default normalization: capitalize each word
    return name
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
