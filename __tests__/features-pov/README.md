# Feature Tests (User Perspective)

This test suite validates features from the **user's perspective**.

## Purpose

These tests verify that:
- Users can accomplish their goals
- Features work as described in the design spec
- User-facing behavior is correct

## Contrast with Other Test Suites

| Suite | Focus | Question Answered |
|-------|-------|-------------------|
| `features-pov/` | User behavior | "Can the user do X?" |
| `workflows/` | Processing logic | "Does the algorithm work?" |
| `integrations/` | External services | "Do APIs work?" |
| `components/` | UI components | "Does the component render?" |

## Test Helpers

### TuskerBrainApp

High-level app controller for feature tests:

```typescript
const app = await TuskerBrainApp.launch();
await app.connectGmail(credentials);
await app.processEmail(emailData);
const timeline = await app.getTimeline();
```

### GmailTestAccount

Real Gmail API integration (or mock for CI):

```typescript
const gmail = await GmailTestAccount.connect();
await gmail.sendEmail({ to, subject, body });
await gmail.getEmail(id);
```

## Running Tests

```bash
# All feature tests
npm run test:features-pov

# Specific feature
npm run test:features-pov -- inbox-manager
npm run test:features-pov -- timeline
npm run test:features-pov -- deals

# With real LLM API
TEST_LLM_API_KEY=sk-... npm run test:features-pov
```

## CI Configuration

Most tests run without external dependencies. For LLM-dependent tests:

```yaml
# GitHub Actions
- name: Run Feature Tests
  run: npm run test:features-pov
  env:
    TEST_LLM_API_KEY: ${{ secrets.TEST_LLM_API_KEY }}
```

## Writing New Feature Tests

1. **Start with user story**: "As a user, I want..."
2. **Test observable outcomes**: What user sees, not how code works
3. **Use real dependencies when possible**: Real DB, real Gmail mock
4. **Avoid testing internals**: No mocking private functions

### Example

```typescript
// ✅ Good: Testing user outcome
it('User can filter timeline by topic', async () => {
  await app.setTimelineFilter({ topic: 'Banking/Chase' });
  const timeline = await app.getTimeline();
  expect(timeline.every(u => u.topic === 'Banking/Chase')).toBe(true);
});

// ❌ Bad: Testing implementation
it('filter.apply() calls repository with correct params', async () => {
  await filter.apply({ topic: 'Banking/Chase' });
  expect(mockRepository.find).toHaveBeenCalledWith({ topic: 'Banking/Chase' });
});
```

## Coverage Goals

| Feature | Test Count | Coverage |
|---------|------------|----------|
| Inbox Manager | 15+ | All archival rules, sync phases |
| Timeline | 20+ | All filter types, combinations |
| Topic Summaries | 10+ | Generation, updates, structure |
| Deals | 15+ | Extraction, filtering, actions |
| Topic Labeling | 12+ | Hierarchy, normalization |
| Gmail Sync | 15+ | Initial, incremental, recovery |
| Settings | 10+ | Persistence, validation |
| Onboarding | 10+ | Complete flow |

## Architecture Note

Feature tests should work regardless of implementation:

- Works with Utility Process (current design)
- Would work with Worker Threads (alternative)
- Would work with Main Process (simpler)

This ensures tests remain valid during refactors.
