/**
 * Seed script to add 25 sample emails for March 23rd and 24th, 2026
 *
 * Usage:
 *   npx tsx foundations/database/seed/seed-march-23-24.ts
 */

import { createClient } from '@vendors/libsql';
import path from 'path';
import os from 'os';

// Helper to create specific dates
const march23 = new Date('2026-03-23T00:00:00.000Z');
const march24 = new Date('2026-03-24T00:00:00.000Z');

const hoursOnMarch23 = (hours: number, minutes = 0) => new Date(march23.getTime() + (hours * 60 + minutes) * 60 * 1000);
const hoursOnMarch24 = (hours: number, minutes = 0) => new Date(march24.getTime() + (hours * 60 + minutes) * 60 * 1000);

interface SeedEmail {
  id: string;
  sender: string;
  senderName: string;
  category: string;
  subject: string;
  snippet: string;
  emailType: 'regular' | 'updates' | 'social' | 'promotional';
  priority: 'high' | 'medium' | 'low';
  topic: string;
  hasActionItem?: boolean;
  actionItemTitle?: string;
  financialImpact?: number;
  followUpDate?: string;
  urgency?: boolean;
  hasDeal?: boolean;
  deal?: {
    title: string;
    code: string;
    brand: string;
    category: string;
    expiryDate: Date;
    value: string;
    minPurchase?: string;
  };
  receivedAt: Date;
}

