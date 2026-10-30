/**
 * Database seeder for TuskerBrain
 * Run via IPC handler or on first launch
 */

import { createClient, type Client } from '@vendors/libsql';

// Helper to create timestamps
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// Topics data
const TOPICS = [
  { id: 'topic-banking', parentId: null, name: 'Banking', fullPath: 'Banking', emailCount: 12 },
  { id: 'topic-chase', parentId: 'topic-banking', name: 'Chase', fullPath: 'Banking/Chase', emailCount: 5 },
  { id: 'topic-hsbc', parentId: 'topic-banking', name: 'HSBC', fullPath: 'Banking/HSBC', emailCount: 4 },
  { id: 'topic-aws', parentId: 'topic-banking', name: 'AWS', fullPath: 'Banking/AWS', emailCount: 3 },
  { id: 'topic-shopping', parentId: null, name: 'Shopping', fullPath: 'Shopping', emailCount: 15 },
  { id: 'topic-amazon', parentId: 'topic-shopping', name: 'Amazon', fullPath: 'Shopping/Amazon', emailCount: 8 },
  { id: 'topic-target', parentId: 'topic-shopping', name: 'Target', fullPath: 'Shopping/Target', emailCount: 4 },
  { id: 'topic-bestbuy', parentId: 'topic-shopping', name: 'Best Buy', fullPath: 'Shopping/BestBuy', emailCount: 3 },
  { id: 'topic-travel', parentId: null, name: 'Travel', fullPath: 'Travel', emailCount: 6 },
  { id: 'topic-delta', parentId: 'topic-travel', name: 'Delta', fullPath: 'Travel/Delta', emailCount: 3 },
  { id: 'topic-airbnb', parentId: 'topic-travel', name: 'Airbnb', fullPath: 'Travel/Airbnb', emailCount: 3 },
  { id: 'topic-health', parentId: null, name: 'Health', fullPath: 'Health', emailCount: 4 },
  { id: 'topic-kaiser', parentId: 'topic-health', name: 'Kaiser', fullPath: 'Health/Kaiser', emailCount: 4 },
  { id: 'topic-education', parentId: null, name: 'Education', fullPath: 'Education', emailCount: 5 },
  { id: 'topic-udemy', parentId: 'topic-education', name: 'Udemy', fullPath: 'Education/Udemy', emailCount: 3 },
  { id: 'topic-coursera', parentId: 'topic-education', name: 'Coursera', fullPath: 'Education/Coursera', emailCount: 2 },
  { id: 'topic-technology', parentId: null, name: 'Technology', fullPath: 'Technology', emailCount: 8 },
  { id: 'topic-github', parentId: 'topic-technology', name: 'GitHub', fullPath: 'Technology/GitHub', emailCount: 5 },
  { id: 'topic-vercel', parentId: 'topic-technology', name: 'Vercel', fullPath: 'Technology/Vercel', emailCount: 3 },
  { id: 'topic-entertainment', parentId: null, name: 'Entertainment', fullPath: 'Entertainment', emailCount: 3 },
  { id: 'topic-netflix', parentId: 'topic-entertainment', name: 'Netflix', fullPath: 'Entertainment/Netflix', emailCount: 2 },
  { id: 'topic-spotify', parentId: 'topic-entertainment', name: 'Spotify', fullPath: 'Entertainment/Spotify', emailCount: 1 },
  { id: 'topic-social', parentId: null, name: 'Social', fullPath: 'Social', emailCount: 4 },
  { id: 'topic-linkedin', parentId: 'topic-social', name: 'LinkedIn', fullPath: 'Social/LinkedIn', emailCount: 4 },
  { id: 'topic-projects', parentId: null, name: 'Projects', fullPath: 'Projects', emailCount: 5 },
  { id: 'topic-clientabc', parentId: 'topic-projects', name: 'Client-ABC', fullPath: 'Projects/Client-ABC', emailCount: 5 },
];

