/**
 * Comprehensive seed data for TuskerBrain
 * Creates realistic test data for all database tables
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '/Users/hashanw/Developer/TuskerBrain/database/schema';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
const now = () => new Date();

// ---------------------------------------------------------------------------
// Email body content — 10 realistic emails with plain + HTML
// ---------------------------------------------------------------------------
const EMAIL_BODIES: Array<{ plain: string; html: string }> = [
  // 0. Banking statement
  {
    plain: `Dear Valued Customer,

Your March credit card statement is now available for viewing. Please review the charges and pay by the due date of April 15, 2026.

Summary:
- Current Balance: $1,245.00
- Minimum Payment: $25.00
- Due Date: April 15, 2026
- Available Credit: $8,750.00
- Last Payment: $500.00 on March 10

If you have questions about your statement, please call 1-800-955-9060. We are available Monday through Friday, 8 AM to 10 PM EST.

Thank you for your continued business.

Sincerely,
Chase Customer Service`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<p>Dear Valued Customer,</p>
<p>Your March credit card statement is now available for viewing. Please review the charges and pay by the due date of April 15, 2026.</p>
<table style="border-collapse: collapse; width: 400px;">
<tr><td style="padding: 8px; font-weight: bold;">Current Balance:</td><td>$1,245.00</td></tr>
<tr><td style="padding: 8px; font-weight: bold;">Minimum Payment:</td><td>$25.00</td></tr>
<tr><td style="padding: 8px; font-weight: bold;">Due Date:</td><td>April 15, 2026</td></tr>
<tr><td style="padding: 8px; font-weight: bold;">Available Credit:</td><td>$8,750.00</td></tr>
<tr><td style="padding: 8px; font-weight: bold;">Last Payment:</td><td>$500.00 on March 10</td></tr>
</table>
<p>Thank you for your continued business.</p>
<p>Sincerely,<br>Chase Customer Service</p>
</body></html>`,
  },
  // 1. Amazon shipping notification
  {
    plain: `Your Amazon Order #123-456 has been shipped!

Tracking Number: 1Z999W9999999999999
Carrier: UPS
Estimated Delivery: March 22, 2026

Items:
- Wireless Headphones (Blue) - $79.99
- Phone Case - $19.99
- USB Cable - $12.99

Shipping Address: 123 Main Street, Apt 4B, San Francisco, CA 94105

Total: $112.97 (including tax)

Thank you for shopping with Amazon!`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<h2>Your Amazon Order has shipped!</h2>
<p><strong>Tracking Number:</strong> 1Z999W9999999999999<br>
<strong>Carrier:</strong> UPS<br>
<strong>Estimated Delivery:</strong> March 22, 2026</p>
<h3>Items:</h3>
<ul>
<li>Wireless Headphones (Blue) - $79.99</li>
<li>Phone Case - $19.99</li>
<li>USB Cable - $12.99</li>
</ul>
<p><strong>Total:</strong> $112.97 (including tax)</p>
<p>Thank you for shopping with Amazon!</p>
</body></html>`,
  },
  // 2. Security alert
  {
    plain: `Security Alert: Unusual Activity Detected

We've detected unusual activity on your account:

Location: New York, NY
Time: March 18, 2026 2:30 PM
Amount: $150.00
Merchant: Best Buy

If this was you, no action is needed. If you don't recognize this transaction, please contact us immediately at 1-800-955-9060.

Your card ending in: 4532
Reference ID: TXN-987654321`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<div style="background-color: #fff3cd; border: 1px solid #dc3545; padding: 20px; margin: 20px 0;">
<h3 style="color: #c00; margin-top: 0;">Security Alert: Unusual Activity Detected</h3>
<p>We've detected unusual activity on your account:</p>
<table>
<tr><td><strong>Location:</strong> New York, NY</td></tr>
<tr><td><strong>Time:</strong> March 18, 2026 2:30 PM</td></tr>
<tr><td><strong>Amount:</strong> $150.00</td></tr>
<tr><td><strong>Merchant:</strong> Best Buy</td></tr>
</table>
<p>If this was you, no action is needed. If you don't recognize this transaction, please contact us immediately.</p>
<p><strong>Your card ending in:</strong> 4532</p>
</div>
</body></html>`,
  },
  // 3. Flight gate change
  {
    plain: `Delta Airlines - Flight Change Notification

Important: Your flight has changed gates

Flight: DL456
From: Los Angeles (LAX) to Chicago (ORD)
Original Gate: A12
New Gate: B42
Departure: March 18, 2026 6:45 PM
Seat: 14A

Please proceed to your new gate at least 30 minutes before departure.

Delta Airlines Customer Support`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<h2 style="color: #003366;">Delta Airlines - Flight Change</h2>
<p><strong>Important:</strong> Your flight has changed gates</p>
<table style="border-collapse: collapse; width: 400px; margin: 15px 0;">
<tr><td><strong>Flight:</strong> DL456</td></tr>
<tr><td><strong>From:</strong> Los Angeles (LAX) to Chicago (ORD)</td></tr>
<tr><td><strong>Original Gate:</strong> A12</td></tr>
<tr><td><strong>New Gate:</strong> B42</td></tr>
<tr><td><strong>Departure:</strong> March 18, 2026 6:45 PM</td></tr>
<tr><td><strong>Seat:</strong> 14A</td></tr>
</table>
<p>Please proceed to your new gate at least 30 minutes before departure.</p>
<p>Delta Airlines Customer Support</p>
</body></html>`,
  },
  // 4. GitHub PR review
  {
    plain: `Hi there,

user123 requested your review on Pull Request #42: Add authentication module

Description:
This PR adds JWT-based authentication to the existing Express.js application. It includes:
- New middleware for token verification
- Updated user model with refresh token support
- Added login/logout endpoints
- Unit tests for all new endpoints

Files changed:
- src/middleware/auth.ts (new)
- src/models/user.ts (modified)
- src/routes/auth.ts (new)
- tests/auth.test.ts (new)

Please review the code changes and leave your feedback.

Thanks!
user123`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<h2>Pull Request #42 Needs Your Review</h2>
<p><strong>user123</strong> requested your review on <a href="#">PR: Add authentication module</a></p>
<h3>Description:</h3>
<p>This PR adds JWT-based authentication to the existing Express.js application.</p>
<ul>
<li>New middleware for token verification</li>
<li>Updated user model with refresh token support</li>
<li>Added login/logout endpoints</li>
<li>Unit tests for all new endpoints</li>
</ul>
<h3>Files changed:</h3>
<ul>
<li><code>src/middleware/auth.ts</code> (new)</li>
<li><code>src/models/user.ts</code> (modified)</li>
<li><code>src/routes/auth.ts</code> (new)</li>
<li><code>tests/auth.test.ts</code> (new)</li>
</ul>
<p>Thanks!<br><strong>user123</strong></p>
</body></html>`,
  },
  // 5. AWS billing
  {
    plain: `AWS Invoice for March 2026

Dear Customer,

Your AWS invoice for the billing period March 1-31, 2026 is now available.

Invoice Summary:
- EC2 Instances: $156.40
- S3 Storage: $12.50
- RDS Database: $45.22
- CloudFront: $18.60
- Lambda Functions: $14.45

Total: $247.12

Payment will be charged to your default payment method on file.

Amazon Web Services`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<h2>AWS Invoice for March 2026</h2>
<p>Dear Customer,</p>
<p>Your AWS invoice for the billing period March 1-31, 2026 is now available.</p>
<h3>Invoice Summary:</h3>
<table style="border-collapse: collapse; width: 300px;">
<tr><td>EC2 Instances:</td><td>$156.40</td></tr>
<tr><td>S3 Storage:</td><td>$12.50</td></tr>
<tr><td>RDS Database:</td><td>$45.22</td></tr>
<tr><td>CloudFront:</td><td>$18.60</td></tr>
<tr><td>Lambda Functions:</td><td>$14.45</td></tr>
<tr style="font-weight: bold;"><td>Total:</td><td>$247.12</td></tr>
</table>
<p>Amazon Web Services</p>
</body></html>`,
  },
  // 6. Airbnb reservation
  {
    plain: `Reservation Confirmed: Ocean View Villa

Great news! Your reservation is confirmed.

Reservation Details:
Property: Ocean View Villa
Location: Miami Beach, FL
Check-in: April 10, 2026 (4:00 PM)
Check-out: April 15, 2026 (11:00 AM)
Guests: 2 adults
Total: $850.00

Confirmation Code: ABC-XYZ-2026

What to do next:
1. Complete guest verification before check-in
2. Review house rules
3. Plan your arrival transportation

Airbnb Reservations`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<div style="background-color: #ff5a5f; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
<h2 style="margin: 0;">Reservation Confirmed!</h2>
</div>
<h3>Reservation Details:</h3>
<table style="border-collapse: collapse; width: 350px;">
<tr><td><strong>Property:</strong></td><td>Ocean View Villa</td></tr>
<tr><td><strong>Location:</strong></td><td>Miami Beach, FL</td></tr>
<tr><td><strong>Check-in:</strong></td><td>April 10, 2026 (4:00 PM)</td></tr>
<tr><td><strong>Check-out:</strong></td><td>April 15, 2026 (11:00 AM)</td></tr>
<tr><td><strong>Guests:</strong></td><td>2 adults</td></tr>
<tr><td><strong>Total:</strong></td><td>$850.00</td></tr>
</table>
<p>Airbnb Reservations</p>
</body></html>`,
  },
  // 7. Kaiser appointment
  {
    plain: `Appointment Reminder: Dr. Smith

Your upcoming appointment:

Provider: Dr. Sarah Smith, MD
Specialty: Internal Medicine
Date: March 25, 2026
Time: 10:00 AM
Location: Kaiser Permanente Medical Center, 500 Olive Drive, San Francisco, CA 94105
Building: Main Building, Suite 302

Please bring:
- Photo ID
- Insurance card
- List of current medications
- Any recent lab results

If you need to reschedule, please call 415-555-0199.

Kaiser Permanente`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<h2>Appointment Reminder: Dr. Smith</h2>
<table style="border-collapse: collapse; width: 350px; margin: 15px 0;">
<tr><td><strong>Provider:</strong></td><td>Dr. Sarah Smith, MD</td></tr>
<tr><td><strong>Date:</strong></td><td>March 25, 2026</td></tr>
<tr><td><strong>Time:</strong></td><td>10:00 AM</td></tr>
<tr><td><strong>Location:</strong></td><td>Kaiser Permanente Medical Center</td></tr>
</table>
<h3>Please bring:</h3>
<ul>
<li>Photo ID</li>
<li>Insurance card</li>
<li>List of current medications</li>
</ul>
<p>Kaiser Permanente</p>
</body></html>`,
  },
  // 8. Udemy course completion
  {
    plain: `Course Completed: React Advanced Patterns

Congratulations! You have successfully completed the React Advanced Patterns course.

Certificate Details:
- Course: React Advanced Patterns
- Completion Date: March 18, 2026
- Certificate ID: UDEMY-2026-ABC123
- Duration: 12 hours
- Rating: 4.8/5

Keep learning! Check out our recommended courses for your next steps.

Udemy Team`,
    html: `<html><body style="font-family: Arial, sans-serif;">
<div style="background-color: #4CAF50; color: white; padding: 20px; border-radius: 8px; text-align: center;">
<h1 style="margin: 0;">Congratulations!</h1>
</div>
<p>You have successfully completed the <strong>React Advanced Patterns</strong> course.</p>
<ul>
<li><strong>Completion Date:</strong> March 18, 2026</li>
<li><strong>Certificate ID:</strong> UDEMY-2026-ABC123</li>
<li><strong>Duration:</strong> 12 hours</li>
<li><strong>Rating:</strong> 4.8/5</li>
</ul>
<p>Udemy Team</p>
</body></html>`,
  },
  // 9. Vercel build error
  {
    plain: `Build Error Detected

Your deployment to preview branch failed.

Project: my-app
Branch: preview
Commit: a1b2c3d
Error: Module not found: './utils/helpers'

The module could not be resolved. This is likely because:
1. The file does not exist
2. The import path is incorrect

Build logs:
> npm run build
> Error: Cannot find module './utils/helpers'

Vercel Dashboard: https://vercel.com/my-app/deploy/preview-a1b2c3d`,
    html: `<html><body style="font-family: monospace; background-color: #1a1a2a; color: #e0e0e0; padding: 20px;">
<h2 style="color: #ff6b6b;">Build Error Detected</h2>
<p>Your deployment to preview branch failed.</p>
<p style="color: #ff6b6b; font-weight: bold;">Error: Module not found: './utils/helpers'</p>
<p>The module could not be resolved.</p>
<h3>Build logs:</h3>
<pre style="background-color: #0d0d0d; padding: 10px; border-radius: 4px;">
&gt; npm run build
&gt; Error: Cannot find module './utils/helpers'
</pre>
</body></html>`,
  },
];

// ---------------------------------------------------------------------------
// Gmail labels
// ---------------------------------------------------------------------------
const LABELS = [
  // System labels
  { id: 'label-inbox', name: 'INBOX', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-sent', name: 'SENT', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-draft', name: 'DRAFT', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-spam', name: 'SPAM', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-trash', name: 'TRASH', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-unread', name: 'UNREAD', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-starred', name: 'STARRED', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-important', name: 'IMPORTANT', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-cat-personal', name: 'CATEGORY_PERSONAL', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-cat-social', name: 'CATEGORY_SOCIAL', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-cat-promotions', name: 'CATEGORY_PROMOTIONS', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-cat-updates', name: 'CATEGORY_UPDATES', labelSource: 'gmail-system' as const, labelType: 'system' },
  { id: 'label-cat-forums', name: 'CATEGORY_FORUMS', labelSource: 'gmail-system' as const, labelType: 'system' },

  // User labels
  { id: 'label-finance', name: 'Finance', labelSource: 'gmail-user' as const, labelType: null },
  { id: 'label-travel', name: 'Travel', labelSource: 'gmail-user' as const, labelType: null },
  { id: 'label-work', name: 'Work', labelSource: 'gmail-user' as const, labelType: null },
  { id: 'label-health', name: 'Health', labelSource: 'gmail-user' as const, labelType: null },
  { id: 'label-shopping', name: 'Shopping', labelSource: 'gmail-user' as const, labelType: null },

  // TB topic labels (leaf topics)
  { id: 'label-tb-chase', name: 'TB/Banking/Chase', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-hsbc', name: 'TB/Banking/HSBC', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-aws', name: 'TB/Banking/AWS', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-amazon', name: 'TB/Shopping/Amazon', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-target', name: 'TB/Shopping/Target', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-bestbuy', name: 'TB/Shopping/Best Buy', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-delta', name: 'TB/Travel/Delta', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-airbnb', name: 'TB/Travel/Airbnb', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-kaiser', name: 'TB/Health/Kaiser', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-udemy', name: 'TB/Education/Udemy', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-coursera', name: 'TB/Education/Coursera', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-github', name: 'TB/Technology/GitHub', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-vercel', name: 'TB/Technology/Vercel', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-netflix', name: 'TB/Entertainment/Netflix', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-spotify', name: 'TB/Entertainment/Spotify', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-linkedin', name: 'TB/Social/LinkedIn', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-clientabc', name: 'TB/Projects/Client-ABC', labelSource: 'tb' as const, labelType: 'topic' },

  // TB parent topic labels
  { id: 'label-tb-banking', name: 'TB/Banking', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-shopping', name: 'TB/Shopping', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-travel', name: 'TB/Travel', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-health', name: 'TB/Health', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-education', name: 'TB/Education', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-technology', name: 'TB/Technology', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-entertainment', name: 'TB/Entertainment', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-social', name: 'TB/Social', labelSource: 'tb' as const, labelType: 'topic' },
  { id: 'label-tb-projects', name: 'TB/Projects', labelSource: 'tb' as const, labelType: 'topic' },

  // TB processed label
  { id: 'label-tb-processed', name: 'TB/Processed', labelSource: 'tb' as const, labelType: 'processed' },

  // TB sender labels
  { id: 'label-tb-sender-chase', name: 'TB/Sender/chase.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-aws', name: 'TB/Sender/aws.amazon.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-hsbc', name: 'TB/Sender/hsbc.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-amazon', name: 'TB/Sender/amazon.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-target', name: 'TB/Sender/target.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-bestbuy', name: 'TB/Sender/bestbuy.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-delta', name: 'TB/Sender/delta.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-airbnb', name: 'TB/Sender/airbnb.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-kaiser', name: 'TB/Sender/kaiserpermanente.org', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-udemy', name: 'TB/Sender/udemy.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-coursera', name: 'TB/Sender/coursera.org', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-github', name: 'TB/Sender/github.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-vercel', name: 'TB/Sender/vercel.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-netflix', name: 'TB/Sender/netflix.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-spotify', name: 'TB/Sender/spotify.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-linkedin', name: 'TB/Sender/linkedin.com', labelSource: 'tb' as const, labelType: 'sender' },
  { id: 'label-tb-sender-clientabc', name: 'TB/Sender/clientabc.com', labelSource: 'tb' as const, labelType: 'sender' },
];

// ---------------------------------------------------------------------------
// Topics with hierarchy
// ---------------------------------------------------------------------------
const TOPICS = [
  // Root topics
  { id: 'topic-banking', parentId: null, name: 'Banking', fullPath: 'Banking', emailCount: 12 },
  { id: 'topic-shopping', parentId: null, name: 'Shopping', fullPath: 'Shopping', emailCount: 15 },
  { id: 'topic-travel', parentId: null, name: 'Travel', fullPath: 'Travel', emailCount: 6 },
  { id: 'topic-health', parentId: null, name: 'Health', fullPath: 'Health', emailCount: 4 },
  { id: 'topic-education', parentId: null, name: 'Education', fullPath: 'Education', emailCount: 5 },
  { id: 'topic-technology', parentId: null, name: 'Technology', fullPath: 'Technology', emailCount: 8 },
  { id: 'topic-entertainment', parentId: null, name: 'Entertainment', fullPath: 'Entertainment', emailCount: 2 },
  { id: 'topic-social', parentId: null, name: 'Social', fullPath: 'Social', emailCount: 1 },
  { id: 'topic-projects', parentId: null, name: 'Projects', fullPath: 'Projects', emailCount: 2 },

  // Banking children
  { id: 'topic-chase', parentId: 'topic-banking', name: 'Chase', fullPath: 'Banking/Chase', emailCount: 5, gmailLabelId: 'label-tb-chase' },
  { id: 'topic-hsbc', parentId: 'topic-banking', name: 'HSBC', fullPath: 'Banking/HSBC', emailCount: 4, gmailLabelId: 'label-tb-hsbc' },
  { id: 'topic-aws', parentId: 'topic-banking', name: 'AWS', fullPath: 'Banking/AWS', emailCount: 3, gmailLabelId: 'label-tb-aws' },

  // Shopping children
  { id: 'topic-amazon', parentId: 'topic-shopping', name: 'Amazon', fullPath: 'Shopping/Amazon', emailCount: 8, gmailLabelId: 'label-tb-amazon' },
  { id: 'topic-target', parentId: 'topic-shopping', name: 'Target', fullPath: 'Shopping/Target', emailCount: 4, gmailLabelId: 'label-tb-target' },
  { id: 'topic-bestbuy', parentId: 'topic-shopping', name: 'Best Buy', fullPath: 'Shopping/Best Buy', emailCount: 3, gmailLabelId: 'label-tb-bestbuy' },

  // Travel children
  { id: 'topic-delta', parentId: 'topic-travel', name: 'Delta', fullPath: 'Travel/Delta', emailCount: 3, gmailLabelId: 'label-tb-delta' },
  { id: 'topic-airbnb', parentId: 'topic-travel', name: 'Airbnb', fullPath: 'Travel/Airbnb', emailCount: 3, gmailLabelId: 'label-tb-airbnb' },

  // Health children
  { id: 'topic-kaiser', parentId: 'topic-health', name: 'Kaiser', fullPath: 'Health/Kaiser', emailCount: 4, gmailLabelId: 'label-tb-kaiser' },

  // Education children
  { id: 'topic-udemy', parentId: 'topic-education', name: 'Udemy', fullPath: 'Education/Udemy', emailCount: 3, gmailLabelId: 'label-tb-udemy' },
  { id: 'topic-coursera', parentId: 'topic-education', name: 'Coursera', fullPath: 'Education/Coursera', emailCount: 2, gmailLabelId: 'label-tb-coursera' },

  // Technology children
  { id: 'topic-github', parentId: 'topic-technology', name: 'GitHub', fullPath: 'Technology/GitHub', emailCount: 5, gmailLabelId: 'label-tb-github' },
  { id: 'topic-vercel', parentId: 'topic-technology', name: 'Vercel', fullPath: 'Technology/Vercel', emailCount: 3, gmailLabelId: 'label-tb-vercel' },

  // Entertainment children
  { id: 'topic-netflix', parentId: 'topic-entertainment', name: 'Netflix', fullPath: 'Entertainment/Netflix', emailCount: 1, gmailLabelId: 'label-tb-netflix' },
  { id: 'topic-spotify', parentId: 'topic-entertainment', name: 'Spotify', fullPath: 'Entertainment/Spotify', emailCount: 1, gmailLabelId: 'label-tb-spotify' },

  // Social children
  { id: 'topic-linkedin', parentId: 'topic-social', name: 'LinkedIn', fullPath: 'Social/LinkedIn', emailCount: 1, gmailLabelId: 'label-tb-linkedin' },

  // Projects children
  { id: 'topic-clientabc', parentId: 'topic-projects', name: 'Client-ABC', fullPath: 'Projects/Client-ABC', emailCount: 2, gmailLabelId: 'label-tb-clientabc' },
];

// ---------------------------------------------------------------------------
// Email-to-topic mapping
// ---------------------------------------------------------------------------
const EMAIL_TOPIC_MAP: Record<string, string> = {
  'email-1': 'topic-chase', 'email-2': 'topic-chase', 'email-3': 'topic-chase',
  'email-4': 'topic-chase', 'email-5': 'topic-chase',
  'email-6': 'topic-aws', 'email-7': 'topic-aws', 'email-8': 'topic-aws',
  'email-9': 'topic-hsbc', 'email-10': 'topic-hsbc', 'email-11': 'topic-hsbc', 'email-12': 'topic-hsbc',
  'email-13': 'topic-amazon', 'email-14': 'topic-amazon', 'email-15': 'topic-amazon',
  'email-16': 'topic-amazon', 'email-17': 'topic-amazon', 'email-18': 'topic-amazon',
  'email-19': 'topic-amazon', 'email-20': 'topic-amazon',
  'email-21': 'topic-target', 'email-22': 'topic-target', 'email-23': 'topic-target', 'email-24': 'topic-target',
  'email-25': 'topic-bestbuy', 'email-26': 'topic-bestbuy', 'email-27': 'topic-bestbuy',
  'email-28': 'topic-delta', 'email-29': 'topic-delta', 'email-30': 'topic-delta',
  'email-31': 'topic-airbnb', 'email-32': 'topic-airbnb', 'email-33': 'topic-airbnb',
  'email-34': 'topic-kaiser', 'email-35': 'topic-kaiser', 'email-36': 'topic-kaiser', 'email-37': 'topic-kaiser',
  'email-38': 'topic-udemy', 'email-39': 'topic-udemy', 'email-40': 'topic-udemy',
  'email-41': 'topic-coursera', 'email-42': 'topic-coursera',
  'email-43': 'topic-github', 'email-44': 'topic-github', 'email-45': 'topic-github',
  'email-46': 'topic-github', 'email-47': 'topic-github',
  'email-48': 'topic-vercel', 'email-49': 'topic-vercel', 'email-50': 'topic-vercel',
  'email-51': 'topic-netflix',
  'email-52': 'topic-linkedin',
  'email-53': 'topic-clientabc',
  'email-54': 'topic-spotify',
  'email-55': 'topic-clientabc',
};
// ---------------------------------------------------------------------------
// Emails — 55 realistic test emails
// ---------------------------------------------------------------------------
const EMAILS = [
  // Banking - Chase (5 emails)
  { id: 'email-1', threadId: 'thread-1', senderEmail: 'noreply@chase.com', senderName: 'Chase Bank', senderDomain: 'chase.com', subject: 'Your March Statement is Ready', snippet: 'Your March credit card statement is now available. Balance: $1,245.00', emailType: 'updates', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(2), receivedAt: daysAgo(2), createdAt: daysAgo(2), bodyIndex: 0 },
  { id: 'email-2', threadId: 'thread-2', senderEmail: 'noreply@chase.com', senderName: 'Chase Bank', senderDomain: 'chase.com', subject: 'Payment Confirmation - $500 Received', snippet: 'Your payment of $500.00 has been successfully processed.', emailType: 'updates', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(5), receivedAt: daysAgo(5), createdAt: daysAgo(5), bodyIndex: -1 },
  { id: 'email-3', threadId: 'thread-3', senderEmail: 'alerts@chase.com', senderName: 'Chase Fraud Alert', senderDomain: 'chase.com', subject: 'Fraud Alert: Unusual Activity Detected', snippet: 'We detected unusual activity on your card ending in 4532.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: 2 },
  { id: 'email-4', threadId: 'thread-4', senderEmail: 'noreply@chase.com', senderName: 'Chase Bank', senderDomain: 'chase.com', subject: 'New Rewards Points Available', snippet: 'You have earned 2,500 new reward points this month.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(7), receivedAt: daysAgo(7), createdAt: daysAgo(7), bodyIndex: -1 },
  { id: 'email-5', threadId: 'thread-5', senderEmail: 'noreply@chase.com', senderName: 'Chase Bank', senderDomain: 'chase.com', subject: 'Account Security Update Required', snippet: 'Please update your security settings to enable two-factor authentication.', emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(10), receivedAt: daysAgo(10), createdAt: daysAgo(10), bodyIndex: -1 },

  // Banking - AWS (3 emails)
  { id: 'email-6', threadId: 'thread-6', senderEmail: 'billing@aws.amazon.com', senderName: 'Amazon Web Services', senderDomain: 'aws.amazon.com', subject: 'AWS Invoice for March 2026', snippet: 'Your AWS invoice for March is ready. Total: $247.12', emailType: 'updates', gmailCategory: 'updates', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: hoursAgo(2), receivedAt: hoursAgo(2), createdAt: hoursAgo(2), bodyIndex: 5 },
  { id: 'email-7', threadId: 'thread-7', senderEmail: 'no-reply@aws.amazon.com', senderName: 'Amazon Web Services', senderDomain: 'aws.amazon.com', subject: 'EC2 Instance Usage Alert', snippet: 'Your EC2 usage has increased by 40% this month.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(4), receivedAt: daysAgo(4), createdAt: daysAgo(4), bodyIndex: -1 },
  { id: 'email-8', threadId: 'thread-8', senderEmail: 'no-reply@aws.amazon.com', senderName: 'Amazon Web Services', senderDomain: 'aws.amazon.com', subject: 'Security Hub Findings Report', snippet: '3 security findings require your attention.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(6), receivedAt: daysAgo(6), createdAt: daysAgo(6), bodyIndex: -1 },

  // Banking - HSBC (4 emails)
  { id: 'email-9', threadId: 'thread-9', senderEmail: 'noreply@hsbc.com', senderName: 'HSBC', senderDomain: 'hsbc.com', subject: 'Monthly Statement Available', snippet: 'Your HSBC checking account statement for March is ready.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(3), receivedAt: daysAgo(3), createdAt: daysAgo(3), bodyIndex: -1 },
  { id: 'email-10', threadId: 'thread-10', senderEmail: 'transfers@hsbc.com', senderName: 'HSBC Wire Transfer', senderDomain: 'hsbc.com', subject: 'Wire Transfer Confirmation', snippet: 'Wire transfer of $2,500 to Client ABC has been completed.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(8), receivedAt: daysAgo(8), createdAt: daysAgo(8), bodyIndex: -1 },
  { id: 'email-11', threadId: 'thread-11', senderEmail: 'noreply@hsbc.com', senderName: 'HSBC', senderDomain: 'hsbc.com', subject: 'Interest Rate Change Notice', snippet: 'Savings account interest rate will change to 4.25% APY.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(12), receivedAt: daysAgo(12), createdAt: daysAgo(12), bodyIndex: -1 },
  { id: 'email-12', threadId: 'thread-12', senderEmail: 'noreply@hsbc.com', senderName: 'HSBC', senderDomain: 'hsbc.com', subject: 'Account Maintenance Scheduled', snippet: 'Scheduled maintenance on March 28, 2-4 AM EST.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(14), receivedAt: daysAgo(14), createdAt: daysAgo(14), bodyIndex: -1 },

  // Shopping - Amazon (8 emails)
  { id: 'email-13', threadId: 'thread-13', senderEmail: 'ship-confirmations@amazon.com', senderName: 'Amazon', senderDomain: 'amazon.com', subject: 'Your order has shipped!', snippet: 'Order #123-456 has shipped. Estimated delivery: March 22.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: hoursAgo(5), receivedAt: hoursAgo(5), createdAt: hoursAgo(5), bodyIndex: 1 },
  { id: 'email-14', threadId: 'thread-14', senderEmail: 'deals@amazon.com', senderName: 'Amazon Deals', senderDomain: 'amazon.com', subject: '50% Off Electronics - Today Only!', snippet: 'Save big on electronics today. Use code SAVE50.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: -1 },
  { id: 'email-15', threadId: 'thread-15', senderEmail: 'tracking@amazon.com', senderName: 'Amazon', senderDomain: 'amazon.com', subject: 'Your Amazon Order #789-012 Delivered', snippet: 'Your package was delivered to your front door.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(3), receivedAt: daysAgo(3), createdAt: daysAgo(3), bodyIndex: -1 },
  { id: 'email-16', threadId: 'thread-16', senderEmail: 'deals@amazon.com', senderName: 'Amazon Deals', senderDomain: 'amazon.com', subject: 'Deal Alert: Save 30% on Home & Kitchen', snippet: 'Discover amazing deals on home essentials.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(4), receivedAt: daysAgo(4), createdAt: daysAgo(4), bodyIndex: -1 },
  { id: 'email-17', threadId: 'thread-17', senderEmail: 'subscriptions@amazon.com', senderName: 'Amazon Subscriptions', senderDomain: 'amazon.com', subject: 'Your Subscribe & Save Order is Coming', snippet: 'Your subscription order will ship on March 25. Total: $45.99.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(5), receivedAt: daysAgo(5), createdAt: daysAgo(5), bodyIndex: -1 },
  { id: 'email-18', threadId: 'thread-18', senderEmail: 'deals@amazon.com', senderName: 'Amazon Prime', senderDomain: 'amazon.com', subject: 'Prime Day Early Access: Exclusive Deals', snippet: 'As a Prime member, get early access to Prime Day deals.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(7), receivedAt: daysAgo(7), createdAt: daysAgo(7), bodyIndex: -1 },
  { id: 'email-19', threadId: 'thread-19', senderEmail: 'returns@amazon.com', senderName: 'Amazon Returns', senderDomain: 'amazon.com', subject: 'Return Request Approved', snippet: 'Your return for Order #345-678 has been approved. Refund: $89.99.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(10), receivedAt: daysAgo(10), createdAt: daysAgo(10), bodyIndex: -1 },
  { id: 'email-20', threadId: 'thread-20', senderEmail: 'marketing@amazon.com', senderName: 'Amazon Marketing', senderDomain: 'amazon.com', subject: 'New from Amazon: Smart Home Devices', snippet: 'Discover the latest smart home devices with Alexa integration.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(14), receivedAt: daysAgo(14), createdAt: daysAgo(14), bodyIndex: -1 },

  // Shopping - Target (4 emails)
  { id: 'email-21', threadId: 'thread-21', senderEmail: 'promotions@target.com', senderName: 'Target', senderDomain: 'target.com', subject: 'Free Shipping on Orders $50+', snippet: 'Use code FREESHIP for free shipping on your next order.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(2), receivedAt: daysAgo(2), createdAt: daysAgo(2), bodyIndex: -1 },
  { id: 'email-22', threadId: 'thread-22', senderEmail: 'orders@target.com', senderName: 'Target Orders', senderDomain: 'target.com', subject: 'Your Target Order is Ready for Pickup', snippet: 'Order #TGT-789 is ready at your selected store.', emailType: 'updates', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: hoursAgo(8), receivedAt: hoursAgo(8), createdAt: hoursAgo(8), bodyIndex: -1 },
  { id: 'email-23', threadId: 'thread-23', senderEmail: 'rewards@target.com', senderName: 'Target Circle', senderDomain: 'target.com', subject: 'Circle Rewards: You Earned $10', snippet: 'You have $10 in Target Circle rewards to use.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(6), receivedAt: daysAgo(6), createdAt: daysAgo(6), bodyIndex: -1 },
  { id: 'email-24', threadId: 'thread-24', senderEmail: 'weeklyad@target.com', senderName: 'Target Weekly', senderDomain: 'target.com', subject: 'Weekly Ad: New Deals Inside', snippet: "Check out this week's best deals at your local Target.", emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(9), receivedAt: daysAgo(9), createdAt: daysAgo(9), bodyIndex: -1 },

  // Shopping - Best Buy (3 emails)
  { id: 'email-25', threadId: 'thread-25', senderEmail: 'deals@bestbuy.com', senderName: 'Best Buy', senderDomain: 'bestbuy.com', subject: '$20 Off Your Next Purchase', snippet: 'Enjoy $20 off your next purchase of $100+.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: -1 },
  { id: 'email-26', threadId: 'thread-26', senderEmail: 'support@bestbuy.com', senderName: 'Best Buy Support', senderDomain: 'bestbuy.com', subject: 'Your Geek Squad Appointment Confirmed', snippet: 'Your appointment is scheduled for March 23 at 2:00 PM.', emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(4), receivedAt: daysAgo(4), createdAt: daysAgo(4), bodyIndex: -1 },
  { id: 'email-27', threadId: 'thread-27', senderEmail: 'shipping@bestbuy.com', senderName: 'Best Buy Shipping', senderDomain: 'bestbuy.com', subject: 'Order #BB-456 Shipped', snippet: 'Your order has shipped. Expected delivery: March 24.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(5), receivedAt: daysAgo(5), createdAt: daysAgo(5), bodyIndex: -1 },

  // Travel - Delta (3 emails)
  { id: 'email-28', threadId: 'thread-28', senderEmail: 'reservations@delta.com', senderName: 'Delta Airlines', senderDomain: 'delta.com', subject: 'Flight Confirmation: LAX to JFK', snippet: 'Your flight DL123 on April 5 is confirmed.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(3), receivedAt: daysAgo(3), createdAt: daysAgo(3), bodyIndex: -1 },
  { id: 'email-29', threadId: 'thread-29', senderEmail: 'skymiles@delta.com', senderName: 'Delta SkyMiles', senderDomain: 'delta.com', subject: 'SkyMiles Update: You Earned 5,000 Miles', snippet: 'Your recent trip earned 5,000 bonus miles. Total balance: 125,000.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(7), receivedAt: daysAgo(7), createdAt: daysAgo(7), bodyIndex: -1 },
  { id: 'email-30', threadId: 'thread-30', senderEmail: 'notifications@delta.com', senderName: 'Delta Notifications', senderDomain: 'delta.com', subject: 'Gate Change Alert: Flight DL456', snippet: 'Your flight DL456 has changed gates. New gate: B42.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: hoursAgo(1), receivedAt: hoursAgo(1), createdAt: hoursAgo(1), bodyIndex: 3 },

  // Travel - Airbnb (3 emails)
  { id: 'email-31', threadId: 'thread-31', senderEmail: 'reservations@airbnb.com', senderName: 'Airbnb', senderDomain: 'airbnb.com', subject: 'Reservation Confirmed: Miami Beach', snippet: 'Your stay at Ocean View Villa is confirmed for April 10-15.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(4), receivedAt: daysAgo(4), createdAt: daysAgo(4), bodyIndex: 6 },
  { id: 'email-32', threadId: 'thread-32', senderEmail: 'reviews@airbnb.com', senderName: 'Airbnb Reviews', senderDomain: 'airbnb.com', subject: 'Review Your Recent Stay', snippet: 'How was your stay at Downtown Loft? Leave a review.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(10), receivedAt: daysAgo(10), createdAt: daysAgo(10), bodyIndex: -1 },
  { id: 'email-33', threadId: 'thread-33', senderEmail: 'specialoffers@airbnb.com', senderName: 'Airbnb Special Offers', senderDomain: 'airbnb.com', subject: 'Host Special Offer: 15% Off', snippet: 'The host is offering 15% off your next booking.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(12), receivedAt: daysAgo(12), createdAt: daysAgo(12), bodyIndex: -1 },

  // Health - Kaiser (4 emails)
  { id: 'email-34', threadId: 'thread-34', senderEmail: 'appointments@kaiserpermanente.org', senderName: 'Kaiser Permanente', senderDomain: 'kaiserpermanente.org', subject: 'Appointment Reminder: Dr. Smith', snippet: 'Your appointment is scheduled for March 25 at 10:00 AM.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(2), receivedAt: daysAgo(2), createdAt: daysAgo(2), bodyIndex: 7 },
  { id: 'email-35', threadId: 'thread-35', senderEmail: 'labs@kaiserpermanente.org', senderName: 'Kaiser Lab Results', senderDomain: 'kaiserpermanente.org', subject: 'Lab Results Available', snippet: 'Your recent lab results are now available.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(5), receivedAt: daysAgo(5), createdAt: daysAgo(5), bodyIndex: -1 },
  { id: 'email-36', threadId: 'thread-36', senderEmail: 'pharmacy@kaiserpermanente.org', senderName: 'Kaiser Pharmacy', senderDomain: 'kaiserpermanente.org', subject: 'Prescription Ready for Pickup', snippet: 'Your prescription is ready at the pharmacy.', emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: -1 },
  { id: 'email-37', threadId: 'thread-37', senderEmail: 'wellness@kaiserpermanente.org', senderName: 'Kaiser Wellness', senderDomain: 'kaiserpermanente.org', subject: 'Annual Wellness Exam Due', snippet: "It's time to schedule your annual wellness exam.", emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(14), receivedAt: daysAgo(14), createdAt: daysAgo(14), bodyIndex: -1 },

  // Education - Udemy (3 emails)
  { id: 'email-38', threadId: 'thread-38', senderEmail: 'promotions@udemy.com', senderName: 'Udemy', senderDomain: 'udemy.com', subject: '30% Off Courses - Learn Something New!', snippet: 'Expand your skills with 30% off thousands of courses.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: -1 },
  { id: 'email-39', threadId: 'thread-39', senderEmail: 'certificates@udemy.com', senderName: 'Udemy Certificates', senderDomain: 'udemy.com', subject: 'Course Completed: React Advanced Patterns', snippet: "You've completed the course. Download your certificate.", emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(6), receivedAt: daysAgo(6), createdAt: daysAgo(6), bodyIndex: 8 },
  { id: 'email-40', threadId: 'thread-40', senderEmail: 'recommendations@udemy.com', senderName: 'Udemy', senderDomain: 'udemy.com', subject: 'New Course Recommendation: TypeScript Mastery', snippet: 'Based on your learning, we recommend TypeScript Mastery.', emailType: 'promotional', gmailCategory: 'promotions', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(9), receivedAt: daysAgo(9), createdAt: daysAgo(9), bodyIndex: -1 },

  // Education - Coursera (2 emails)
  { id: 'email-41', threadId: 'thread-41', senderEmail: 'certificates@coursera.org', senderName: 'Coursera', senderDomain: 'coursera.org', subject: 'Certificate Earned: Machine Learning', snippet: "You've earned a certificate from Stanford University.", emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(8), receivedAt: daysAgo(8), createdAt: daysAgo(8), bodyIndex: -1 },
  { id: 'email-42', threadId: 'thread-42', senderEmail: 'courses@coursera.org', senderName: 'Coursera Courses', senderDomain: 'coursera.org', subject: 'Course Starting Soon: Data Science Fundamentals', snippet: 'Your enrolled course begins on March 28.', emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(11), receivedAt: daysAgo(11), createdAt: daysAgo(11), bodyIndex: -1 },

  // Technology - GitHub (5 emails)
  { id: 'email-43', threadId: 'thread-43', senderEmail: 'noreply@github.com', senderName: 'GitHub', senderDomain: 'github.com', subject: 'Pull Request #42 Needs Your Review', snippet: 'user123 requested your review on PR: Add authentication module.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: hoursAgo(3), receivedAt: hoursAgo(3), createdAt: hoursAgo(3), bodyIndex: 4 },
  { id: 'email-44', threadId: 'thread-44', senderEmail: 'security@github.com', senderName: 'GitHub Security', senderDomain: 'github.com', subject: 'Security Alert: Vulnerability Detected', snippet: 'A critical vulnerability was found in lodash dependency.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(2), receivedAt: daysAgo(2), createdAt: daysAgo(2), bodyIndex: -1 },
  { id: 'email-45', threadId: 'thread-45', senderEmail: 'notifications@github.com', senderName: 'GitHub', senderDomain: 'github.com', subject: 'Your Repository Has New Stars', snippet: 'my-awesome-project received 15 new stars this week.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(5), receivedAt: daysAgo(5), createdAt: daysAgo(5), bodyIndex: -1 },
  { id: 'email-46', threadId: 'thread-46', senderEmail: 'issues@github.com', senderName: 'GitHub Issues', senderDomain: 'github.com', subject: 'Issue #128 Assigned to You', snippet: 'Fix navigation bug on mobile devices has been assigned to you.', emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(7), receivedAt: daysAgo(7), createdAt: daysAgo(7), bodyIndex: -1 },
  { id: 'email-47', threadId: 'thread-47', senderEmail: 'actions@github.com', senderName: 'GitHub Actions', senderDomain: 'github.com', subject: 'Actions Workflow Failed', snippet: 'CI workflow failed on main branch. 2 tests failed.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(4), receivedAt: daysAgo(4), createdAt: daysAgo(4), bodyIndex: -1 },

  // Technology - Vercel (3 emails)
  { id: 'email-48', threadId: 'thread-48', senderEmail: 'deployments@vercel.com', senderName: 'Vercel', senderDomain: 'vercel.com', subject: 'Deployment Successful: my-app v1.2.0', snippet: 'Your deployment to production is live.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: -1 },
  { id: 'email-49', threadId: 'thread-49', senderEmail: 'errors@vercel.com', senderName: 'Vercel Errors', senderDomain: 'vercel.com', subject: 'Build Error Detected', snippet: 'Build failed on preview branch. Error: Module not found.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(3), receivedAt: daysAgo(3), createdAt: daysAgo(3), bodyIndex: 9 },
  { id: 'email-50', threadId: 'thread-50', senderEmail: 'reports@vercel.com', senderName: 'Vercel Reports', senderDomain: 'vercel.com', subject: 'Monthly Usage Report', snippet: 'Your bandwidth usage: 45GB of 100GB.', emailType: 'updates', gmailCategory: 'updates', isImportant: false, isRead: true, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(10), receivedAt: daysAgo(10), createdAt: daysAgo(10), bodyIndex: -1 },

  // Entertainment - Netflix (1 unread)
  { id: 'email-51', threadId: 'thread-51', senderEmail: 'security@netflix.com', senderName: 'Netflix Security', senderDomain: 'netflix.com', subject: 'New Sign-In Detected', snippet: 'A new device signed into your account from Los Angeles, CA.', emailType: 'regular', gmailCategory: 'primary', isImportant: false, isRead: false, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(2), receivedAt: daysAgo(2), createdAt: daysAgo(2), bodyIndex: -1 },

  // Social - LinkedIn (1 unread)
  { id: 'email-52', threadId: 'thread-52', senderEmail: 'notifications@linkedin.com', senderName: 'LinkedIn', senderDomain: 'linkedin.com', subject: 'John Doe endorsed you for TypeScript', snippet: 'John Doe just endorsed you for the TypeScript skill.', emailType: 'social', gmailCategory: 'social', isImportant: false, isRead: false, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(1), receivedAt: daysAgo(1), createdAt: daysAgo(1), bodyIndex: -1 },

  // Projects - Client ABC (2 emails: 1 unprocessed, 1 archived)
  { id: 'email-53', threadId: 'thread-53', senderEmail: 'team@clientabc.com', senderName: 'Client ABC Team', senderDomain: 'clientabc.com', subject: 'Sprint Review Meeting Tomorrow', snippet: "Don't forget: Sprint review at 2 PM tomorrow.", emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: false, isDeleted: false, isProcessed: false, processedAt: null, receivedAt: hoursAgo(10), createdAt: hoursAgo(10), bodyIndex: -1 },
  { id: 'email-54', threadId: 'thread-54', senderEmail: 'newmusic@spotify.com', senderName: 'Spotify', senderDomain: 'spotify.com', subject: 'New Music Release Available', snippet: 'Check out our latest releases based on your listening habits.', emailType: 'social', gmailCategory: 'social', isImportant: false, isRead: false, isArchived: false, isDeleted: false, isProcessed: true, processedAt: daysAgo(3), receivedAt: daysAgo(3), createdAt: daysAgo(3), bodyIndex: -1 },
  { id: 'email-55', threadId: 'thread-55', senderEmail: 'billing@company.com', senderName: 'Company Billing', senderDomain: 'company.com', subject: 'Invoice #INV-2026-045 Due', snippet: 'Invoice for $5,000 is due on April 1.', emailType: 'regular', gmailCategory: 'primary', isImportant: true, isRead: true, isArchived: true, isDeleted: false, isProcessed: false, processedAt: null, receivedAt: daysAgo(4), createdAt: daysAgo(4), bodyIndex: -1 },
];

// Add RFC 2822 Message-ID headers to seed emails for reply threading
for (const email of EMAILS as Array<Record<string, unknown>>) {
  email['messageIdHeader'] = `<${email['id']}@${email['senderDomain']}>`;
}

// ---------------------------------------------------------------------------
// Sender summaries
// ---------------------------------------------------------------------------
const SENDER_SUMMARIES = [
  { id: 'ss-chase', senderDomain: 'chase.com', summary: 'Chase Bank sends regular account statements, payment confirmations, and fraud alerts. Average 3-4 emails per month related to credit card activity and security updates.', wordCount: 45, updateCount: 5, lastEmailId: 'email-1' },
  { id: 'ss-aws', senderDomain: 'aws.amazon.com', summary: 'Amazon Web Services provides monthly cloud infrastructure invoices and usage alerts for EC2, S3, and RDS services. Security findings occasionally reported.', wordCount: 52, updateCount: 3, lastEmailId: 'email-6' },
  { id: 'ss-hsbc', senderDomain: 'hsbc.com', summary: 'HSBC bank sends monthly account statements, wire transfer confirmations, and interest rate change notices. Occasional maintenance notifications.', wordCount: 40, updateCount: 4, lastEmailId: 'email-9' },
  { id: 'ss-amazon', senderDomain: 'amazon.com', summary: 'Amazon sends order confirmations, shipping notifications, promotional deals, and deal alerts. Prime membership communications and return confirmations. Highest volume sender.', wordCount: 65, updateCount: 8, lastEmailId: 'email-13' },
  { id: 'ss-target', senderDomain: 'target.com', summary: 'Target sends weekly promotional ads, order ready confirmations, Circle rewards updates, and deal notifications.', wordCount: 38, updateCount: 4, lastEmailId: 'email-21' },
  { id: 'ss-bestbuy', senderDomain: 'bestbuy.com', summary: 'Best Buy sends promotional deals, Geek Squad appointment confirmations, and order shipping notifications.', wordCount: 42, updateCount: 3, lastEmailId: 'email-25' },
  { id: 'ss-delta', senderDomain: 'delta.com', summary: 'Delta Airlines sends flight confirmations, SkyMiles updates, gate change alerts, and reservation details.', wordCount: 48, updateCount: 3, lastEmailId: 'email-28' },
  { id: 'ss-airbnb', senderDomain: 'airbnb.com', summary: 'Airbnb sends reservation confirmations, review requests, special offers from hosts, and promotional deals.', wordCount: 40, updateCount: 3, lastEmailId: 'email-31' },
  { id: 'ss-kaiser', senderDomain: 'kaiserpermanente.org', summary: 'Kaiser Permanente sends appointment reminders, lab result notifications, prescription ready alerts, and wellness exam reminders.', wordCount: 44, updateCount: 4, lastEmailId: 'email-34' },
  { id: 'ss-udemy', senderDomain: 'udemy.com', summary: 'Udemy sends course completion certificates, promotional discounts, new course recommendations, and learning tips.', wordCount: 36, updateCount: 3, lastEmailId: 'email-38' },
  { id: 'ss-coursera', senderDomain: 'coursera.org', summary: 'Coursera sends certificate earned notifications, course starting reminders, and enrollment confirmations.', wordCount: 30, updateCount: 2, lastEmailId: 'email-41' },
  { id: 'ss-github', senderDomain: 'github.com', summary: 'GitHub sends pull request reviews, security alerts, issue assignments, workflow failure notifications, and repository activity updates.', wordCount: 55, updateCount: 5, lastEmailId: 'email-43' },
  { id: 'ss-vercel', senderDomain: 'vercel.com', summary: 'Vercel sends deployment notifications, build error alerts, and monthly usage reports.', wordCount: 35, updateCount: 3, lastEmailId: 'email-48' },
  { id: 'ss-netflix', senderDomain: 'netflix.com', summary: 'Netflix sends security alerts regarding new sign-in activity and account access notifications.', wordCount: 25, updateCount: 1, lastEmailId: 'email-51' },
  { id: 'ss-linkedin', senderDomain: 'linkedin.com', summary: 'LinkedIn sends social notifications including skill endorsements, connection suggestions, and profile updates.', wordCount: 28, updateCount: 1, lastEmailId: 'email-52' },
  { id: 'ss-spotify', senderDomain: 'spotify.com', summary: 'Spotify sends new music release notifications based on listening habits and personalized recommendations.', wordCount: 22, updateCount: 1, lastEmailId: 'email-54' },
  { id: 'ss-clientabc', senderDomain: 'clientabc.com', summary: 'Client ABC sends project-related communications including sprint review reminders and action items.', wordCount: 32, updateCount: 2, lastEmailId: 'email-53' },
];

// ---------------------------------------------------------------------------
// Topic summaries (one per leaf + root topic)
// ---------------------------------------------------------------------------
const TOPIC_SUMMARIES = [
  { id: 'ts-banking', topicId: 'topic-banking', summary: 'Banking communications covering credit card statements, payment confirmations, fraud alerts, wire transfers, and account security updates across Chase, HSBC, and AWS billing.', wordCount: 65, updateCount: 8 },
  { id: 'ts-chase', topicId: 'topic-chase', summary: 'Chase Bank monthly credit card statements, payment confirmations, fraud alerts for unusual activity, reward points updates, and security setting changes.', wordCount: 50, updateCount: 5 },
  { id: 'ts-hsbc', topicId: 'topic-hsbc', summary: 'HSBC banking monthly statements, wire transfer confirmations for client payments, interest rate change notices, and scheduled maintenance updates.', wordCount: 45, updateCount: 4 },
  { id: 'ts-aws', topicId: 'topic-aws', summary: 'AWS billing monthly invoices covering EC2, S3, RDS, CloudFront, and Lambda services. Usage alerts for increased spending and security findings.', wordCount: 48, updateCount: 3 },
  { id: 'ts-shopping', topicId: 'topic-shopping', summary: 'Shopping communications from Amazon, Target, and Best Buy covering order confirmations, shipping notifications, promotional deals, return requests, and subscriptions.', wordCount: 60, updateCount: 10 },
  { id: 'ts-amazon', topicId: 'topic-amazon', summary: 'Amazon order shipping notifications, promotional deal alerts, Prime Day early access, Subscribe & Save orders, return confirmations, and new product announcements.', wordCount: 55, updateCount: 8 },
  { id: 'ts-target', topicId: 'topic-target', summary: 'Target Circle rewards notifications, order pickup confirmations, weekly promotional ads, and deal alerts.', wordCount: 38, updateCount: 4 },
  { id: 'ts-bestbuy', topicId: 'topic-bestbuy', summary: 'Best Buy promotional discount codes, Geek Squad appointment confirmations, and order shipping notifications.', wordCount: 35, updateCount: 3 },
  { id: 'ts-travel', topicId: 'topic-travel', summary: 'Travel communications covering flight bookings, hotel reservations, loyalty program updates, and gate change alerts from airlines and accommodation providers.', wordCount: 45, updateCount: 4 },
  { id: 'ts-delta', topicId: 'topic-delta', summary: 'Delta Airlines flight confirmations, SkyMiles loyalty program updates, and urgent gate change notifications.', wordCount: 40, updateCount: 3 },
  { id: 'ts-airbnb', topicId: 'topic-airbnb', summary: 'Airbnb reservation confirmations with property details, stay review requests, and host special offers.', wordCount: 38, updateCount: 3 },
  { id: 'ts-health', topicId: 'topic-health', summary: 'Healthcare communications from Kaiser Permanente covering appointment reminders, lab results, prescription pickups, and wellness exams.', wordCount: 42, updateCount: 4 },
  { id: 'ts-kaiser', topicId: 'topic-kaiser', summary: 'Kaiser Permanente appointment details, lab results availability, prescription ready notifications, and annual wellness reminders.', wordCount: 40, updateCount: 4 },
  { id: 'ts-education', topicId: 'topic-education', summary: 'Online education from Udemy and Coursera covering course completions, promotional discounts, new course recommendations, and enrollment confirmations.', wordCount: 35, updateCount: 5 },
  { id: 'ts-udemy', topicId: 'topic-udemy', summary: 'Udemy course completion certificates, promotional sale offers, and personalized course recommendations. React and TypeScript learning focus.', wordCount: 35, updateCount: 3 },
  { id: 'ts-coursera', topicId: 'topic-coursera', summary: 'Coursera certificate earned confirmations from Stanford University partnerships and course starting reminders.', wordCount: 30, updateCount: 2 },
  { id: 'ts-technology', topicId: 'topic-technology', summary: 'Technology communications from GitHub and Vercel covering code reviews, security alerts, deployments, CI failures, and usage reports.', wordCount: 55, updateCount: 6 },
  { id: 'ts-github', topicId: 'topic-github', summary: 'GitHub pull request reviews, security vulnerability alerts, issue assignments, repository star notifications, and Actions workflow failures.', wordCount: 50, updateCount: 5 },
  { id: 'ts-vercel', topicId: 'topic-vercel', summary: 'Vercel deployment success and failure notifications, and monthly usage reports. Serverless deployment lifecycle management.', wordCount: 35, updateCount: 3 },
  { id: 'ts-entertainment', topicId: 'topic-entertainment', summary: 'Entertainment communications from Netflix and Spotify covering account security alerts and new music recommendations.', wordCount: 25, updateCount: 2 },
  { id: 'ts-netflix', topicId: 'topic-netflix', summary: 'Netflix security alerts for new account sign-ins. Streaming service account management.', wordCount: 20, updateCount: 1 },
  { id: 'ts-spotify', topicId: 'topic-spotify', summary: 'Spotify personalized music release notifications based on listening habits. Music discovery and playlist management.', wordCount: 22, updateCount: 1 },
  { id: 'ts-social', topicId: 'topic-social', summary: 'Social media communications from LinkedIn covering professional networking, skill endorsements, and career development.', wordCount: 25, updateCount: 1 },
  { id: 'ts-linkedin', topicId: 'topic-linkedin', summary: 'LinkedIn professional skill endorsements and connection suggestions. Career networking platform.', wordCount: 22, updateCount: 1 },
  { id: 'ts-projects', topicId: 'topic-projects', summary: 'Project-related communications from Client ABC covering sprint reviews, invoices, and action items.', wordCount: 30, updateCount: 2 },
  { id: 'ts-clientabc', topicId: 'topic-clientabc', summary: 'Client ABC sprint review meeting reminders, invoice due dates, and action items. Ongoing project with billing.', wordCount: 28, updateCount: 2 },
];

// ---------------------------------------------------------------------------
// Timeline updates (for processed important emails)
// ---------------------------------------------------------------------------
const TIMELINE_UPDATES = [
  { id: 'tu-1', emailId: 'email-1', title: 'Chase Statement Ready', description: 'March credit card statement available. Balance: $1,245.00', summary: 'Monthly credit card statement from Chase with current balance of $1,245.00. Minimum payment of $25.00 due April 15.', priority: 'medium', sentiment: 'neutral', urgency: false, actionItem: true, actionItemTitle: 'Pay Chase credit card bill', actionItemCompleted: true, actionItemCompletedAt: daysAgo(1), followUpDate: '2026-04-15', financialImpact: 1245.0, keyEntities: { dates: ['2026-04-15'], amounts: [1245.0, 25.0], names: ['Chase'] }, createdAt: daysAgo(2) },
  { id: 'tu-2', emailId: 'email-3', title: 'Fraud Alert: Suspicious Activity', description: 'Unusual activity detected on card ending in 4532', summary: 'Chase fraud alert for unusual $150.00 transaction at Best Buy in New York. Card ending in 4532.', priority: 'high', sentiment: 'negative', urgency: true, actionItem: true, actionItemTitle: 'Verify or dispute fraudulent transaction', actionItemCompleted: false, followUpDate: '2026-03-19', financialImpact: 150.0, keyEntities: { dates: ['2026-03-18'], amounts: [150.0], names: ['Chase', 'Best Buy'] }, createdAt: daysAgo(1) },
  { id: 'tu-3', emailId: 'email-6', title: 'AWS March Invoice: $247.12', description: 'Monthly AWS cloud services bill', summary: 'AWS invoice for March 2026 totaling $247.12. Major charges: EC2 $156.40, S3 $12.50, RDS $45.22.', priority: 'medium', sentiment: 'neutral', urgency: false, actionItem: false, financialImpact: 247.12, keyEntities: { dates: ['2026-04-01'], amounts: [247.12], names: ['AWS'] }, createdAt: hoursAgo(2) },
  { id: 'tu-4', emailId: 'email-13', title: 'Amazon Order Shipped', description: 'Order #123-456 shipped via UPS', summary: 'Amazon order shipped with headphones, phone case, and USB cable. Total $112.97. Estimated delivery March 22.', priority: 'low', sentiment: 'positive', urgency: false, actionItem: false, keyEntities: { dates: ['2026-03-22'], amounts: [112.97], names: ['Amazon', 'UPS'] }, createdAt: hoursAgo(5) },
  { id: 'tu-5', emailId: 'email-28', title: 'Flight Confirmed: LAX to JFK', description: 'Delta flight DL123 on April 5 confirmed', summary: 'Delta flight DL123 from LAX to JFK confirmed for April 5, 2026 at 8:00 AM. Important travel booking.', priority: 'high', sentiment: 'positive', urgency: false, actionItem: true, actionItemTitle: 'Check in for Delta flight DL123', actionItemCompleted: true, actionItemCompletedAt: daysAgo(1), followUpDate: '2026-04-04', keyEntities: { dates: ['2026-04-05'], amounts: [], names: ['Delta Airlines', 'LAX', 'JFK'] }, createdAt: daysAgo(3) },
  { id: 'tu-6', emailId: 'email-30', title: 'Gate Change: Flight DL456', description: 'Gate changed from A12 to B42', summary: 'Delta flight DL456 gate changed from A12 to B42. Departure at 6:45 PM. Urgent attention needed.', priority: 'high', sentiment: 'neutral', urgency: true, actionItem: true, actionItemTitle: 'Proceed to gate B42 for flight DL456', actionItemCompleted: false, keyEntities: { dates: [], amounts: [], names: ['Delta Airlines'] }, createdAt: hoursAgo(1) },
  { id: 'tu-7', emailId: 'email-31', title: 'Airbnb Reservation: Miami Beach', description: 'Ocean View Villa confirmed April 10-15', summary: 'Airbnb reservation confirmed for Ocean View Villa in Miami Beach. Check-in April 10, check-out April 15. Total $850.00.', priority: 'medium', sentiment: 'positive', urgency: false, actionItem: true, actionItemTitle: 'Complete guest verification for Airbnb', actionItemCompleted: false, followUpDate: '2026-04-10', financialImpact: 850.0, keyEntities: { dates: ['2026-04-10', '2026-04-15'], amounts: [850.0], names: ['Airbnb', 'Ocean View Villa'] }, createdAt: daysAgo(4) },
  { id: 'tu-8', emailId: 'email-34', title: 'Appointment: Dr. Smith on March 25', description: 'Internal medicine appointment at 10:00 AM', summary: 'Kaiser appointment with Dr. Sarah Smith on March 25 at 10:00 AM. Bring photo ID, insurance card, and medication list.', priority: 'high', sentiment: 'neutral', urgency: false, actionItem: true, actionItemTitle: 'Attend Kaiser appointment with Dr. Smith', actionItemCompleted: true, actionItemCompletedAt: daysAgo(1), followUpDate: '2026-03-25', keyEntities: { dates: ['2026-03-25'], amounts: [], names: ['Kaiser Permanente', 'Dr. Sarah Smith'] }, createdAt: daysAgo(2) },
  { id: 'tu-9', emailId: 'email-43', title: 'PR Review Requested: Auth Module', description: 'PR #42 needs your review', summary: 'GitHub PR #42 adds JWT authentication with middleware, updated user model, login/logout endpoints, and tests. Review requested by user123.', priority: 'medium', sentiment: 'neutral', urgency: false, actionItem: true, actionItemTitle: 'Review GitHub PR #42', actionItemCompleted: false, followUpDate: '2026-03-21', keyEntities: { dates: [], amounts: [], names: ['GitHub', 'user123'] }, createdAt: hoursAgo(3) },
  { id: 'tu-10', emailId: 'email-49', title: 'Build Failed: Module Not Found', description: 'Vercel preview deployment failed', summary: 'Vercel build error on preview branch. Module ./utils/helpers not found. Likely missing file or incorrect import path.', priority: 'high', sentiment: 'negative', urgency: true, actionItem: true, actionItemTitle: 'Fix missing module in Vercel build', actionItemCompleted: true, actionItemCompletedAt: daysAgo(2), keyEntities: { dates: [], amounts: [], names: ['Vercel'] }, createdAt: daysAgo(3) },
];

// ---------------------------------------------------------------------------
// Deals (from promotional emails)
// ---------------------------------------------------------------------------
const DEALS = [
  { id: 'deal-1', emailId: 'email-14', dealTitle: '50% Off Electronics', dealDescription: 'Save big on electronics. Use code SAVE50 at checkout.', brandName: 'Amazon', dealCategory: 'Electronics', dealValue: '50', dealValueType: 'percentage', dealCode: 'SAVE50', dealExpiry: daysAgo(0), createdAt: daysAgo(1), isActive: true },
  { id: 'deal-2', emailId: 'email-21', dealTitle: 'Free Shipping on Orders $50+', dealDescription: 'Use code FREESHIP for free shipping on your next order.', brandName: 'Target', dealCategory: 'General', dealValue: '0', dealValueType: 'other', dealCode: 'FREESHIP', minimumPurchase: '$50', createdAt: daysAgo(2), isActive: true },
  { id: 'deal-3', emailId: 'email-25', dealTitle: '$20 Off Your Next Purchase', dealDescription: 'Enjoy $20 off your next purchase of $100+.', brandName: 'Best Buy', dealCategory: 'Electronics', dealValue: '20', dealValueType: 'fixed_amount', minimumPurchase: '$100', createdAt: daysAgo(1), isActive: true },
  { id: 'deal-4', emailId: 'email-33', dealTitle: '15% Off Next Booking', dealDescription: 'The host is offering 15% off your next booking at this property.', brandName: 'Airbnb', dealCategory: 'Travel', dealValue: '15', dealValueType: 'percentage', dealExpiry: daysAgo(-7), createdAt: daysAgo(12), isActive: true },
];

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
const JOBS = [
  { id: 'job-1', type: 'email_process', status: 'completed', payload: { emailId: 'email-1' }, emailId: 'email-1', result: { timelineUpdates: 1, actionItems: 1 }, scheduledAt: daysAgo(2), createdAt: daysAgo(2), startedAt: daysAgo(2), completedAt: daysAgo(2) },
  { id: 'job-2', type: 'email_process', status: 'completed', payload: { emailId: 'email-3' }, emailId: 'email-3', result: { timelineUpdates: 1, actionItems: 1 }, scheduledAt: daysAgo(1), createdAt: daysAgo(1), startedAt: daysAgo(1), completedAt: daysAgo(1) },
  { id: 'job-3', type: 'email_process', status: 'running', payload: { emailId: 'email-4' }, emailId: 'email-4', scheduledAt: hoursAgo(1), createdAt: hoursAgo(1), startedAt: hoursAgo(0.5) },
  { id: 'job-4', type: 'email_process', status: 'failed', payload: { emailId: 'email-5' }, emailId: 'email-5', error: 'Database connection timeout', errorStack: 'Error: Database connection timeout\n    at connect (db.ts:123:45)', scheduledAt: daysAgo(10), createdAt: daysAgo(10), startedAt: daysAgo(10), completedAt: daysAgo(10) },
  { id: 'job-5', type: 'email_process', status: 'pending', payload: { emailId: 'email-53' }, emailId: 'email-53', scheduledAt: hoursAgo(1), createdAt: now() },
  { id: 'job-6', type: 'topic_summary_update', status: 'completed', payload: { topicId: 'topic-chase' }, result: { words: 50 }, scheduledAt: daysAgo(2), createdAt: daysAgo(2), startedAt: daysAgo(2), completedAt: daysAgo(2) },
  { id: 'job-7', type: 'sender_summary_update', status: 'completed', payload: { senderDomain: 'amazon.com' }, result: { words: 65 }, scheduledAt: daysAgo(1), createdAt: daysAgo(1), startedAt: daysAgo(1), completedAt: daysAgo(1) },
];

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
const AUDIT_LOG = [
  { id: 'audit-1', jobId: 'job-1', action: 'email_processed', entityType: 'email', entityId: 'email-1', details: { timelineUpdates: 1, actionItems: 1 }, tokensUsed: 245, durationMs: 1200, createdAt: daysAgo(2) },
  { id: 'audit-2', jobId: 'job-2', action: 'email_processed', entityType: 'email', entityId: 'email-3', details: { timelineUpdates: 1, actionItems: 1, urgency: true }, tokensUsed: 320, durationMs: 1500, createdAt: daysAgo(1) },
  { id: 'audit-3', jobId: 'job-6', action: 'topic_summary_updated', entityType: 'topic', entityId: 'topic-chase', details: { words: 50, updated: true }, tokensUsed: 150, durationMs: 800, createdAt: daysAgo(2) },
  { id: 'audit-4', jobId: 'job-7', action: 'sender_summary_updated', entityType: 'sender', entityId: 'amazon.com', details: { words: 65, updated: true }, tokensUsed: 200, durationMs: 1000, createdAt: daysAgo(1) },
];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const SETTINGS = [
  { key: 'gmail.syncEnabled', value: { enabled: true }, schemaVersion: 1, updatedAt: now() },
  { key: 'processing.autoProcess', value: { enabled: true }, schemaVersion: 1, updatedAt: now() },
  { key: 'ui.compactMode', value: { enabled: false }, schemaVersion: 1, updatedAt: now() },
  { key: 'onboarding_complete', value: { enabled: true }, schemaVersion: 1, updatedAt: now() },
];

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------
const SYNC_STATE = {
  id: 1,
  historyId: 'history-12345',
  lastFullSync: daysAgo(0),
  lastIncrementalSync: hoursAgo(1),
  totalEmailsProcessed: 53,
  totalTokensUsed: 15000,
  isPaused: false,
  backfillJobs: null,
};

// ---------------------------------------------------------------------------
// Email-to-label mapping
// ---------------------------------------------------------------------------
function buildEmailLabels(): Array<{ emailId: string; labelId: string }> {
  const rows: Array<{ emailId: string; labelId: string }> = [];

  // All non-archived, non-deleted emails get INBOX
  for (const e of EMAILS) {
    if (!e.isArchived && !e.isDeleted) {
      rows.push({ emailId: e.id, labelId: 'label-inbox' });
    }
  }

  // Unread emails get UNREAD label
  for (const e of EMAILS) {
    if (!e.isRead) {
      rows.push({ emailId: e.id, labelId: 'label-unread' });
    }
  }

  // Important emails get IMPORTANT label
  for (const e of EMAILS) {
    if (e.isImportant) {
      rows.push({ emailId: e.id, labelId: 'label-important' });
    }
  }

  // Gmail category labels
  const categoryMap: Record<string, string> = {
    'primary': 'label-cat-personal',
    'social': 'label-cat-social',
    'promotions': 'label-cat-promotions',
    'updates': 'label-cat-updates',
  };
  for (const e of EMAILS) {
    const cat = e.gmailCategory;
    if (cat && categoryMap[cat]) {
      rows.push({ emailId: e.id, labelId: categoryMap[cat] });
    }
  }

  // TB topic labels for processed emails
  for (const e of EMAILS) {
    if (!e.isProcessed) continue;
    const topicId = EMAIL_TOPIC_MAP[e.id];
    if (!topicId) continue;
    const topic = TOPICS.find(t => t.id === topicId);
    if (!topic) continue;
    // Leaf topic label
    if (topic.gmailLabelId) {
      rows.push({ emailId: e.id, labelId: topic.gmailLabelId });
    }
    // Parent topic label
    if (topic.parentId) {
      const parent = TOPICS.find(t => t.id === topic.parentId);
      if (parent?.gmailLabelId) {
        rows.push({ emailId: e.id, labelId: parent.gmailLabelId });
      }
    }
    // Processed label
    rows.push({ emailId: e.id, labelId: 'label-tb-processed' });
  }

  // Sender labels for processed emails
  for (const e of EMAILS) {
    if (!e.isProcessed) continue;
    const domainToLabelId: Record<string, string> = {
      "chase.com": "label-tb-sender-chase",
      "aws.amazon.com": "label-tb-sender-aws",
      "hsbc.com": "label-tb-sender-hsbc",
      "amazon.com": "label-tb-sender-amazon",
      "target.com": "label-tb-sender-target",
      "bestbuy.com": "label-tb-sender-bestbuy",
      "delta.com": "label-tb-sender-delta",
      "airbnb.com": "label-tb-sender-airbnb",
      "kaiserpermanente.org": "label-tb-sender-kaiser",
      "udemy.com": "label-tb-sender-udemy",
      "coursera.org": "label-tb-sender-coursera",
      "github.com": "label-tb-sender-github",
      "vercel.com": "label-tb-sender-vercel",
      "netflix.com": "label-tb-sender-netflix",
      "spotify.com": "label-tb-sender-spotify",
      "linkedin.com": "label-tb-sender-linkedin",
      "clientabc.com": "label-tb-sender-clientabc",
    };
    const senderLabelId = domainToLabelId[e.senderDomain];
    if (senderLabelId) {
      rows.push({ emailId: e.id, labelId: senderLabelId });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------
export async function seed(db: LibSQLDatabase): Promise<void> {
  console.log('[seed] Starting database seeding...');

  // 1. Labels (no FK deps)
  await db.insert(schema.gmailLabels).values(LABELS).onConflictDoNothing();
  console.log(`[seed] Inserted ${LABELS.length} gmail labels`);

  // 2. Topics (self-referential but parentId is nullable, insert roots first)
  const rootTopics = TOPICS.filter(t => !t.parentId);
  const childTopics = TOPICS.filter(t => !!t.parentId);
  await db.insert(schema.topics).values(rootTopics.map(t => ({
    ...t,
    createdAt: now(),
  }))).onConflictDoNothing();
  await db.insert(schema.topics).values(childTopics.map(t => ({
    ...t,
    createdAt: now(),
  }))).onConflictDoNothing();
  console.log(`[seed] Inserted ${TOPICS.length} topics`);

  // 3. Emails
  const emailRows = EMAILS.map(e => ({
    id: e.id,
    threadId: e.threadId,
    senderEmail: e.senderEmail,
    senderName: e.senderName,
    senderDomain: e.senderDomain,
    subject: e.subject,
    snippet: e.snippet,
    bodyPlain: e.bodyIndex >= 0 ? EMAIL_BODIES[e.bodyIndex].plain : null,
    bodyHtml: e.bodyIndex >= 0 ? EMAIL_BODIES[e.bodyIndex].html : null,
    receivedAt: e.receivedAt,
    emailType: e.emailType,
    gmailCategory: e.gmailCategory,
    isImportant: e.isImportant,
    isRead: e.isRead,
    isArchived: e.isArchived,
    isDeleted: e.isDeleted,
    isProcessed: e.isProcessed,
    processedAt: e.processedAt,
    createdAt: e.createdAt,
  }));
  await db.insert(schema.emails).values(emailRows as any).onConflictDoNothing();
  console.log(`[seed] Inserted ${EMAILS.length} emails (${emailRows.filter(e => e.bodyHtml).length} with body content)`);

  // 4. Email labels
  const emailLabels = buildEmailLabels();
  await db.insert(schema.emailLabels).values(emailLabels).onConflictDoNothing();
  console.log(`[seed] Inserted ${emailLabels.length} email-label associations`);

  // 5. Email topics (join table)
  const emailTopicRows = Object.entries(EMAIL_TOPIC_MAP).map(([emailId, topicId]) => ({
    emailId,
    topicId,
  }));
  await db.insert(schema.emailTopics).values(emailTopicRows).onConflictDoNothing();
  console.log(`[seed] Inserted ${emailTopicRows.length} email-topic associations`);

  // 6. Timeline updates
  await db.insert(schema.timelineUpdates).values(TIMELINE_UPDATES.map(t => ({
    ...t,
    createdAt: t.createdAt,
  })) as any).onConflictDoNothing();
  console.log(`[seed] Inserted ${TIMELINE_UPDATES.length} timeline updates`);

  // 7. Deals
  await db.insert(schema.deals).values(DEALS.map(d => ({
    ...d,
    createdAt: d.createdAt,
  })) as any).onConflictDoNothing();
  console.log(`[seed] Inserted ${DEALS.length} deals`);

  // 8. Sender summaries
  await db.insert(schema.senderSummaries).values(SENDER_SUMMARIES.map(s => ({
    ...s,
    lastUpdated: now(),
  }))).onConflictDoNothing();
  console.log(`[seed] Inserted ${SENDER_SUMMARIES.length} sender summaries`);

  // 9. Topic summaries
  await db.insert(schema.topicSummaries).values(TOPIC_SUMMARIES.map(t => ({
    ...t,
    lastUpdated: now(),
    lastEmailId: EMAILS.find(e => EMAIL_TOPIC_MAP[e.id] === t.topicId)?.id ?? null,
  }))).onConflictDoNothing();
  console.log(`[seed] Inserted ${TOPIC_SUMMARIES.length} topic summaries`);

  // 10. Jobs
  await db.insert(schema.jobs).values(JOBS.map(j => ({
    ...j,
    scheduledAt: j.scheduledAt,
    createdAt: j.createdAt,
    startedAt: j.startedAt ?? null,
    completedAt: j.completedAt ?? null,
  })) as any).onConflictDoNothing();
  console.log(`[seed] Inserted ${JOBS.length} jobs`);

  // 11. Audit log
  await db.insert(schema.auditLog).values(AUDIT_LOG.map(a => ({
    ...a,
    createdAt: a.createdAt,
  }))).onConflictDoNothing();
  console.log(`[seed] Inserted ${AUDIT_LOG.length} audit log entries`);

  // 12. Settings
  await db.insert(schema.settings).values(SETTINGS).onConflictDoNothing();
  console.log(`[seed] Inserted ${SETTINGS.length} settings`);

  // 13. Sync state
  await db.insert(schema.syncState).values({
    ...SYNC_STATE,
    lastFullSync: SYNC_STATE.lastFullSync,
    lastIncrementalSync: SYNC_STATE.lastIncrementalSync,
  }).onConflictDoNothing();
  console.log('[seed] Inserted sync state');

  console.log('[seed] Seeding complete!');
}
