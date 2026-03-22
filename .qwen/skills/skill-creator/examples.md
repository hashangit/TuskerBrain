# Skill Creator Examples

Complete templates for common Qwen Code Agent Skills. Copy and customize these examples for your needs.

---

## Table of Contents

1. [Document Processing Skills](#document-processing-skills)
2. [Code Development Skills](#code-development-skills)
3. [Data Analysis Skills](#data-analysis-skills)
4. [Communication Skills](#communication-skills)
5. [Project Management Skills](#project-management-skills)

---

## Document Processing Skills

### Example 1: PDF Processor

**Location:** `~/.qwen/skills/pdf-processor/SKILL.md`

```markdown
---
name: pdf-processor
description: Extract text and tables from PDF files, fill forms, merge documents, and convert formats. Use when working with PDFs, forms, document extraction, or PDF manipulation tasks.
---

# PDF Processor

## Overview
Comprehensive PDF processing capabilities for document extraction, manipulation, and conversion.

## Instructions

1. **Identify the Operation**
   - Extraction: Pull text, tables, or images from PDFs
   - Manipulation: Merge, split, rotate, or reorder pages
   - Form Filling: Populate PDF form fields
   - Conversion: Convert PDF to other formats or vice versa

2. **Select Appropriate Tools**
   - Use PyPDF2 for basic operations
   - Use pdfplumber for table extraction
   - Use reportlab for PDF generation

3. **Execute and Validate**
   - Perform the requested operation
   - Verify output quality
   - Handle errors gracefully

## Examples

**Extract Text:**
```
User: "Can you extract all text from this PDF?"
→ Use pdfplumber to extract text content
```

**Extract Tables:**
```
User: "I need the data from this table in the PDF"
→ Use pdfplumber to extract table structure
```

**Merge PDFs:**
```
User: "Combine these three PDFs into one"
→ Use PyPDF2 to merge documents
```

**Fill Form:**
```
User: "Fill out this form with the provided data"
→ Use pypdf to populate form fields
```
```

---

### Example 2: Markdown Documentation Writer

**Location:** `.qwen/skills/md-docs/SKILL.md`

```markdown
---
name: md-docs
description: Create, edit, and maintain Markdown documentation including README files, API docs, and guides. Use when writing documentation, creating READMEs, or documenting codebases.
---

# Markdown Documentation Writer

## Overview
Expert guidance for creating professional Markdown documentation with proper structure, formatting, and best practices.

## Instructions

1. **Determine Document Type**
   - README: Project overview and quick start
   - API Documentation: Endpoint reference
   - User Guide: Step-by-step instructions
   - CONTRIBUTING: Contribution guidelines

2. **Apply Structure Standards**
   - Use consistent heading hierarchy
   - Include table of contents for long documents
   - Add code blocks with language specification
   - Use tables for structured data

3. **Follow Best Practices**
   - Keep paragraphs concise (3-5 sentences)
   - Use links for navigation
   - Include visual elements (images, diagrams)
   - Add badges for project status

## Templates

### README Template
```markdown
# Project Name

Brief description of what the project does.

## Features

- Feature 1
- Feature 2

## Quick Start

```bash
# Installation steps
```

## Usage

```language
# Code examples
```

## License

MIT
```

## Examples

**Create README:**
```
User: "Write a README for my React project"
→ Use README template with React-specific sections
```

**Document API:**
```
User: "Create API documentation for these endpoints"
→ Structure with endpoints, methods, parameters, responses
```
```

---

## Code Development Skills

### Example 3: Code Reviewer

**Location:** `.qwen/skills/code-reviewer/SKILL.md`

```markdown
---
name: code-reviewer
description: Conduct thorough code reviews covering style, security, performance, and best practices. Use when submitting PRs, requesting feedback, or reviewing pull requests.
---

# Code Reviewer

## Overview
Comprehensive code review following industry best practices and team conventions.

## Instructions

1. **Style and Conventions**
   - Check naming conventions
   - Verify code formatting
   - Ensure consistent style

2. **Security Review**
   - Check for injection vulnerabilities
   - Validate input handling
   - Review authentication/authorization

3. **Performance Analysis**
   - Identify bottlenecks
   - Suggest optimizations
   - Check resource usage

4. **Code Quality**
   - Review function complexity
   - Check test coverage
   - Verify error handling

## Review Checklist

- [ ] Code follows style guide
- [ ] No security vulnerabilities
- [ ] Performance is acceptable
- [ ] Error handling is complete
- [ ] Tests are included
- [ ] Documentation is updated

## Examples

**PR Review:**
```
User: "Please review my pull request #42"
→ Apply full review checklist, provide actionable feedback
```

**Security Audit:**
```
User: "Check this code for security issues"
→ Focus on security review section
```
```

---

### Example 4: Test Generator

**Location:** `.qwen/skills/test-generator/SKILL.md`

```markdown
---
name: test-generator
description: Generate comprehensive unit tests, integration tests, and test fixtures. Use when adding test coverage, creating test suites, or implementing TDD.
---

# Test Generator

## Overview
Automated test generation following testing best practices and framework conventions.

## Instructions

1. **Identify Testing Framework**
   - Jest/Vitest for JavaScript/TypeScript
   - pytest for Python
   - JUnit for Java
   - RSpec for Ruby

2. **Determine Test Types**
   - Unit tests for individual functions
   - Integration tests for component interaction
   - End-to-end tests for user flows

3. **Generate Test Cases**
   - Happy path scenarios
   - Edge cases
   - Error conditions
   - Boundary values

4. **Follow Testing Principles**
   - Arrange-Act-Assert pattern
   - Descriptive test names
   - Isolated tests
   - Repeatable results

## Examples

**Unit Tests:**
```
User: "Write tests for this function"
→ Generate unit tests covering all code paths
```

**Integration Tests:**
```
User: "Create integration tests for the API"
→ Generate tests for endpoint interactions
```
```

---

## Data Analysis Skills

### Example 5: Excel Analyst

**Location:** `~/.qwen/skills/excel-analyst/SKILL.md`

```markdown
---
name: excel-analyst
description: Analyze Excel spreadsheets, create pivot tables, generate charts, and automate Excel tasks with Python. Use when working with Excel files, .xlsx data, or spreadsheet analysis.
---

# Excel Analyst

## Overview
Expert Excel processing using openpyxl, pandas, and related libraries.

## Instructions

1. **Load and Parse**
   - Read Excel files with openpyxl
   - Parse multiple sheets
   - Handle different data types

2. **Analyze Data**
   - Create pivot tables
   - Calculate statistics
   - Identify patterns

3. **Generate Output**
   - Create charts and graphs
   - Export to various formats
   - Format for presentation

## Examples

**Data Extraction:**
```
User: "Extract all data from this spreadsheet"
→ Load workbook, parse sheets, return structured data
```

**Pivot Table:**
```
User: "Create a pivot table summarizing sales by region"
→ Generate pivot table with specified dimensions
```
```

---

### Example 6: JSON Data Transformer

**Location:** `.qwen/skills/json-transformer/SKILL.md`

```markdown
---
name: json-transformer
description: Transform, validate, and manipulate JSON data including schema validation, format conversion, and data mapping. Use when working with JSON APIs, data transformation, or configuration files.
---

# JSON Data Transformer

## Overview
Comprehensive JSON processing for data transformation and validation.

## Instructions

1. **Parse and Validate**
   - Parse JSON input
   - Validate against schema
   - Check data types

2. **Transform Data**
   - Map fields
   - Filter arrays
   - Restructure objects

3. **Convert Formats**
   - JSON to CSV/XML
   - CSV/XML to JSON
   - Pretty print/minify

## Examples

**Field Mapping:**
```
User: "Transform this API response to match our schema"
→ Map fields, transform types, validate output
```

**Validation:**
```
User: "Validate this JSON against the schema"
→ Check structure, types, required fields
```
```

---

## Communication Skills

### Example 7: Commit Message Writer

**Location:** `~/.qwen/skills/commit-writer/SKILL.md`

```markdown
---
name: commit-writer
description: Write clear, conventional commit messages following Conventional Commits specification. Use when committing changes, preparing commits, or writing git messages.
---

# Commit Message Writer

## Overview
Generate professional commit messages following Conventional Commits specification.

## Instructions

1. **Analyze Changes**
   - Review git diff
   - Identify change type
   - Determine scope

2. **Format Message**
   - Use conventional format: `type(scope): description`
   - Write imperative mood
   - Keep subject under 50 characters

3. **Add Details**
   - Include body for complex changes
   - Add breaking change notes
   - Reference issues/PRs

## Commit Types

| Type | Description |
|------|-------------|
| feat | New feature |
| fix | Bug fix |
| docs | Documentation |
| style | Formatting |
| refactor | Code restructuring |
| test | Tests |
| chore | Maintenance |

## Examples

**Simple Fix:**
```
User: "Write a commit message for this bug fix"
→ fix(auth): resolve login timeout issue
```

**Feature with Body:**
```
User: "Commit message for the new search feature"
→ feat(search): add full-text search capability

- Implement Elasticsearch integration
- Add search endpoint with filters
- Include search result highlighting

Closes #123
```
```

---

### Example 8: PR Description Writer

**Location:** `.qwen/skills/pr-writer/SKILL.md`

```markdown
---
name: pr-writer
description: Write comprehensive pull request descriptions with context, changes summary, and testing notes. Use when creating PRs, submitting changes, or preparing merge requests.
---

# PR Description Writer

## Overview
Create professional pull request descriptions that facilitate review and communication.

## Instructions

1. **Gather Context**
   - Identify related issues
   - Summarize changes
   - Note dependencies

2. **Structure Description**
   - Problem statement
   - Solution overview
   - Changes list
   - Testing notes

3. **Add Metadata**
   - Issue references
   - Breaking changes
   - Screenshots (if UI)

## Template

```markdown
## Description
Brief summary of changes.

## Related Issue
Closes #XXX

## Changes
- Change 1
- Change 2

## Testing
How to test these changes.

## Screenshots
If applicable.
```

## Examples

**Feature PR:**
```
User: "Write a PR description for the dark mode feature"
→ Use template with feature-specific details
```
```

---

## Project Management Skills

### Example 9: Task Breakdown

**Location:** `.qwen/skills/task-breakdown/SKILL.md`

```markdown
---
name: task-breakdown
description: Break down complex projects into actionable tasks with estimates and dependencies. Use when planning projects, creating roadmaps, or organizing work.
---

# Task Breakdown

## Overview
Systematic project decomposition into manageable tasks.

## Instructions

1. **Understand Project**
   - Gather requirements
   - Identify deliverables
   - Note constraints

2. **Decompose Work**
   - Break into phases
   - Identify work streams
   - Define tasks

3. **Add Details**
   - Estimate effort
   - Note dependencies
   - Assign priorities

## Output Format

```markdown
## Phase 1: Foundation
- [ ] Task 1.1 [Estimate: Xh]
- [ ] Task 1.2 [Estimate: Xh]

## Phase 2: Implementation
- [ ] Task 2.1 [Depends: 1.1]
```

## Examples

**Project Planning:**
```
User: "Break down this feature into tasks"
→ Create phased task list with estimates
```
```

---

### Example 10: Meeting Notes

**Location:** `.qwen/skills/meeting-notes/SKILL.md`

```markdown
---
name: meeting-notes
description: Create structured meeting notes with decisions, action items, and follow-ups. Use when documenting meetings, summarizing discussions, or tracking action items.
---

# Meeting Notes

## Overview
Professional meeting documentation with clear outcomes and accountability.

## Instructions

1. **Capture Basics**
   - Date, time, attendees
   - Meeting purpose
   - Agenda items

2. **Document Discussion**
   - Key points per agenda
   - Decisions made
   - Open questions

3. **Track Actions**
   - Action items with owners
   - Deadlines
   - Follow-up needs

## Template

```markdown
# Meeting: [Title]
Date: YYYY-MM-DD
Attendees: [List]

## Agenda

### Item 1
Discussion points...

**Decision:** [Decision made]

## Action Items
- [ ] Task @owner due YYYY-MM-DD

## Next Meeting
Date: [If known]
```

## Examples

**Team Meeting:**
```
User: "Create notes from this team meeting transcript"
→ Structure with decisions and action items
```
```

---

## Customization Tips

### Adapting Templates

1. **Change the name** to match your use case
2. **Update description** with specific triggers
3. **Modify instructions** for your workflow
4. **Add examples** from your context

### Combining Skills

Skills can reference each other for complex workflows:

```markdown
## Related Skills
- Use with `code-reviewer` for full review workflow
- Combine with `test-generator` for complete PR prep
```

### Adding Scripts

For automation-heavy Skills, add helper scripts:

```
my-skill/
├── SKILL.md
└── scripts/
    └── process.py
```

Reference in instructions:
```markdown
Run the helper script: `python scripts/process.py`
```
