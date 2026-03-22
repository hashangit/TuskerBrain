# Skill Creator Reference

Complete reference for creating Qwen Code Agent Skills with all supported features.

---

## Table of Contents

1. [SKILL.md Format Specification](#skillmd-format-specification)
2. [YAML Frontmatter Reference](#yaml-frontmatter-reference)
3. [Directory Structure](#directory-structure)
4. [Skill Discovery](#skill-discovery)
5. [Invocation Methods](#invocation-methods)
6. [Extension Integration](#extension-integration)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## SKILL.md Format Specification

### Complete Structure

```markdown
---
name: skill-name
description: What this Skill does and when to use it
---

# Skill Display Name

## Optional Sections

### Overview
Brief overview of the Skill's purpose.

### Instructions
Step-by-step guidance for Qwen Code.

### Examples
Concrete usage examples.

### Notes
Additional context or edge cases.
```

### Section Guidelines

| Section | Required | Purpose |
|---------|----------|---------|
| YAML Frontmatter | **Yes** | Metadata for Skill discovery |
| Title (`#`) | Yes | Display name |
| Instructions | Recommended | Core guidance |
| Examples | Recommended | Usage patterns |
| Other sections | Optional | Additional context |

---

## YAML Frontmatter Reference

### Required Fields

#### `name`
- **Type:** String (non-empty)
- **Format:** lowercase letters, numbers, hyphens only
- **Example:** `pdf-processor`, `code-review`, `api-docs`

#### `description`
- **Type:** String (non-empty)
- **Format:** Plain text
- **Best Practice:** Include what + when triggers
- **Example:** `Analyze Excel spreadsheets, create pivot tables. Use when working with Excel files or .xlsx data.`

### Field Validation Rules

```yaml
# Valid
name: my-skill-123
description: Process PDF files. Use when extracting or merging documents.

# Invalid - contains uppercase
name: My-Skill

# Invalid - contains special characters
name: my_skill

# Invalid - empty description
description:

# Invalid - missing name
name:
```

---

## Directory Structure

### Minimal Structure

```
<skill-name>/
└── SKILL.md              # Required
```

### Full Structure

```
<skill-name>/
├── SKILL.md              # Required - main skill definition
├── reference.md          # Optional - detailed documentation
├── examples.md           # Optional - usage examples
├── templates/
│   └── template.txt      # Optional - reusable templates
└── scripts/
    └── helper.py         # Optional - utility scripts
```

### Storage Locations

| Type | Path | Scope |
|------|------|-------|
| Personal | `~/.qwen/skills/<skill-name>/` | User-wide |
| Project | `.qwen/skills/<skill-name>/` | Project-specific |
| Extension | `<extension>/skills/` | Extension-provided |

---

## Skill Discovery

### Discovery Order

Qwen Code discovers Skills from three sources:

1. **Personal Skills** - `~/.qwen/skills/`
2. **Project Skills** - `.qwen/skills/`
3. **Extension Skills** - Extension directories

### Discovery Commands

```bash
# List personal Skills
ls ~/.qwen/skills/

# List project Skills
ls .qwen/skills/

# View Skill content
cat ~/.qwen/skills/<skill>/SKILL.md
cat .qwen/skills/<skill>/SKILL.md

# Debug mode (shows loading errors)
qwen --debug
```

---

## Invocation Methods

### Model-Invoked (Automatic)

The model automatically uses Skills when:
- Your request matches the Skill's `description`
- The task aligns with the Skill's instructions

**Example:**
```
User: "Can you extract text from this PDF?"
→ pdf-processor Skill activates (if description mentions PDF extraction)
```

### User-Invoked (Explicit)

Use the slash command to explicitly invoke a Skill:

```
/skills <skill-name>
```

**Features:**
- Tab completion for skill names
- Works regardless of description matching

---

## Extension Integration

### Declaring Skills in Extensions

Extensions provide Skills via `qwen-extension.json`:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "skills": ["skill-name-1", "skill-name-2"]
}
```

### Extension Skill Structure

```
my-extension/
├── qwen-extension.json
└── skills/
    ├── skill-name-1/
    │   └── SKILL.md
    └── skill-name-2/
        └── SKILL.md
```

---

## Troubleshooting Guide

### Skill Not Activating

**Symptoms:**
- Skill doesn't trigger automatically
- Model doesn't seem aware of the Skill

**Solutions:**
1. Add more specific trigger keywords to `description`
2. Include both "what" and "when" in description
3. Test with explicit `/skills <skill-name>` command
4. Restart Qwen Code

### File Not Found

**Symptoms:**
- Skill not appearing in `/skills` autocomplete
- Debug mode shows "file not found"

**Solutions:**
1. Verify exact path: `~/.qwen/skills/<skill>/SKILL.md` or `.qwen/skills/<skill>/SKILL.md`
2. Ensure directory name matches `name` field
3. Check file permissions

### YAML Errors

**Symptoms:**
- Debug mode shows YAML parsing errors
- Skill fails to load

**Solutions:**
1. Ensure opening and closing `---` delimiters
2. Use spaces, not tabs
3. Check indentation (2 spaces recommended)
4. Validate field names are lowercase

**Common YAML Mistakes:**

```yaml
# Wrong - tabs instead of spaces
---
name:	my-skill

# Correct
---
name: my-skill

# Wrong - missing closing delimiter
---
name: my-skill
description: Does something

# Correct
---
name: my-skill
description: Does something
---

# Wrong - uppercase field names
---
Name: my-skill
Description: Does something

# Correct
---
name: my-skill
description: Does something
```

### Loading Errors

**Symptoms:**
- Skill partially loads
- Unexpected behavior

**Solutions:**
1. Run `qwen --debug` for detailed error messages
2. Check for syntax errors in SKILL.md content
3. Verify no conflicting Skill names
4. Clear Skill cache by restarting Qwen Code

---

## Best Practices Summary

### Writing Effective Skills

1. **Keep Skills Focused**
   - One responsibility per Skill
   - Split broad Skills into smaller ones

2. **Write Clear Descriptions**
   - Include specific trigger keywords
   - Explain both what and when

3. **Provide Examples**
   - Show common use cases
   - Include expected outputs

4. **Test Thoroughly**
   - Test automatic activation
   - Test explicit invocation
   - Test edge cases

5. **Document Well**
   - Use supporting files for complex Skills
   - Keep instructions up to date

### Naming Conventions

| Pattern | Example | Use |
|---------|---------|-----|
| Single word | `pdf` | Simple, focused Skills |
| Hyphenated | `code-review` | Multi-word Skills |
| With number | `api-v2` | Versioned Skills |
| Domain prefix | `team-code-review` | Team/organization Skills |

---

## Quick Reference Card

```yaml
# Minimal valid SKILL.md
---
name: my-skill
description: What it does. Use when X, Y, Z.
---

# My Skill

## Instructions
1. Step one
2. Step two

## Examples
User: "example request"
→ Skill activates
```

```bash
# Common commands
mkdir -p ~/.qwen/skills/my-skill     # Create personal skill
mkdir -p .qwen/skills/my-skill       # Create project skill
ls ~/.qwen/skills/                   # List personal skills
qwen --debug                         # Debug mode
```
