# TuskerBrain Testing Strategy

This document clarifies the distinction between our two test categories and provides guidance on when to use each approach.

## Two Test Categories

TuskerBrain uses a dual testing strategy to ensure both internal code quality and user-facing feature correctness.

### TDD Tests (`__tests__/features/`)

**Purpose:** Verify internal implementation details and unit behavior.

**Characteristics:**
- Test individual classes, functions, and modules in isolation
- Focus on method signatures, edge cases, and internal logic
- Use direct imports from `@core/` paths
- Mock external dependencies (APIs, file system, etc.)
- Fast execution with no I/O dependencies

**Example structure:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineFilter } from '@core/timeline/filter';
import type { TimelineUpdate } from '@core/types/timeline';

describe('Timeline Filtering', () => {
  describe('Filter by Email Type', () => {
    it('should filter to show only updates emails', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { emailType: 'updates' });

      expect(result.every((u) => u.emailType === 'updates')).toBe(true);
      expect(result.length).toBe(2);
    });
  });
});
```

### POV Tests (`__tests__/features-pov/`)

**Purpose:** Verify user-observable outcomes and behaviors.

**Characteristics:**
- Test from the user's perspective using high-level APIs
- Focus on user stories and acceptance criteria
- Use `TuskerBrainApp` test helper for app-level interactions
- Use `GmailTestAccount` for Gmail-related testing
- Test complete user flows, not just individual functions

**Example structure:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

describe('Feature: Timeline', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
    await app.connectGmail(gmail.credentials);
    await app.seedTimelineWithTestData();
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Viewing the Timeline', () => {
    it('User sees updates displayed chronologically (most recent first)', async () => {
      const timeline = await app.getTimeline();

      for (let i = 0; i < timeline.length - 1; i++) {
        expect(timeline[i].receivedAt >= timeline[i + 1].receivedAt).toBe(true);
      }
    });

    it('User can filter timeline by topic', async () => {
      await app.setTimelineFilter({ topic: 'Banking/Chase' });
      const timeline = await app.getTimeline();

      expect(timeline.every(u => u.topic === 'Banking/Chase')).toBe(true);
    });
  });
});
```

## Key Differences

| Aspect | TDD Tests | POV Tests |
|--------|-----------|-----------|
| **Location** | `__tests__/features/` | `__tests__/features-pov/` |
| **Focus** | Internal implementation | User outcomes |
| **API Style** | Direct imports (`@core/...`) | App helper (`TuskerBrainApp`) |
| **Test Names** | "should do X" | "User can do X" |
| **Assertions** | Method calls, return values | Observable behavior |
| **Setup** | `new Class()` directly | `await TuskerBrainApp.launch()` |
| **Speed** | Very fast (no I/O) | Slower (simulates app) |
| **Scope** | Single unit/method | Feature/flow level |

## Mock Strategy

### What to Mock

**External APIs and Services:**
- Gmail API (use `GmailTestAccount` with mock mode)
- OpenAI API
- Anthropic API
- Any third-party HTTP calls

**Infrastructure:**
- File system operations
- Network requests
- System time (when testing time-dependent logic)

### What NOT to Mock

**Internal Services:**
- `JobQueue` - Use the real implementation
- `AuditLogger` - Use the real implementation
- `TimelineFilter` - Use the real implementation
- Database operations - Use in-memory SQLite

**Business Logic:**
- Email classification logic
- Topic labeling algorithms
- Summary generation
- Any core business rules

### Rationale

By NOT mocking internal services, we ensure:
1. Integration between components works correctly
2. Changes to internal APIs break tests (early warning)
3. Tests reflect real-world behavior
4. Less test maintenance as internals evolve

## Writing TDD Tests

### When to Write TDD Tests

- Adding a new internal utility or service
- Implementing a new algorithm
- Fixing a bug in internal logic
- Adding edge case handling

### TDD Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ServiceName } from '@core/module/service';

