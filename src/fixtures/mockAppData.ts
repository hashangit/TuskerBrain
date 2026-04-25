import type { DealData, SenderData, TimelineCardData, TopicData } from '../components/screens';
import type { EmailDetailData, SenderDetailData, TopicDetailData } from '../components/views';

export function getMockTimelineData(): TimelineCardData[] {
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

export function getMockTopicsData(): TopicData[] {
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

export function getMockSendersData(): SenderData[] {
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

export function getMockDealsData(): DealData[] {
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

export function getMockWeekSenders(): Array<{
  id: string;
  domain: string;
  category: string;
  count: number;
  summary: string;
  badgeBg: string;
  badgeText: string;
}> {
  return [
    {
      id: 'w1',
      domain: 'amazon.com',
      category: 'Shopping',
      count: 45,
      summary: 'Summary of Amazon emails including 3 tracking updates, 2 promotional offers, and a recent order confirmation.',
      badgeBg: '#FFF3E0',
      badgeText: '#E65100',
    },
    {
      id: 'w2',
      domain: 'chase.com',
      category: 'Banking',
      count: 12,
      summary: 'Payment confirmations and monthly statements.',
      badgeBg: '#EEF5F6',
      badgeText: '#4a4653',
    },
    {
      id: 'w3',
      domain: 'linkedin.com',
      category: 'Social',
      count: 89,
      summary: 'Weekly digest, new connection requests, and trending articles in your network.',
      badgeBg: '#EDECF9',
      badgeText: '#4a4653',
    },
    {
      id: 'w4',
      domain: 'delta.com',
      category: 'Travel',
      count: 3,
      summary: 'Flight confirmations for your upcoming trip.',
      badgeBg: '#E1F0FF',
      badgeText: '#4a4653',
    },
    {
      id: 'w5',
      domain: 'netflix.com',
      category: 'Entertainment',
      count: 1,
      summary: 'New sign-ins and top picks.',
      badgeBg: '#FCE4E4',
      badgeText: '#C62828',
    },
    {
      id: 'w6',
      domain: 'github.com',
      category: 'Developer',
      count: 24,
      summary: 'Pull requests and issue notifications.',
      badgeBg: '#E8F5E9',
      badgeText: '#2E7D32',
    },
  ];
}

export function getMockMonthStats(): Array<{
  id: string;
  month: string;
  weeks: number;
  emails: number;
  actionItems: number;
}> {
  return [
    { id: 'm1', month: 'March 2026', weeks: 4, emails: 1240, actionItems: 45 },
    { id: 'm2', month: 'February 2026', weeks: 4, emails: 4120, actionItems: 126 },
    { id: 'm3', month: 'January 2026', weeks: 4, emails: 5430, actionItems: 189 },
  ];
}

export function getMockYearStats(): Array<{
  id: string;
  year: string;
  emails: number;
  actionItems: number;
  deals: number;
}> {
  return [
    { id: 'y1', year: '2026', emails: 12450, actionItems: 432, deals: 89 },
    { id: 'y2', year: '2025', emails: 45210, actionItems: 2143, deals: 450 },
    { id: 'y3', year: '2024', emails: 38400, actionItems: 1890, deals: 320 },
  ];
}

export function getMockEmailDetail(update: TimelineCardData): EmailDetailData {
  return {
    id: update.id,
    subject: update.title,
    priority: update.priority || 'medium',
    sender: {
      name: 'Amazon Web Services',
      email: 'no-reply@amazon.com',
    },
    receivedAt: update.createdAt,
    topic: { primary: 'Billing / AWS', count: 1, all: ['Billing / AWS'] },
    body: `<p>Dear Customer,</p>
<p>Your AWS invoice for the billing period March 1 - March 18, 2026 is now available for viewing.</p>
<p><strong>Total Amount Due:</strong> $247.12<br><strong>Due Date:</strong> April 1, 2026</p>
<p>Summary of charges:</p>
<ul>
<li>Amazon Elastic Compute Cloud: $156.40</li>
<li>Amazon Simple Storage Service: $42.22</li>
<li>AWS Directory Service: $30.00</li>
<li>Other Services: $18.50</li>
</ul>
<p>You can view and pay your invoice through the <a href="https://console.aws.amazon.com/billing">AWS Billing Console</a>. If you have any questions, please contact AWS Support.</p>
<p>Thank you for using Amazon Web Services.</p>`,
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

export function getMockTopicDetail(topic: TopicData): TopicDetailData {
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
    deals: [
      {
        id: 'd1',
        title: '40% Off SPRING40',
        code: 'SPRING40',
        expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
      { id: 'd2', title: 'Free Shipping on $50+', minPurchase: '$50', autoApplied: true },
    ],
  };
}

export function getMockSenderDetail(sender: SenderData): SenderDetailData {
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
      text: `${sender.name} is your most active sender, primarily sending order confirmations, shipping updates, and promotional offers. Over the last 30 days, there have been 14 shipping notifications for recent orders - 2 flagged as potentially delayed. ${sender.name} Web Services has been sending billing notices and usage alerts, with an upcoming invoice of $247 due on April 1st. You have 3 active promotional deals from ${sender.name} with codes expiring this week.`,
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
        tags: ['Shipping', 'Action Required'],
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
        tags: ['Promotion', 'SPRING40'],
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
      {
        id: 'd1',
        title: '40% Off SPRING40',
        code: 'SPRING40',
        expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
      { id: 'd2', title: 'Free Shipping', minPurchase: '$50', autoApplied: true },
    ],
  };
}