const EMAILS: SeedEmail[] = [
  // March 23rd Morning (8 emails)
  {
    id: 'march23-001',
    sender: 'amazon.com',
    senderName: 'Amazon',
    category: 'Shopping',
    subject: 'Good Morning! Your Deals for March 23',
    snippet: 'Start your day with exclusive deals on electronics, home goods, and more.',
    emailType: 'promotional',
    priority: 'medium',
    topic: 'topic-amazon',
    hasDeal: true,
    deal: { title: 'Morning Flash Sale', code: 'MORNING25', brand: 'Amazon', category: 'Electronics', expiryDate: new Date('2026-03-24T23:59:59'), value: '25%' },
    receivedAt: hoursOnMarch23(7),
  },
  {
    id: 'march23-002',
    sender: 'github.com',
    senderName: 'GitHub',
    category: 'Technology',
    subject: 'Overnight: 3 Pull Requests Need Review',
    snippet: 'Your team has been active! Review pending PRs from contributors.',
    emailType: 'regular',
    priority: 'high',
    topic: 'topic-github',
    hasActionItem: true,
    actionItemTitle: 'Review 3 pending pull requests',
    receivedAt: hoursOnMarch23(8),
  },
  {
    id: 'march23-003',
    sender: 'chase.com',
    senderName: 'Chase Bank',
    category: 'Banking',
    subject: 'Payment Due Reminder',
    snippet: 'Your credit card payment of $342.50 is due in 3 days.',
    emailType: 'updates',
    priority: 'high',
    topic: 'topic-chase',
    hasActionItem: true,
    actionItemTitle: 'Pay credit card bill by March 26',
    financialImpact: 342.50,
    followUpDate: 'Mar 26',
    receivedAt: hoursOnMarch23(9),
  },
  {
    id: 'march23-004',
    sender: 'linkedin.com',
    senderName: 'LinkedIn',
    category: 'Social',
    subject: 'You appeared in 45 searches last week',
    snippet: 'Recruiters and professionals are looking at your profile.',
    emailType: 'social',
    priority: 'low',
    topic: 'topic-linkedin',
    receivedAt: hoursOnMarch23(10),
  },
  {
    id: 'march23-005',
    sender: 'vercel.com',
    senderName: 'Vercel',
    category: 'Technology',
    subject: 'Build Failed: production-deploy',
    snippet: 'Build failed on main branch. Error: TypeScript compilation error in src/components.',
    emailType: 'regular',
    priority: 'high',
    topic: 'topic-vercel',
    hasActionItem: true,
    actionItemTitle: 'Fix TypeScript build error',
    urgency: true,
    receivedAt: hoursOnMarch23(10, 30),
  },
  {
    id: 'march23-006',
    sender: 'udemy.com',
    senderName: 'Udemy',
    category: 'Education',
    subject: 'Your Learning Progress: 80% Complete!',
    snippet: "You're almost done with 'Advanced TypeScript Patterns'. Keep going!",
    emailType: 'updates',
    priority: 'low',
    topic: 'topic-udemy',
    receivedAt: hoursOnMarch23(11),
  },
  {
    id: 'march23-007',
    sender: 'aws.amazon.com',
    senderName: 'Amazon Web Services',
    category: 'Banking',
    subject: 'Cost Anomaly Detected',
    snippet: 'Your S3 costs are 40% higher than usual this month. Current spend: $89.20',
    emailType: 'updates',
    priority: 'medium',
    topic: 'topic-aws',
    hasActionItem: true,
    actionItemTitle: 'Review S3 storage usage',
    financialImpact: 89.20,
    receivedAt: hoursOnMarch23(11, 30),
  },
  {
    id: 'march23-008',
    sender: 'target.com',
    senderName: 'Target',
    category: 'Shopping',
    subject: 'Your Order is Out for Delivery',
    snippet: 'Order #TGT-1234 will arrive between 2-4 PM today.',
    emailType: 'updates',
    priority: 'medium',
    topic: 'topic-target',
    receivedAt: hoursOnMarch23(11, 45),
  },

  // March 23rd Afternoon (7 emails)
  {
    id: 'march23-009',
    sender: 'delta.com',
    senderName: 'Delta Airlines',
    category: 'Travel',
    subject: 'Check-in Open: Flight DL789',
    snippet: 'Your flight to Seattle tomorrow. Check in now to get your boarding pass.',
    emailType: 'regular',
    priority: 'high',
    topic: 'topic-delta',
    hasActionItem: true,
    actionItemTitle: 'Check in for flight DL789',
    followUpDate: 'Mar 24',
    receivedAt: hoursOnMarch23(13),
  },
  {
    id: 'march23-010',
    sender: 'kaiserpermanente.org',
    senderName: 'Kaiser Permanente',
    category: 'Health',
    subject: 'Prescription Refill Reminder',
    snippet: 'Your prescription for Vitamin D is running low. Refill now.',
    emailType: 'regular',
    priority: 'medium',
    topic: 'topic-kaiser',
    hasActionItem: true,
    actionItemTitle: 'Refill Vitamin D prescription',
    receivedAt: hoursOnMarch23(14),
  },
  {
    id: 'march23-011',
    sender: 'bestbuy.com',
    senderName: 'Best Buy',
    category: 'Shopping',
    subject: 'Member Exclusive: 20% Off Laptops',
    snippet: 'As a My Best Buy member, get 20% off select laptops today only.',
    emailType: 'promotional',
    priority: 'medium',
    topic: 'topic-bestbuy',
    hasDeal: true,
    deal: { title: '20% Off Laptops', code: 'LAPTOP20', brand: 'Best Buy', category: 'Electronics', expiryDate: new Date('2026-03-23T23:59:59'), value: '20%' },
    receivedAt: hoursOnMarch23(15),
  },
  {
    id: 'march23-012',
    sender: 'coursera.org',
    senderName: 'Coursera',
    category: 'Education',
    subject: 'Assignment Due: Machine Learning Week 4',
    snippet: 'Your neural networks assignment is due in 2 days.',
    emailType: 'regular',
    priority: 'high',
    topic: 'topic-coursera',
    hasActionItem: true,
    actionItemTitle: 'Complete ML assignment by March 25',
    followUpDate: 'Mar 25',
    receivedAt: hoursOnMarch23(16),
  },
  {
    id: 'march23-013',
    sender: 'hsbc.com',
    senderName: 'HSBC Bank',
    category: 'Banking',
    subject: 'Large Transaction Alert',
    snippet: 'A transaction of $1,250.00 was posted to your account.',
    emailType: 'updates',
    priority: 'high',
    topic: 'topic-hsbc',
    hasActionItem: true,
    actionItemTitle: 'Verify $1,250 transaction',
    financialImpact: 1250,
    urgency: true,
    receivedAt: hoursOnMarch23(16, 30),
  },
  {
    id: 'march23-014',
    sender: 'airbnb.com',
    senderName: 'Airbnb',
    category: 'Travel',
    subject: 'New Message from Your Host',
    snippet: 'Your host Sarah sent you a message about your upcoming stay.',
    emailType: 'regular',
    priority: 'medium',
    topic: 'topic-airbnb',
    hasActionItem: true,
    actionItemTitle: 'Read message from host',
    receivedAt: hoursOnMarch23(17),
  },
  {
    id: 'march23-015',
    sender: 'github.com',
    senderName: 'GitHub',
    category: 'Technology',
    subject: 'Security Alert: High Severity in npm Package',
    snippet: 'A high severity vulnerability was found in a dependency you use.',
    emailType: 'regular',
    priority: 'high',
    topic: 'topic-github',
    hasActionItem: true,
    actionItemTitle: 'Update vulnerable npm package',
    urgency: true,
    receivedAt: hoursOnMarch23(17, 30),
  },

  // March 24th Morning (10 emails)
  {
    id: 'march24-001',
    sender: 'amazon.com',
    senderName: 'Amazon',
    category: 'Shopping',
    subject: 'Your Package Was Delivered',
    snippet: 'Your Amazon package was delivered to your front porch at 8:23 AM.',
    emailType: 'updates',
    priority: 'low',
    topic: 'topic-amazon',
    receivedAt: hoursOnMarch24(8, 23),
  },
  {
    id: 'march24-002',
    sender: 'chase.com',
    senderName: 'Chase Bank',
    category: 'Banking',
    subject: 'Your Credit Score Updated',
    snippet: 'Your credit score has been updated. View it now in your account.',
    emailType: 'updates',
    priority: 'low',
    topic: 'topic-chase',
    receivedAt: hoursOnMarch24(9),
  },
  {
    id: 'march24-003',
    sender: 'vercel.com',
    senderName: 'Vercel',
    category: 'Technology',
    subject: 'Deployment Success: my-app v2.1.0',
    snippet: 'Your deployment to production completed successfully.',
    emailType: 'updates',
    priority: 'medium',
    topic: 'topic-vercel',
    receivedAt: hoursOnMarch24(9, 15),
  },
  {
    id: 'march24-004',
    sender: 'linkedin.com',
    senderName: 'LinkedIn',
    category: 'Social',
    subject: 'John Smith endorsed you for React',
    snippet: 'Your colleague endorsed you for React development.',
    emailType: 'social',
    priority: 'low',
    topic: 'topic-linkedin',
    receivedAt: hoursOnMarch24(10),
  },
  {
    id: 'march24-005',
    sender: 'delta.com',
    senderName: 'Delta Airlines',
    category: 'Travel',
    subject: 'Flight Reminder: DL789 to Seattle',
    snippet: 'Your flight departs today at 6:30 PM. Gate B12, boarding at 5:45 PM.',
    emailType: 'regular',
    priority: 'high',
    topic: 'topic-delta',
    hasActionItem: true,
    actionItemTitle: 'Arrive at airport for 6:30 PM flight',
    followUpDate: 'Mar 24',
    urgency: true,
    receivedAt: hoursOnMarch24(10, 30),
  },
  {
    id: 'march24-006',
    sender: 'udemy.com',
    senderName: 'Udemy',
    category: 'Education',
    subject: 'Flash Sale: 40% Off Ends Tonight',
    snippet: "Don't miss out! Complete your learning with courses at 40% off.",
    emailType: 'promotional',
    priority: 'low',
    topic: 'topic-udemy',
    hasDeal: true,
    deal: { title: '40% Off All Courses', code: 'FLASH40', brand: 'Udemy', category: 'Education', expiryDate: new Date('2026-03-24T23:59:59'), value: '40%' },
    receivedAt: hoursOnMarch24(11),
  },
  {
    id: 'march24-007',
    sender: 'target.com',
    senderName: 'Target',
    category: 'Shopping',
    subject: 'Circle Week: Extra 30% Off Clearance',
    snippet: 'Target Circle members get an extra 30% off already reduced clearance items.',
    emailType: 'promotional',
    priority: 'medium',
    topic: 'topic-target',
    hasDeal: true,
    deal: { title: '30% Off Clearance', code: 'CIRCLE30', brand: 'Target', category: 'General', expiryDate: new Date('2026-03-28T23:59:59'), value: '30%' },
    receivedAt: hoursOnMarch24(11, 30),
  },
  {
    id: 'march24-008',
    sender: 'github.com',
    senderName: 'GitHub',
    category: 'Technology',
    subject: 'Your PR #156 Was Merged',
    snippet: 'Congratulations! Your pull request was merged to main.',
    emailType: 'updates',
    priority: 'low',
    topic: 'topic-github',
    receivedAt: hoursOnMarch24(12),
  },
  {
    id: 'march24-009',
    sender: 'kaiserpermanente.org',
    senderName: 'Kaiser Permanente',
    category: 'Health',
    subject: 'Lab Results: All Normal',
    snippet: 'Your recent blood work results are in. All values are within normal range.',
    emailType: 'updates',
    priority: 'medium',
    topic: 'topic-kaiser',
    receivedAt: hoursOnMarch24(13),
  },
  {
    id: 'march24-010',
    sender: 'aws.amazon.com',
    senderName: 'Amazon Web Services',
    category: 'Banking',
    subject: 'Reserved Instance Expiring Soon',
    snippet: 'Your R5 reserved instance expires in 7 days. Consider renewing.',
    emailType: 'updates',
    priority: 'medium',
    topic: 'topic-aws',
    hasActionItem: true,
    actionItemTitle: 'Review and renew reserved instance',
    followUpDate: 'Mar 31',
    receivedAt: hoursOnMarch24(14),
  },
];

