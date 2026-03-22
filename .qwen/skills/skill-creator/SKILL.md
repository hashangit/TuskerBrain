---
name: skill-creator
description: Create Qwen Code Agent Skills with proper SKILL.md format, YAML frontmatter, and supporting documentation. Use when building new Skills for personal workflows, team collaboration, or extending Qwen Code capabilities.
---

# Skill Creator

Create comprehensive, well-documented Qwen Code Agent Skills that follow best practices and leverage all supported features.

## Instructions

### Step 1: Determine Skill Type and Location

Choose the appropriate storage location based on the Skill's purpose:

| Skill Type | Path | Use Case |
|------------|------|----------|
| **Personal** | `~/.qwen/skills/<skill-name>/` | Individual workflows, personal productivity |
| **Project** | `.qwen/skills/<skill-name>/` | Team workflows, project-specific expertise |
| **Extension** | `<extension>/skills/` | Extension-provided capabilities |

### Step 2: Create Directory Structure

```bash
# For personal skills
mkdir -p ~/.qwen/skills/<skill-name>

# For project skills
mkdir -p .qwen/skills/<skill-name>
```

### Step 3: Create SKILL.md with Required Format

Every Skill MUST have a `SKILL.md` file with this structure:

```markdown
---
name: <skill-name>
description: <Specific description including what it does AND when to use it>
---

# <Skill Display Name>

## Instructions
Provide clear, step-by-step guidance for Qwen Code.

## Examples
Show concrete examples of using this Skill.
```

### Step 4: Write Effective YAML Frontmatter

**Required Fields:**

| Field | Requirement | Guidelines |
|-------|-------------|------------|
| `name` | **Required** | Lowercase letters, numbers, hyphens only. Must match directory name. |
| `description` | **Required** | Include BOTH what the Skill does AND trigger keywords for when to use it. |

**Description Best Practices:**

❌ **Too vague:**
```yaml
description: Helps with documents
```

✅ **Specific with triggers:**
```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs, forms, or document extraction.
```

### Step 5: Add Supporting Files (Optional)

Enhance your Skill with these optional files:

| File | Purpose |
|------|---------|
| `reference.md` | Detailed documentation, format specifications |
| `examples.md` | Multiple usage examples and templates |
| `scripts/` | Utility scripts for automation |
| `templates/` | Reusable templates for common tasks |

### Step 6: Test the Skill

1. Restart Qwen Code to load the new Skill
2. Test automatic activation by asking questions matching your description
3. Test explicit invocation using `/skills <skill-name>`
4. Run with `qwen --debug` if issues occur

### Step 7: Share with Team (Project Skills)

```bash
git add .qwen/skills/<skill-name>/
git commit -m "Add <skill-name> Skill for team workflows"
git push
```

## Quality Checklist

Before finalizing your Skill, verify:

- [ ] YAML frontmatter has valid syntax (no tabs, correct indentation)
- [ ] `name` field is non-empty and uses valid characters
- [ ] `description` explains what the Skill does AND when to use it
- [ ] Instructions are clear and actionable
- [ ] Examples demonstrate real use cases
- [ ] Skill activates when expected
- [ ] No loading errors in debug mode

## Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Skill doesn't activate | Add specific trigger keywords to description |
| File not found | Verify path matches `~/.qwen/skills/<skill>/SKILL.md` or `.qwen/skills/<skill>/SKILL.md` |
| YAML errors | Check opening/closing `---`, no tabs, correct indentation |
| Loading errors | Run `qwen --debug` to view detailed error messages |

## Examples

See `examples.md` in this Skill directory for complete templates.