describe('Service Name', () => {
  let service: ServiceName;

  beforeEach(() => {
    service = new ServiceName();
  });

  afterEach(async () => {
    // Cleanup if needed
  });

  describe('Method Name', () => {
    it('should do something specific', async () => {
      // Arrange
      const input = { ... };

      // Act
      const result = await service.method(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });

    it('should handle edge case', async () => {
      // Test edge case
    });
  });
});
```

## Writing POV Tests

### When to Write POV Tests

- Implementing a new user-facing feature
- Validating acceptance criteria
- Testing user flows and interactions
- Ensuring observable behavior matches design spec

### POV Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';

/**
 * Feature: Feature Name
 *
 * Design Spec Reference: Lines X-Y
 *
 * As a user, I want to [goal],
 * so I can [benefit].
 */
describe('Feature: Feature Name', () => {
  let app: TuskerBrainApp;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
  });

  afterAll(async () => {
    await app.shutdown();
  });

  describe('User Story Title', () => {
    it('User can do something specific', async () => {
      // Given: Setup state (if needed)
      await app.seedTestData();

      // When: User performs action
      await app.performAction();

      // Then: Verify observable outcome
      const result = await app.getResult();
      expect(result).toMatchExpectedState();
    });
  });
});
```

## Coverage Goals

### TDD Tests Coverage

- All public methods on internal services
- Edge cases and error conditions
- Input validation
- State transitions
- Retry and error recovery logic

### POV Tests Coverage

- All user stories from design spec
- Happy paths for each feature
- Error states visible to users
- Navigation and flow between screens
- Filter and search functionality
- Data persistence across app restarts

## Test Helpers

### TuskerBrainApp

The `TuskerBrainApp` class in `__tests__/test-helpers/app.ts` provides a high-level API for testing:

```typescript
// Launch and configure
const app = await TuskerBrainApp.launch({ freshInstall: true });
await app.connectGmail({ mock: true });
await app.configureLLM({ provider: 'openai', apiKey: 'test-key' });

// Interact with timeline
await app.seedTimelineWithTestData();
const timeline = await app.getTimeline();
await app.setTimelineFilter({ topic: 'Banking/Chase' });

// Work with jobs
await app.seedJobs({ count: 5 });
await app.processAllJobs();
const stats = await app.getJobQueueStats();

// Cleanup
await app.shutdown();
```

### GmailTestAccount

For Gmail-related POV tests:

```typescript
const gmail = await GmailTestAccount.connect();
await app.connectGmail(gmail.credentials);

// Seed test emails
await gmail.seedEmails([
  { subject: 'Bank Statement', from: 'chase.com' },
]);

// Cleanup
await gmail.disconnect();
```

## Best Practices

1. **Use descriptive test names** that explain the expected behavior
2. **One assertion concept per test** - don't test multiple unrelated things
3. **Use `beforeEach`/`afterEach`** for common setup/teardown
4. **Keep tests isolated** - each test should be independent
5. **Don't test implementation details** in POV tests
6. **Reference design spec** in POV test file headers
7. **Use TypeScript types** for better IDE support and refactoring safety

## Running Tests

```bash
# Run all tests
npm test

# Run only TDD tests
npm test -- __tests__/features/

# Run only POV tests
npm test -- __tests__/features-pov/

# Run specific test file
npm test -- __tests__/features/timeline-filtering.test.ts

# Run with coverage
npm test -- --coverage
```

## Summary

| Test Type | Purpose | Location | API |
|-----------|---------|----------|-----|
| TDD | Verify internal logic | `__tests__/features/` | Direct imports |
| POV | Verify user outcomes | `__tests__/features-pov/` | TuskerBrainApp |

Both types are essential:
- **TDD tests** catch bugs early and enable safe refactoring
- **POV tests** ensure the product works as intended for users

Write the right test for the right purpose, and your codebase will be both well-tested and maintainable.