async function seed() {
  console.log('🌱 Seeding 25 emails for March 23-24, 2026...');

  const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'TuskerBrain', 'tuskerbrain.db');
  console.log(`  Database: ${dbPath}`);

  const url = 'file:' + dbPath;
  const client = createClient({ url });

  try {
    // Get existing topic IDs
    const existingTopicsResult = await client.execute('SELECT id, full_path FROM topics');
    const existingTopics = existingTopicsResult.rows as unknown as Array<{ id: string; full_path: string }>;
    const topicMap = new Map(existingTopics.map(t => [t.full_path.toLowerCase().replace('/', ''), t.id]));

    const topicNameToId: Record<string, string> = {
      'amazon': 'topic-amazon',
      'chase': 'topic-chase',
      'github': 'topic-github',
      'linkedin': 'topic-linkedin',
      'vercel': 'topic-vercel',
      'udemy': 'topic-udemy',
      'aws': 'topic-aws',
      'target': 'topic-target',
      'delta': 'topic-delta',
      'kaiser': 'topic-kaiser',
      'bestbuy': 'topic-bestbuy',
      'coursera': 'topic-coursera',
      'hsbc': 'topic-hsbc',
      'airbnb': 'topic-airbnb',
    };

    let emailCount = 0;
    let dealCount = 0;

    for (const email of EMAILS) {
      const threadId = `thread-${email.id}`;
      const receivedAt = email.receivedAt.getTime();
      const topicId = topicNameToId[email.topic.replace('topic-', '')] || 'topic-technology';

      // Insert email
      await client.execute({
        sql: `INSERT INTO emails (id, thread_id, sender_email, sender_name, sender_domain, subject, snippet,
          received_at, email_type, gmail_category, is_important, is_read, is_archived, is_deleted,
          is_processed, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email.id,
          threadId,
          `noreply@${email.sender}`,
          email.senderName,
          email.sender,
          email.subject,
          email.snippet,
          receivedAt,
          email.emailType,
          email.category,
          email.priority === 'high' ? 1 : 0,
          1,
          0,
          0,
          1,
          receivedAt,
          receivedAt
        ]
      });
      emailCount++;

      // Insert timeline update
      const title = email.subject.replace(/^(Re: |Fwd: |🔥 )/, '');
      const keyEntities = email.followUpDate
        ? JSON.stringify({
            dates: [email.followUpDate],
            amounts: email.financialImpact ? [email.financialImpact] : [],
            names: [email.senderName],
          })
        : null;

      await client.execute({
        sql: `INSERT INTO timeline_updates (id, email_id, title, description, summary, priority, sentiment,
          urgency, importance_reason, action_item, action_item_title, follow_up_date, financial_impact,
          key_entities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `update-${email.id}`,
          email.id,
          title,
          email.snippet,
          email.snippet,
          email.priority,
          email.financialImpact && email.financialImpact > 0 ? 'neutral' : 'positive',
          email.urgency ? 1 : 0,
          email.priority === 'high' ? 'Requires immediate attention' : null,
          email.hasActionItem ? 1 : 0,
          email.actionItemTitle || null,
          email.followUpDate || null,
          email.financialImpact || null,
          keyEntities,
          receivedAt
        ]
      });

      // Insert deal if applicable
      if (email.hasDeal && email.deal) {
        dealCount++;
        await client.execute({
          sql: `INSERT INTO deals (id, email_id, deal_title, deal_description, brand_name, deal_category,
            deal_value, deal_value_type, deal_code, minimum_purchase, deal_expiry, created_at,
            is_active, used_at, dismissed_at, deal_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `deal-march-${dealCount}`,
            email.id,
            email.deal.title,
            email.snippet,
            email.deal.brand,
            email.deal.category,
            email.deal.value,
            email.deal.value.includes('%') ? 'percentage' : 'fixed_amount',
            email.deal.code,
            email.deal.minPurchase || null,
            email.deal.expiryDate.getTime(),
            receivedAt,
            1,
            null,
            null,
            null
          ]
        });
      }

      // Insert email-topic relationship
      await client.execute({
        sql: 'INSERT INTO email_topics (email_id, topic_id, confidence_score) VALUES (?, ?, ?)',
        args: [email.id, topicId, 0.85 + Math.random() * 0.14]
      });
    }

    client.close();

    console.log('✅ Successfully added 25 emails!');
    console.log(`   - ${emailCount} emails inserted`);
    console.log(`   - ${emailCount} timeline updates created`);
    console.log(`   - ${dealCount} deals added`);
    console.log('\nDate range: March 23-24, 2026');

    return true;
  } catch (error) {
    console.error('❌ Seed failed:', error);
    client.close();
    throw error;
  }
}

seed()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
