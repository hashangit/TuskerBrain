/**
 * Comprehensive seed data for TuskerBrain
 * Creates 50 emails with various types, topics, priorities, and dates
 *
 * Usage:
 *   npx tsx database/seed.ts
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import seedData from './seed-data.json';
import path from 'path';
import os from 'os';

// Helper to create timestamps
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// Extended email type with all fields
interface SeedEmail {
  id: string;
  sender: string;
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
    expiryDays: number;
    value: string;
    minPurchase?: string;
  };
  daysAgo?: number;
  hoursAgo?: number;
}

// Full email templates with all fields
const EMAIL_TEMPLATES: SeedEmail[] = [
  // Banking - Chase (5 emails)
  { id: 'email-1', sender: 'chase.com', subject: 'Your March Statement is Ready', snippet: 'Your March credit card statement is now available. Balance: $1,245.00', emailType: 'updates', priority: 'high', topic: 'topic-chase', hasActionItem: true, actionItemTitle: 'Pay credit card bill by April 15', financialImpact: 1245, followUpDate: 'Apr 15', daysAgo: 2 },
  { id: 'email-2', sender: 'chase.com', subject: 'Payment Confirmation - $500 Received', snippet: 'Your payment of $500.00 has been successfully processed.', emailType: 'updates', priority: 'medium', topic: 'topic-chase', hasActionItem: false, financialImpact: 500, daysAgo: 5 },
  { id: 'email-3', sender: 'chase.com', subject: 'Fraud Alert: Unusual Activity Detected', snippet: 'We detected unusual activity on your card ending in 4532. Please verify recent transactions.', emailType: 'regular', priority: 'high', topic: 'topic-chase', hasActionItem: true, actionItemTitle: 'Review and verify recent transactions', urgency: true, daysAgo: 1 },
  { id: 'email-4', sender: 'chase.com', subject: 'New Rewards Points Available', snippet: 'You have earned 2,500 new reward points this month. Total: 45,000 points.', emailType: 'updates', priority: 'low', topic: 'topic-chase', hasActionItem: false, daysAgo: 7 },
  { id: 'email-5', sender: 'chase.com', subject: 'Account Security Update Required', snippet: 'Please update your security settings to enable two-factor authentication.', emailType: 'regular', priority: 'medium', topic: 'topic-chase', hasActionItem: true, actionItemTitle: 'Enable two-factor authentication', daysAgo: 10 },

  // Banking - AWS (3 emails)
  { id: 'email-6', sender: 'aws.amazon.com', subject: 'AWS Invoice for March 2026', snippet: 'Your AWS invoice for March is ready. Total amount: $247.12 due April 1.', emailType: 'updates', priority: 'high', topic: 'topic-aws', hasActionItem: true, actionItemTitle: 'Pay AWS bill by April 1', financialImpact: 247.12, followUpDate: 'Apr 1', daysAgo: 0, hoursAgo: 2 },
  { id: 'email-7', sender: 'aws.amazon.com', subject: 'EC2 Instance Usage Alert', snippet: 'Your EC2 usage has increased by 40% this month. Current spend: $156.40.', emailType: 'updates', priority: 'medium', topic: 'topic-aws', hasActionItem: false, daysAgo: 4 },
  { id: 'email-8', sender: 'aws.amazon.com', subject: 'Security Hub Findings Report', snippet: '3 security findings require your attention in Security Hub.', emailType: 'regular', priority: 'high', topic: 'topic-aws', hasActionItem: true, actionItemTitle: 'Review Security Hub findings', daysAgo: 6 },

  // Banking - HSBC (4 emails)
  { id: 'email-9', sender: 'hsbc.com', subject: 'Monthly Statement Available', snippet: 'Your HSBC checking account statement for March is ready.', emailType: 'updates', priority: 'medium', topic: 'topic-hsbc', hasActionItem: false, daysAgo: 3 },
  { id: 'email-10', sender: 'hsbc.com', subject: 'Wire Transfer Confirmation', snippet: 'Wire transfer of $2,500 to Client ABC has been completed.', emailType: 'regular', priority: 'high', topic: 'topic-hsbc', hasActionItem: false, financialImpact: 2500, daysAgo: 8 },
  { id: 'email-11', sender: 'hsbc.com', subject: 'Interest Rate Change Notice', snippet: 'Effective April 1, savings account interest rate will change to 4.25% APY.', emailType: 'updates', priority: 'low', topic: 'topic-hsbc', hasActionItem: false, daysAgo: 12 },
  { id: 'email-12', sender: 'hsbc.com', subject: 'Account Maintenance Scheduled', snippet: 'Scheduled maintenance on March 28, 2-4 AM EST. Online banking may be unavailable.', emailType: 'updates', priority: 'low', topic: 'topic-hsbc', hasActionItem: false, daysAgo: 14 },

  // Shopping - Amazon (8 emails)
  { id: 'email-13', sender: 'amazon.com', subject: 'Your order has shipped!', snippet: 'Order #123-456 has shipped and will arrive by March 22.', emailType: 'updates', priority: 'low', topic: 'topic-amazon', hasActionItem: false, daysAgo: 0, hoursAgo: 5 },
  { id: 'email-14', sender: 'amazon.com', subject: '50% Off Electronics - Today Only!', snippet: 'Save big on electronics today. Use code SAVE50 at checkout.', emailType: 'promotional', priority: 'medium', topic: 'topic-amazon', hasDeal: true, deal: { title: '50% Off Electronics', code: 'SAVE50', brand: 'Amazon', category: 'Electronics', expiryDays: 7, value: '50%' }, daysAgo: 1 },
  { id: 'email-15', sender: 'amazon.com', subject: 'Your Amazon Order #789-012 Delivered', snippet: 'Your package was delivered to your front door.', emailType: 'updates', priority: 'low', topic: 'topic-amazon', hasActionItem: false, daysAgo: 3 },
  { id: 'email-16', sender: 'amazon.com', subject: 'Deal Alert: Save 30% on Home & Kitchen', snippet: 'Discover amazing deals on home essentials. Limited time offer.', emailType: 'promotional', priority: 'low', topic: 'topic-amazon', hasDeal: true, deal: { title: '30% Off Home & Kitchen', code: 'HOME30', brand: 'Amazon', category: 'Home', expiryDays: 5, value: '30%' }, daysAgo: 4 },
  { id: 'email-17', sender: 'amazon.com', subject: 'Your Subscribe & Save Order is Coming', snippet: 'Your subscription order will ship on March 25. Total: $45.99.', emailType: 'updates', priority: 'medium', topic: 'topic-amazon', hasActionItem: true, actionItemTitle: 'Review subscription items before March 25', followUpDate: 'Mar 25', daysAgo: 5 },
  { id: 'email-18', sender: 'amazon.com', subject: 'Prime Day Early Access: Exclusive Deals', snippet: 'As a Prime member, get early access to Prime Day deals.', emailType: 'promotional', priority: 'low', topic: 'topic-amazon', hasDeal: true, deal: { title: 'Prime Day Early Access', code: 'PRIME2026', brand: 'Amazon', category: 'General', expiryDays: 14, value: 'Up to 70%' }, daysAgo: 7 },
  { id: 'email-19', sender: 'amazon.com', subject: 'Return Request Approved', snippet: 'Your return for Order #345-678 has been approved. Refund: $89.99.', emailType: 'updates', priority: 'medium', topic: 'topic-amazon', hasActionItem: false, financialImpact: -89.99, daysAgo: 10 },
  { id: 'email-20', sender: 'amazon.com', subject: 'New from Amazon: Smart Home Devices', snippet: 'Discover the latest smart home devices with Alexa integration.', emailType: 'promotional', priority: 'low', topic: 'topic-amazon', hasDeal: false, daysAgo: 14 },

  // Shopping - Target (4 emails)
  { id: 'email-21', sender: 'target.com', subject: 'Free Shipping on Orders $50+', snippet: 'Use code FREESHIP for free shipping on your next order.', emailType: 'promotional', priority: 'low', topic: 'topic-target', hasDeal: true, deal: { title: 'Free Shipping on Orders $50+', code: 'FREESHIP', brand: 'Target', category: 'General', expiryDays: 14, value: 'Free Shipping', minPurchase: '$50' }, daysAgo: 2 },
  { id: 'email-22', sender: 'target.com', subject: 'Your Target Order is Ready for Pickup', snippet: 'Order #TGT-789 is ready at your selected store.', emailType: 'updates', priority: 'medium', topic: 'topic-target', hasActionItem: true, actionItemTitle: 'Pick up order within 3 days', followUpDate: 'Mar 24', daysAgo: 0, hoursAgo: 8 },
  { id: 'email-23', sender: 'target.com', subject: 'Circle Rewards: You Earned $10', snippet: 'You have $10 in Target Circle rewards to use on your next purchase.', emailType: 'updates', priority: 'medium', topic: 'topic-target', hasActionItem: false, daysAgo: 6 },
  { id: 'email-24', sender: 'target.com', subject: 'Weekly Ad: New Deals Inside', snippet: "Check out this week's best deals at your local Target.", emailType: 'promotional', priority: 'low', topic: 'topic-target', hasDeal: false, daysAgo: 9 },

  // Shopping - Best Buy (3 emails)
  { id: 'email-25', sender: 'bestbuy.com', subject: '$20 Off Your Next Purchase', snippet: 'As a thank you, enjoy $20 off your next purchase of $100+.', emailType: 'promotional', priority: 'medium', topic: 'topic-bestbuy', hasDeal: true, deal: { title: '$20 Off Your Order', code: 'SAVE20', brand: 'Best Buy', category: 'Electronics', expiryDays: 3, value: '$20', minPurchase: '$100' }, daysAgo: 1 },
  { id: 'email-26', sender: 'bestbuy.com', subject: 'Your Geek Squad Appointment Confirmed', snippet: 'Your appointment is scheduled for March 23 at 2:00 PM.', emailType: 'regular', priority: 'medium', topic: 'topic-bestbuy', hasActionItem: true, actionItemTitle: 'Attend Geek Squad appointment on Mar 23', followUpDate: 'Mar 23', daysAgo: 4 },
  { id: 'email-27', sender: 'bestbuy.com', subject: 'Order #BB-456 Shipped', snippet: 'Your order has shipped. Expected delivery: March 24.', emailType: 'updates', priority: 'low', topic: 'topic-bestbuy', hasActionItem: false, daysAgo: 5 },

  // Travel - Delta (3 emails)
  { id: 'email-28', sender: 'delta.com', subject: 'Flight Confirmation: LAX to JFK', snippet: 'Your flight DL123 on April 5 is confirmed. Departure: 8:00 AM.', emailType: 'regular', priority: 'high', topic: 'topic-delta', hasActionItem: true, actionItemTitle: 'Check in 24 hours before departure', followUpDate: 'Apr 4', daysAgo: 3 },
  { id: 'email-29', sender: 'delta.com', subject: 'SkyMiles Update: You Earned 5,000 Miles', snippet: 'Your recent trip earned 5,000 bonus miles. Total balance: 125,000.', emailType: 'updates', priority: 'low', topic: 'topic-delta', hasActionItem: false, daysAgo: 7 },
  { id: 'email-30', sender: 'delta.com', subject: 'Gate Change Alert: Flight DL456', snippet: 'Your flight DL456 has changed gates. New gate: B42.', emailType: 'regular', priority: 'high', topic: 'topic-delta', hasActionItem: false, urgency: true, daysAgo: 0, hoursAgo: 1 },

  // Travel - Airbnb (3 emails)
  { id: 'email-31', sender: 'airbnb.com', subject: 'Reservation Confirmed: Miami Beach', snippet: 'Your stay at Ocean View Villa is confirmed for April 10-15.', emailType: 'regular', priority: 'high', topic: 'topic-airbnb', hasActionItem: true, actionItemTitle: 'Complete guest verification before check-in', followUpDate: 'Apr 8', financialImpact: 850, daysAgo: 4 },
  { id: 'email-32', sender: 'airbnb.com', subject: 'Review Your Recent Stay', snippet: 'How was your stay at Downtown Loft? Leave a review.', emailType: 'updates', priority: 'low', topic: 'topic-airbnb', hasActionItem: true, actionItemTitle: 'Leave a review for your recent stay', daysAgo: 10 },
  { id: 'email-33', sender: 'airbnb.com', subject: 'Host Special Offer: 15% Off', snippet: 'The host is offering 15% off your next booking at this property.', emailType: 'promotional', priority: 'medium', topic: 'topic-airbnb', hasDeal: true, deal: { title: '15% Off Next Stay', code: 'HOST15', brand: 'Airbnb', category: 'Travel', expiryDays: 30, value: '15%' }, daysAgo: 12 },

  // Health - Kaiser (4 emails)
  { id: 'email-34', sender: 'kaiserpermanente.org', subject: 'Appointment Reminder: Dr. Smith', snippet: 'Your appointment is scheduled for March 25 at 10:00 AM.', emailType: 'regular', priority: 'high', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Attend appointment on Mar 25', followUpDate: 'Mar 25', daysAgo: 2 },
  { id: 'email-35', sender: 'kaiserpermanente.org', subject: 'Lab Results Available', snippet: 'Your recent lab results are now available in your patient portal.', emailType: 'updates', priority: 'medium', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Review lab results', daysAgo: 5 },
  { id: 'email-36', sender: 'kaiserpermanente.org', subject: 'Prescription Ready for Pickup', snippet: 'Your prescription is ready at the pharmacy. Pickup by March 24.', emailType: 'regular', priority: 'medium', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Pick up prescription by Mar 24', followUpDate: 'Mar 24', daysAgo: 1 },
  { id: 'email-37', sender: 'kaiserpermanente.org', subject: 'Annual Wellness Exam Due', snippet: "It's time to schedule your annual wellness exam.", emailType: 'regular', priority: 'medium', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Schedule annual wellness exam', daysAgo: 14 },

  // Education - Udemy (3 emails)
  { id: 'email-38', sender: 'udemy.com', subject: '30% Off Courses - Learn Something New!', snippet: 'Expand your skills with 30% off thousands of courses.', emailType: 'promotional', priority: 'low', topic: 'topic-udemy', hasDeal: true, deal: { title: '30% Off Courses', code: 'LEARN30', brand: 'Udemy', category: 'Education', expiryDays: 5, value: '30%' }, daysAgo: 1 },
  { id: 'email-39', sender: 'udemy.com', subject: 'Course Completed: React Advanced Patterns', snippet: "Congratulations! You've completed the course. Download your certificate.", emailType: 'updates', priority: 'low', topic: 'topic-udemy', hasActionItem: false, daysAgo: 6 },
  { id: 'email-40', sender: 'udemy.com', subject: 'New Course Recommendation: TypeScript Mastery', snippet: 'Based on your learning, we recommend TypeScript Mastery.', emailType: 'promotional', priority: 'low', topic: 'topic-udemy', hasDeal: false, daysAgo: 9 },

  // Education - Coursera (2 emails)
  { id: 'email-41', sender: 'coursera.org', subject: 'Certificate Earned: Machine Learning', snippet: "You've earned a certificate from Stanford University.", emailType: 'updates', priority: 'medium', topic: 'topic-coursera', hasActionItem: false, daysAgo: 8 },
  { id: 'email-42', sender: 'coursera.org', subject: 'Course Starting Soon: Data Science Fundamentals', snippet: 'Your enrolled course begins on March 28.', emailType: 'regular', priority: 'medium', topic: 'topic-coursera', hasActionItem: true, actionItemTitle: 'Prepare for course start on Mar 28', followUpDate: 'Mar 28', daysAgo: 11 },

  // Technology - GitHub (5 emails)
  { id: 'email-43', sender: 'github.com', subject: 'Pull Request #42 Needs Your Review', snippet: 'user123 requested your review on PR: Add authentication module.', emailType: 'regular', priority: 'high', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Review Pull Request #42', daysAgo: 0, hoursAgo: 3 },
  { id: 'email-44', sender: 'github.com', subject: 'Security Alert: Vulnerability Detected', snippet: 'A critical vulnerability was found in lodash dependency.', emailType: 'regular', priority: 'high', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Update lodash dependency', urgency: true, daysAgo: 2 },
  { id: 'email-45', sender: 'github.com', subject: 'Your Repository Has New Stars', snippet: 'my-awesome-project received 15 new stars this week.', emailType: 'updates', priority: 'low', topic: 'topic-github', hasActionItem: false, daysAgo: 5 },
  { id: 'email-46', sender: 'github.com', subject: 'Issue #128 Assigned to You', snippet: 'Fix navigation bug on mobile devices has been assigned to you.', emailType: 'regular', priority: 'medium', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Resolve Issue #128', daysAgo: 7 },
  { id: 'email-47', sender: 'github.com', subject: 'Actions Workflow Failed', snippet: 'CI workflow failed on main branch. 2 tests failed.', emailType: 'regular', priority: 'high', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Fix failing CI tests', daysAgo: 4 },

  // Technology - Vercel (3 emails)
  { id: 'email-48', sender: 'vercel.com', subject: 'Deployment Successful: my-app v1.2.0', snippet: 'Your deployment to production is live at my-app.vercel.app.', emailType: 'updates', priority: 'medium', topic: 'topic-vercel', hasActionItem: false, daysAgo: 1 },
  { id: 'email-49', sender: 'vercel.com', subject: 'Build Error Detected', snippet: 'Build failed on preview branch. Error: Module not found.', emailType: 'regular', priority: 'high', topic: 'topic-vercel', hasActionItem: true, actionItemTitle: 'Fix build error on preview branch', daysAgo: 3 },
  { id: 'email-50', sender: 'vercel.com', subject: 'Monthly Usage Report', snippet: 'Your bandwidth usage: 45GB of 100GB. Functions: 2.1M invocations.', emailType: 'updates', priority: 'low', topic: 'topic-vercel', hasActionItem: false, daysAgo: 10 },
];

async function seed(dbPath?: string) {
  console.log('🌱 Starting database seed...');

  const finalPath = dbPath || path.join(os.homedir(), 'Library', 'Application Support', 'TuskerBrain', 'tuskerbrain.db');
  console.log(`  Database path: ${finalPath}`);

  const url = 'file:' + finalPath;
  const client = createClient({ url });
  const db = drizzle(client, { schema });

  try {
    const senders = seedData.senders;
    const topics = seedData.topics;
    const topicSummaries = seedData.topicSummaries;
    const senderSummaries = seedData.senderSummaries;

    console.log('  Clearing existing data...');
    await client.execute('DELETE FROM email_topics');
    await client.execute('DELETE FROM topic_summaries');
    await client.execute('DELETE FROM sender_summaries');
    await client.execute('DELETE FROM deals');
    await client.execute('DELETE FROM timeline_updates');
    await client.execute('DELETE FROM emails');
    await client.execute('DELETE FROM topics');

    console.log('  Inserting topics...');
    for (const topic of topics) {
      await client.execute({
        sql: 'INSERT INTO topics (id, parent_id, name, full_path, email_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [topic.id, topic.parentId, topic.name, topic.fullPath, topic.emailCount, Date.now()]
      });
    }

    console.log('  Inserting emails and related data...');
    let dealCount = 0;

    for (const template of EMAIL_TEMPLATES) {
      const sender = senders.find((s) => s.domain === template.sender)!;
      const threadId = `thread-${template.id}`;
      const receivedAt = template.hoursAgo
        ? hoursAgo(template.hoursAgo).getTime()
        : daysAgo(template.daysAgo || 0).getTime();

      await client.execute({
        sql: `INSERT INTO emails (id, thread_id, sender_email, sender_name, sender_domain, subject, snippet,
          received_at, email_type, gmail_category, is_important, is_read, is_archived, is_deleted,
          is_processed, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          template.id, threadId, `noreply@${sender.domain}`, sender.name, sender.domain,
          template.subject, template.snippet, receivedAt, template.emailType, sender.category,
          template.priority === 'high' ? 1 : 0, 1, 0, 0, 1, receivedAt, receivedAt
        ]
      });

      const title = template.subject.replace(/^(Re: |Fwd: |🔥 )/, '');
      const keyEntities = template.followUpDate
        ? JSON.stringify({ dates: [template.followUpDate], amounts: template.financialImpact ? [template.financialImpact] : [], names: [sender.name] })
        : null;

      await client.execute({
        sql: `INSERT INTO timeline_updates (id, email_id, title, description, summary, priority, sentiment,
          urgency, importance_reason, action_item, action_item_title, follow_up_date, financial_impact,
          key_entities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `update-${template.id}`, template.id, title, template.snippet, template.snippet,
          template.priority, template.financialImpact && template.financialImpact > 0 ? 'neutral' : 'positive',
          template.urgency ? 1 : 0, template.priority === 'high' ? 'Requires immediate attention' : null,
          template.hasActionItem ? 1 : 0, template.actionItemTitle || null, template.followUpDate || null,
          template.financialImpact || null, keyEntities, receivedAt
        ]
      });

      if (template.hasDeal && template.deal) {
        dealCount++;
        await client.execute({
          sql: `INSERT INTO deals (id, email_id, deal_title, deal_description, brand_name, deal_category,
            deal_value, deal_value_type, deal_code, minimum_purchase, deal_expiry, created_at,
            is_active, used_at, dismissed_at, deal_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `deal-${dealCount}`, template.id, template.deal.title, template.snippet,
            template.deal.brand, template.deal.category, template.deal.value,
            template.deal.value.includes('%') ? 'percentage' : 'fixed_amount',
            template.deal.code, template.deal.minPurchase || null,
            daysFromNow(template.deal.expiryDays).getTime(), receivedAt, 1, null, null, null
          ]
        });
      }

      await client.execute({
        sql: 'INSERT INTO email_topics (email_id, topic_id, confidence_score) VALUES (?, ?, ?)',
        args: [template.id, template.topic, 0.85 + Math.random() * 0.14]
      });
    }

    console.log('  Inserting topic summaries...');
    for (const [topicId, summary] of Object.entries(topicSummaries)) {
      await client.execute({
        sql: 'INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, update_count) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`ts-${topicId}`, topicId, summary, summary.split(' ').length, Date.now(), Math.floor(Math.random() * 10) + 1]
      });
    }

    console.log('  Inserting sender summaries...');
    for (const [domain, data] of Object.entries(senderSummaries)) {
      await client.execute({
        sql: 'INSERT INTO sender_summaries (id, sender_domain, summary, word_count, last_updated, update_count) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`ss-${domain.replace(/\./g, '-')}`, domain, data.summary, data.summary.split(' ').length, Date.now(), 1]
      });
    }

    console.log('✅ Database seed completed successfully!');
    console.log(`   - ${EMAIL_TEMPLATES.length} emails`);
    console.log(`   - ${EMAIL_TEMPLATES.length} timeline updates`);
    console.log(`   - ${dealCount} deals`);
    console.log(`   - ${topics.length} topics`);
    console.log(`   - ${Object.keys(topicSummaries).length} topic summaries`);
    console.log(`   - ${Object.keys(senderSummaries).length} sender summaries`);

    client.close();
    return true;
  } catch (error) {
    console.error('❌ Seed failed:', error);
    client.close();
    throw error;
  }
}

seed()
  .then(() => { console.log('\nDone!'); process.exit(0); })
  .catch((error) => { console.error('Fatal error:', error); process.exit(1); });

export { seed };