// Senders data
const SENDERS = [
  { domain: 'amazon.com', name: 'Amazon', category: 'Shopping' },
  { domain: 'chase.com', name: 'Chase Bank', category: 'Banking' },
  { domain: 'aws.amazon.com', name: 'Amazon Web Services', category: 'Banking' },
  { domain: 'target.com', name: 'Target', category: 'Shopping' },
  { domain: 'bestbuy.com', name: 'Best Buy', category: 'Shopping' },
  { domain: 'delta.com', name: 'Delta Airlines', category: 'Travel' },
  { domain: 'airbnb.com', name: 'Airbnb', category: 'Travel' },
  { domain: 'kaiserpermanente.org', name: 'Kaiser Permanente', category: 'Health' },
  { domain: 'udemy.com', name: 'Udemy', category: 'Education' },
  { domain: 'coursera.org', name: 'Coursera', category: 'Education' },
  { domain: 'github.com', name: 'GitHub', category: 'Technology' },
  { domain: 'vercel.com', name: 'Vercel', category: 'Technology' },
  { domain: 'netflix.com', name: 'Netflix', category: 'Entertainment' },
  { domain: 'spotify.com', name: 'Spotify', category: 'Entertainment' },
  { domain: 'linkedin.com', name: 'LinkedIn', category: 'Social' },
  { domain: 'company.com', name: 'Client ABC', category: 'Projects' },
  { domain: 'hsbc.com', name: 'HSBC Bank', category: 'Banking' },
];

