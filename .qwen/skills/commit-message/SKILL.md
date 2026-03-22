---
name: commit-message
description: Generate detailed, conventional commit messages from git changes. Use when committing code, preparing commits, or needing commit message suggestions.
---

# Commit Message Generator

## Instructions

When invoked, this skill analyzes all staged and unstaged git changes to create a comprehensive, well-structured commit message following best practices.

### Step 1: Gather Git Information

Execute the following commands to collect context:

```bash
git status && git diff HEAD && git log -n 3
```

This provides:
- **Staged/unstaged files** - What will be committed
- **Full diff** - Exact changes being made
- **Recent commit history** - Match the project's commit message style

### Step 2: Analyze Changes

Examine the diff to identify:

1. **Change Type** (for conventional commits):
   - `feat` - New feature
   - `fix` - Bug fix
   - `docs` - Documentation only
   - `style` - Formatting, missing semi-colons, etc.
   - `refactor` - Code refactoring
   - `test` - Adding/updating tests
   - `chore` - Build process, auxiliary tools

2. **Scope** (optional):
   - Identify the affected component/module

3. **Impact**:
   - Breaking changes?
   - Multiple files changed?
   - Complex logic modifications?

### Step 3: Generate Commit Message

Create a commit message following this structure:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Guidelines:**

| Section | Rules |
|---------|-------|
| **Subject** | - Max 50 characters<br>- Start with verb (imperative mood)<br>- No period at end<br>- Lowercase after type/scope |
| **Body** | - Wrap at 72 characters<br>- Explain WHAT and WHY, not HOW<br>- Use blank line after subject<br>- Optional for simple changes |
| **Footer** | - Reference issues: `Fixes #123`<br>- Breaking changes: `BREAKING CHANGE: <description>`<br>- Optional |

### Step 4: Present to User

Show the draft commit message and ask for:
- Approval to commit directly
- Edges before committing
- Alternative preferences

## Examples

### Example 1: Feature Addition

```
feat(auth): add OAuth2 authentication support

- Integrate OAuth2 flow with provider discovery
- Add token refresh mechanism with exponential backoff
- Create session management middleware
- Update user model with provider fields

Fixes #45
```

### Example 2: Bug Fix

```
fix(api): resolve null pointer in user lookup

The getUserById function was not handling missing users correctly,
causing unhandled promise rejections when querying non-existent IDs.

Added proper error handling and return 404 for missing users.

Fixes #78
```

### Example 3: Refactoring

```
refactor(utils): simplify date formatting logic

- Replace moment.js with native Date API
- Reduce bundle size by ~15KB
- Improve performance for batch operations

BREAKING CHANGE: formatDate() now returns ISO strings instead of moment objects
```

## Usage

### Automatic Activation
Ask questions like:
- "Create a commit message for my changes"
- "What should I write for this commit?"
- "Generate a commit message"

### Explicit Invocation
```
/skills commit-message
```

Then describe what you changed or ask to analyze current git state.

## Output Format

Always provide:
1. **Summary** of changes detected
2. **Proposed commit message** in a code block
3. **Confirmation prompt** before executing git commit