// Email templates
interface SeedEmail {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  emailType: string;
  priority: string;
  topic: string;
  hasActionItem?: boolean;
  actionItemTitle?: string;
  financialImpact?: number;
  followUpDate?: string;
  urgency?: boolean;
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

const EMAILS: SeedEmail[] = [
  // Banking - AWS
  { id: 'email-1', sender: 'aws.amazon.com', subject: 'AWS Invoice for March 2026', snippet: 'Your AWS invoice for March is ready. Total amount: $247.12 due April 1.', emailType: 'updates', priority: 'high', topic: 'topic-aws', hasActionItem: true, actionItemTitle: 'Pay AWS bill by April 1', financialImpact: 247.12, followUpDate: 'Apr 1', daysAgo: 0, hoursAgo: 2 },
  { id: 'email-2', sender: 'aws.amazon.com', subject: 'EC2 Instance Usage Alert', snippet: 'Your EC2 usage has increased by 40% this month. Current spend: $156.40.', emailType: 'updates', priority: 'medium', topic: 'topic-aws', daysAgo: 4 },
  { id: 'email-3', sender: 'aws.amazon.com', subject: 'Security Hub Findings Report', snippet: '3 security findings require your attention in Security Hub.', emailType: 'regular', priority: 'high', topic: 'topic-aws', hasActionItem: true, actionItemTitle: 'Review Security Hub findings', daysAgo: 6 },

  // Banking - Chase
  { id: 'email-4', sender: 'chase.com', subject: 'Your March Statement is Ready', snippet: 'Your March credit card statement is now available. Balance: $1,245.00', emailType: 'updates', priority: 'high', topic: 'topic-chase', hasActionItem: true, actionItemTitle: 'Pay credit card bill by April 15', financialImpact: 1245, followUpDate: 'Apr 15', daysAgo: 2 },
  { id: 'email-5', sender: 'chase.com', subject: 'Payment Confirmation - $500 Received', snippet: 'Your payment of $500.00 has been successfully processed.', emailType: 'updates', priority: 'medium', topic: 'topic-chase', financialImpact: 500, daysAgo: 5 },
  { id: 'email-6', sender: 'chase.com', subject: 'Fraud Alert: Unusual Activity Detected', snippet: 'We detected unusual activity on your card ending in 4532. Please verify recent transactions.', emailType: 'regular', priority: 'high', topic: 'topic-chase', hasActionItem: true, actionItemTitle: 'Review and verify recent transactions', urgency: true, daysAgo: 1 },
  { id: 'email-7', sender: 'chase.com', subject: 'New Rewards Points Available', snippet: 'You have earned 2,500 new reward points this month. Total: 45,000 points.', emailType: 'updates', priority: 'low', topic: 'topic-chase', daysAgo: 7 },
  { id: 'email-8', sender: 'chase.com', subject: 'Account Security Update Required', snippet: 'Please update your security settings to enable two-factor authentication.', emailType: 'regular', priority: 'medium', topic: 'topic-chase', hasActionItem: true, actionItemTitle: 'Enable two-factor authentication', daysAgo: 10 },

  // Banking - HSBC
  { id: 'email-9', sender: 'hsbc.com', subject: 'Monthly Statement Available', snippet: 'Your HSBC checking account statement for March is ready.', emailType: 'updates', priority: 'medium', topic: 'topic-hsbc', daysAgo: 3 },
  { id: 'email-10', sender: 'hsbc.com', subject: 'Wire Transfer Confirmation', snippet: 'Wire transfer of $2,500 to Client ABC has been completed.', emailType: 'regular', priority: 'high', topic: 'topic-hsbc', financialImpact: 2500, daysAgo: 8 },
  { id: 'email-11', sender: 'hsbc.com', subject: 'Interest Rate Change Notice', snippet: 'Effective April 1, savings account interest rate will change to 4.25% APY.', emailType: 'updates', priority: 'low', topic: 'topic-hsbc', daysAgo: 12 },
  { id: 'email-12', sender: 'hsbc.com', subject: 'Account Maintenance Scheduled', snippet: 'Scheduled maintenance on March 28, 2-4 AM EST.', emailType: 'updates', priority: 'low', topic: 'topic-hsbc', daysAgo: 14 },

  // Shopping - Amazon
  { id: 'email-13', sender: 'amazon.com', subject: 'Your order has shipped!', snippet: 'Order #123-456 has shipped and will arrive by March 22.', emailType: 'updates', priority: 'low', topic: 'topic-amazon', daysAgo: 0, hoursAgo: 5 },
  { id: 'email-14', sender: 'amazon.com', subject: '50% Off Electronics - Today Only!', snippet: 'Save big on electronics today. Use code SAVE50 at checkout.', emailType: 'promotional', priority: 'medium', topic: 'topic-amazon', deal: { title: '50% Off Electronics', code: 'SAVE50', brand: 'Amazon', category: 'Electronics', expiryDays: 7, value: '50%' }, daysAgo: 1 },
  { id: 'email-15', sender: 'amazon.com', subject: 'Your Amazon Order #789-012 Delivered', snippet: 'Your package was delivered to your front door.', emailType: 'updates', priority: 'low', topic: 'topic-amazon', daysAgo: 3 },
  { id: 'email-16', sender: 'amazon.com', subject: 'Deal Alert: Save 30% on Home & Kitchen', snippet: 'Discover amazing deals on home essentials. Limited time offer.', emailType: 'promotional', priority: 'low', topic: 'topic-amazon', deal: { title: '30% Off Home & Kitchen', code: 'HOME30', brand: 'Amazon', category: 'Home', expiryDays: 5, value: '30%' }, daysAgo: 4 },
  { id: 'email-17', sender: 'amazon.com', subject: 'Your Subscribe & Save Order is Coming', snippet: 'Your subscription order will ship on March 25. Total: $45.99.', emailType: 'updates', priority: 'medium', topic: 'topic-amazon', hasActionItem: true, actionItemTitle: 'Review subscription items before March 25', followUpDate: 'Mar 25', daysAgo: 5 },
  { id: 'email-18', sender: 'amazon.com', subject: 'Prime Day Early Access: Exclusive Deals', snippet: 'As a Prime member, get early access to Prime Day deals.', emailType: 'promotional', priority: 'low', topic: 'topic-amazon', deal: { title: 'Prime Day Early Access', code: 'PRIME2026', brand: 'Amazon', category: 'General', expiryDays: 14, value: 'Up to 70%' }, daysAgo: 7 },
  { id: 'email-19', sender: 'amazon.com', subject: 'Return Request Approved', snippet: 'Your return for Order #345-678 has been approved. Refund: $89.99.', emailType: 'updates', priority: 'medium', topic: 'topic-amazon', financialImpact: -89.99, daysAgo: 10 },
  { id: 'email-20', sender: 'amazon.com', subject: 'New from Amazon: Smart Home Devices', snippet: 'Discover the latest smart home devices with Alexa integration.', emailType: 'promotional', priority: 'low', topic: 'topic-amazon', daysAgo: 14 },

  // Shopping - Target
  { id: 'email-21', sender: 'target.com', subject: 'Free Shipping on Orders $50+', snippet: 'Use code FREESHIP for free shipping on your next order.', emailType: 'promotional', priority: 'low', topic: 'topic-target', deal: { title: 'Free Shipping on Orders $50+', code: 'FREESHIP', brand: 'Target', category: 'General', expiryDays: 14, value: 'Free Shipping', minPurchase: '$50' }, daysAgo: 2 },
  { id: 'email-22', sender: 'target.com', subject: 'Your Target Order is Ready for Pickup', snippet: 'Order #TGT-789 is ready at your selected store.', emailType: 'updates', priority: 'medium', topic: 'topic-target', hasActionItem: true, actionItemTitle: 'Pick up order within 3 days', followUpDate: 'Mar 24', daysAgo: 0, hoursAgo: 8 },
  { id: 'email-23', sender: 'target.com', subject: 'Circle Rewards: You Earned $10', snippet: 'You have $10 in Target Circle rewards to use on your next purchase.', emailType: 'updates', priority: 'medium', topic: 'topic-target', daysAgo: 6 },
  { id: 'email-24', sender: 'target.com', subject: 'Weekly Ad: New Deals Inside', snippet: "Check out this week's best deals at your local Target.", emailType: 'promotional', priority: 'low', topic: 'topic-target', daysAgo: 9 },

  // Shopping - Best Buy
  { id: 'email-25', sender: 'bestbuy.com', subject: '$20 Off Your Next Purchase', snippet: 'As a thank you, enjoy $20 off your next purchase of $100+.', emailType: 'promotional', priority: 'medium', topic: 'topic-bestbuy', deal: { title: '$20 Off Your Order', code: 'SAVE20', brand: 'Best Buy', category: 'Electronics', expiryDays: 3, value: '$20', minPurchase: '$100' }, daysAgo: 1 },
  { id: 'email-26', sender: 'bestbuy.com', subject: 'Your Geek Squad Appointment Confirmed', snippet: 'Your appointment is scheduled for March 23 at 2:00 PM.', emailType: 'regular', priority: 'medium', topic: 'topic-bestbuy', hasActionItem: true, actionItemTitle: 'Attend Geek Squad appointment on Mar 23', followUpDate: 'Mar 23', daysAgo: 4 },
  { id: 'email-27', sender: 'bestbuy.com', subject: 'Order #BB-456 Shipped', snippet: 'Your order has shipped. Expected delivery: March 24.', emailType: 'updates', priority: 'low', topic: 'topic-bestbuy', daysAgo: 5 },

  // Travel - Delta
  { id: 'email-28', sender: 'delta.com', subject: 'Flight Confirmation: LAX to JFK', snippet: 'Your flight DL123 on April 5 is confirmed. Departure: 8:00 AM.', emailType: 'regular', priority: 'high', topic: 'topic-delta', hasActionItem: true, actionItemTitle: 'Check in 24 hours before departure', followUpDate: 'Apr 4', daysAgo: 3 },
  { id: 'email-29', sender: 'delta.com', subject: 'SkyMiles Update: You Earned 5,000 Miles', snippet: 'Your recent trip earned 5,000 bonus miles. Total balance: 125,000.', emailType: 'updates', priority: 'low', topic: 'topic-delta', daysAgo: 7 },
  { id: 'email-30', sender: 'delta.com', subject: 'Gate Change Alert: Flight DL456', snippet: 'Your flight DL456 has changed gates. New gate: B42.', emailType: 'regular', priority: 'high', topic: 'topic-delta', urgency: true, daysAgo: 0, hoursAgo: 1 },

  // Travel - Airbnb
  { id: 'email-31', sender: 'airbnb.com', subject: 'Reservation Confirmed: Miami Beach', snippet: 'Your stay at Ocean View Villa is confirmed for April 10-15.', emailType: 'regular', priority: 'high', topic: 'topic-airbnb', hasActionItem: true, actionItemTitle: 'Complete guest verification before check-in', followUpDate: 'Apr 8', financialImpact: 850, daysAgo: 4 },
  { id: 'email-32', sender: 'airbnb.com', subject: 'Review Your Recent Stay', snippet: 'How was your stay at Downtown Loft? Leave a review.', emailType: 'updates', priority: 'low', topic: 'topic-airbnb', hasActionItem: true, actionItemTitle: 'Leave a review for your recent stay', daysAgo: 10 },
  { id: 'email-33', sender: 'airbnb.com', subject: 'Host Special Offer: 15% Off', snippet: 'The host is offering 15% off your next booking at this property.', emailType: 'promotional', priority: 'medium', topic: 'topic-airbnb', deal: { title: '15% Off Next Stay', code: 'HOST15', brand: 'Airbnb', category: 'Travel', expiryDays: 30, value: '15%' }, daysAgo: 12 },

  // Health - Kaiser
  { id: 'email-34', sender: 'kaiserpermanente.org', subject: 'Appointment Reminder: Dr. Smith', snippet: 'Your appointment is scheduled for March 25 at 10:00 AM.', emailType: 'regular', priority: 'high', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Attend appointment on Mar 25', followUpDate: 'Mar 25', daysAgo: 2 },
  { id: 'email-35', sender: 'kaiserpermanente.org', subject: 'Lab Results Available', snippet: 'Your recent lab results are now available in your patient portal.', emailType: 'updates', priority: 'medium', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Review lab results', daysAgo: 5 },
  { id: 'email-36', sender: 'kaiserpermanente.org', subject: 'Prescription Ready for Pickup', snippet: 'Your prescription is ready at the pharmacy. Pickup by March 24.', emailType: 'regular', priority: 'medium', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Pick up prescription by Mar 24', followUpDate: 'Mar 24', daysAgo: 1 },
  { id: 'email-37', sender: 'kaiserpermanente.org', subject: 'Annual Wellness Exam Due', snippet: "It's time to schedule your annual wellness exam.", emailType: 'regular', priority: 'medium', topic: 'topic-kaiser', hasActionItem: true, actionItemTitle: 'Schedule annual wellness exam', daysAgo: 14 },

  // Education - Udemy
  { id: 'email-38', sender: 'udemy.com', subject: '30% Off Courses - Learn Something New!', snippet: 'Expand your skills with 30% off thousands of courses.', emailType: 'promotional', priority: 'low', topic: 'topic-udemy', deal: { title: '30% Off Courses', code: 'LEARN30', brand: 'Udemy', category: 'Education', expiryDays: 5, value: '30%' }, daysAgo: 1 },
  { id: 'email-39', sender: 'udemy.com', subject: 'Course Completed: React Advanced Patterns', snippet: "Congratulations! You've completed the course. Download your certificate.", emailType: 'updates', priority: 'low', topic: 'topic-udemy', daysAgo: 6 },
  { id: 'email-40', sender: 'udemy.com', subject: 'New Course Recommendation: TypeScript Mastery', snippet: 'Based on your learning, we recommend TypeScript Mastery.', emailType: 'promotional', priority: 'low', topic: 'topic-udemy', daysAgo: 9 },

  // Education - Coursera
  { id: 'email-41', sender: 'coursera.org', subject: 'Certificate Earned: Machine Learning', snippet: "You've earned a certificate from Stanford University.", emailType: 'updates', priority: 'medium', topic: 'topic-coursera', daysAgo: 8 },
  { id: 'email-42', sender: 'coursera.org', subject: 'Course Starting Soon: Data Science Fundamentals', snippet: 'Your enrolled course begins on March 28.', emailType: 'regular', priority: 'medium', topic: 'topic-coursera', hasActionItem: true, actionItemTitle: 'Prepare for course start on Mar 28', followUpDate: 'Mar 28', daysAgo: 11 },

  // Technology - GitHub
  { id: 'email-43', sender: 'github.com', subject: 'Pull Request #42 Needs Your Review', snippet: 'user123 requested your review on PR: Add authentication module.', emailType: 'regular', priority: 'high', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Review Pull Request #42', daysAgo: 0, hoursAgo: 3 },
  { id: 'email-44', sender: 'github.com', subject: 'Security Alert: Vulnerability Detected', snippet: 'A critical vulnerability was found in lodash dependency.', emailType: 'regular', priority: 'high', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Update lodash dependency', urgency: true, daysAgo: 2 },
  { id: 'email-45', sender: 'github.com', subject: 'Your Repository Has New Stars', snippet: 'my-awesome-project received 15 new stars this week.', emailType: 'updates', priority: 'low', topic: 'topic-github', daysAgo: 5 },
  { id: 'email-46', sender: 'github.com', subject: 'Issue #128 Assigned to You', snippet: 'Fix navigation bug on mobile devices has been assigned to you.', emailType: 'regular', priority: 'medium', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Resolve Issue #128', daysAgo: 7 },
  { id: 'email-47', sender: 'github.com', subject: 'Actions Workflow Failed', snippet: 'CI workflow failed on main branch. 2 tests failed.', emailType: 'regular', priority: 'high', topic: 'topic-github', hasActionItem: true, actionItemTitle: 'Fix failing CI tests', daysAgo: 4 },

  // Technology - Vercel
  { id: 'email-48', sender: 'vercel.com', subject: 'Deployment Successful: my-app v1.2.0', snippet: 'Your deployment to production is live at my-app.vercel.app.', emailType: 'updates', priority: 'medium', topic: 'topic-vercel', daysAgo: 1 },
  { id: 'email-49', sender: 'vercel.com', subject: 'Build Error Detected', snippet: 'Build failed on preview branch. Error: Module not found.', emailType: 'regular', priority: 'high', topic: 'topic-vercel', hasActionItem: true, actionItemTitle: 'Fix build error on preview branch', daysAgo: 3 },
  { id: 'email-50', sender: 'vercel.com', subject: 'Monthly Usage Report', snippet: 'Your bandwidth usage: 45GB of 100GB. Functions: 2.1M invocations.', emailType: 'updates', priority: 'low', topic: 'topic-vercel', daysAgo: 10 },
];

// Topic summaries
const TOPIC_SUMMARIES: Record<string, string> = {
  'topic-banking': 'Banking-related communications including statements, payment confirmations, and account alerts from Chase, HSBC, and AWS.',
  'topic-chase': 'Chase Bank communications including credit card statements, payment confirmations, fraud alerts, and rewards updates.',
  'topic-hsbc': 'HSBC banking updates including checking account statements, wire transfer confirmations, and account maintenance notices.',
  'topic-aws': 'Amazon Web Services billing and usage notifications. Current monthly spend is $247.12 with EC2 being the largest component.',
  'topic-shopping': 'Shopping-related emails from Amazon, Target, and Best Buy including order confirmations, shipping updates, and promotional offers.',
  'topic-amazon': 'Amazon order updates, shipping notifications, and promotional deals. Multiple active deals available.',
  'topic-target': 'Target order updates, Circle rewards notifications, and weekly deals.',
  'topic-bestbuy': 'Best Buy purchase confirmations, Geek Squad appointments, and promotional offers.',
  'topic-travel': 'Travel-related communications from Delta Airlines and Airbnb including flight confirmations and reservation details.',
  'topic-delta': 'Delta Airlines flight confirmations, gate changes, and SkyMiles updates.',
  'topic-airbnb': 'Airbnb reservation confirmations, host messages, and promotional offers.',
  'topic-health': 'Health-related communications from Kaiser Permanente including appointment reminders and lab results.',
  'topic-kaiser': 'Kaiser Permanente healthcare updates including appointments, lab results, and prescription notifications.',
  'topic-education': 'Online learning platform updates from Udemy and Coursera including course completions and certificates.',
  'topic-udemy': 'Udemy course updates and promotional offers. Active deal: 30% off courses.',
  'topic-coursera': 'Coursera course updates and certificates. Earned Machine Learning certificate from Stanford.',
  'topic-technology': 'Technology platform updates from GitHub and Vercel including pull requests and deployment notifications.',
  'topic-github': 'GitHub repository updates, pull requests, and security alerts.',
  'topic-vercel': 'Vercel deployment notifications and usage reports.',
  'topic-entertainment': 'Entertainment platform updates from Netflix and Spotify.',
  'topic-netflix': 'Netflix viewing recommendations and account activity.',
  'topic-spotify': 'Spotify listening activity and recommendations.',
  'topic-social': 'Social media platform updates from LinkedIn.',
  'topic-linkedin': 'LinkedIn professional network updates including endorsements and connection requests.',
  'topic-projects': 'Project-related communications from Client ABC.',
  'topic-clientabc': 'Client ABC project communications including sprint reviews, invoices, and contract discussions.',
};

// Sender summaries
const SENDER_SUMMARIES: Record<string, string> = {
  'amazon.com': 'Amazon is your most active sender, primarily sending order confirmations, shipping updates, and promotional offers.',
  'chase.com': 'Chase Bank sends credit card statements, payment confirmations, and security alerts.',
  'aws.amazon.com': 'AWS provides billing statements, usage alerts, and security notifications.',
  'target.com': 'Target sends order confirmations, pickup notifications, and Circle rewards updates.',
  'bestbuy.com': 'Best Buy provides purchase confirmations, Geek Squad appointments, and promotional deals.',
  'delta.com': 'Delta Airlines sends flight confirmations, gate changes, and SkyMiles updates.',
  'airbnb.com': 'Airbnb provides reservation confirmations, host messages, and promotional offers.',
  'kaiserpermanente.org': 'Kaiser Permanente sends appointment reminders, lab results, and prescription notifications.',
  'udemy.com': 'Udemy provides course updates, completion certificates, and promotional deals.',
  'coursera.org': 'Coursera sends course updates and certificate notifications.',
  'github.com': 'GitHub provides pull request notifications, security alerts, and repository updates.',
  'vercel.com': 'Vercel sends deployment notifications, build alerts, and usage reports.',
  'netflix.com': 'Netflix provides viewing recommendations and account activity alerts.',
  'spotify.com': 'Spotify sends listening activity summaries and personalized recommendations.',
  'linkedin.com': 'LinkedIn provides professional network updates, endorsements, and job recommendations.',
  'company.com': 'Client ABC project communications including sprint reviews and invoices.',
  'hsbc.com': 'HSBC Bank sends account statements, wire transfer confirmations, and maintenance notices.',
};

/**
 * Seed the database with sample data
 */
export async function seedDatabase(client: Client): Promise<{ success: boolean; stats: Record<string, number> }> {
  console.log('🌱 Starting database seed...');

  const stats = {
    emails: 0,
    timelineUpdates: 0,
    deals: 0,
    topics: 0,
    topicSummaries: 0,
    senderSummaries: 0,
  };

  try {
    // Clear existing data
    console.log('  Clearing existing data...');
    await client.execute('DELETE FROM email_topics');
    await client.execute('DELETE FROM topic_summaries');
    await client.execute('DELETE FROM sender_summaries');
    await client.execute('DELETE FROM deals');
    await client.execute('DELETE FROM timeline_updates');
    await client.execute('DELETE FROM emails');
    await client.execute('DELETE FROM topics');

    // Insert topics
    console.log('  Inserting topics...');
    for (const topic of TOPICS) {
      await client.execute({
        sql: 'INSERT INTO topics (id, parent_id, name, full_path, email_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [topic.id, topic.parentId, topic.name, topic.fullPath, topic.emailCount, Date.now()]
      });
    }
    stats.topics = TOPICS.length;

    // Insert emails and related data
    console.log('  Inserting emails and related data...');
    let dealCount = 0;

    for (const email of EMAILS) {
      const sender = SENDERS.find(s => s.domain === email.sender);
      if (!sender) continue;

      const threadId = `thread-${email.id}`;
      const receivedAt = email.hoursAgo
        ? hoursAgo(email.hoursAgo).getTime()
        : daysAgo(email.daysAgo || 0).getTime();

      // Insert email
      await client.execute({
        sql: `INSERT INTO emails (id, thread_id, sender_email, sender_name, sender_domain, subject, snippet,
          received_at, email_type, gmail_category, is_important, is_read, is_archived, is_deleted,
          is_processed, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email.id, threadId, `noreply@${sender.domain}`, sender.name, sender.domain,
          email.subject, email.snippet, receivedAt, email.emailType, sender.category,
          email.priority === 'high' ? 1 : 0, 1, 0, 0, 1, receivedAt, receivedAt
        ]
      });
      stats.emails++;

      // Insert timeline update
      const title = email.subject.replace(/^(Re: |Fwd: |🔥 )/, '');
      const keyEntities = email.followUpDate
        ? JSON.stringify({ dates: [email.followUpDate], amounts: email.financialImpact ? [email.financialImpact] : [], names: [sender.name] })
        : null;

      await client.execute({
        sql: `INSERT INTO timeline_updates (id, email_id, title, description, summary, priority, sentiment,
          urgency, importance_reason, action_item, action_item_title, follow_up_date, financial_impact,
          key_entities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `update-${email.id}`, email.id, title, email.snippet, email.snippet,
          email.priority, email.financialImpact && email.financialImpact > 0 ? 'neutral' : 'positive',
          email.urgency ? 1 : 0, email.priority === 'high' ? 'Requires immediate attention' : null,
          email.hasActionItem ? 1 : 0, email.actionItemTitle || null, email.followUpDate || null,
          email.financialImpact || null, keyEntities, receivedAt
        ]
      });
      stats.timelineUpdates++;

      // Insert deal if applicable
      if (email.deal) {
        dealCount++;
        await client.execute({
          sql: `INSERT INTO deals (id, email_id, deal_title, deal_description, brand_name, deal_category,
            deal_value, deal_value_type, deal_code, minimum_purchase, deal_expiry, created_at,
            is_active, used_at, dismissed_at, deal_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `deal-${dealCount}`, email.id, email.deal.title, email.snippet,
            email.deal.brand, email.deal.category, email.deal.value,
            email.deal.value.includes('%') ? 'percentage' : 'fixed_amount',
            email.deal.code, email.deal.minPurchase || null,
            daysFromNow(email.deal.expiryDays).getTime(), receivedAt, 1, null, null, null
          ]
        });
        stats.deals++;
      }

      // Insert email-topic relationship
      await client.execute({
        sql: 'INSERT INTO email_topics (email_id, topic_id, confidence_score) VALUES (?, ?, ?)',
        args: [email.id, email.topic, 0.85 + Math.random() * 0.14]
      });
    }

    // Insert topic summaries
    console.log('  Inserting topic summaries...');
    for (const [topicId, summary] of Object.entries(TOPIC_SUMMARIES)) {
      await client.execute({
        sql: 'INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, update_count) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`ts-${topicId}`, topicId, summary, summary.split(' ').length, Date.now(), Math.floor(Math.random() * 10) + 1]
      });
      stats.topicSummaries++;
    }

    // Insert sender summaries
    console.log('  Inserting sender summaries...');
    for (const [domain, summary] of Object.entries(SENDER_SUMMARIES)) {
      await client.execute({
        sql: 'INSERT INTO sender_summaries (id, sender_domain, summary, word_count, last_updated, update_count) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`ss-${domain.replace(/\./g, '-')}`, domain, summary, summary.split(' ').length, Date.now(), 1]
      });
      stats.senderSummaries++;
    }

    console.log('✅ Database seed completed successfully!');
    console.log(`   - ${stats.emails} emails`);
    console.log(`   - ${stats.timelineUpdates} timeline updates`);
    console.log(`   - ${stats.deals} deals`);
    console.log(`   - ${stats.topics} topics`);
    console.log(`   - ${stats.topicSummaries} topic summaries`);
    console.log(`   - ${stats.senderSummaries} sender summaries`);

    return { success: true, stats };
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}
