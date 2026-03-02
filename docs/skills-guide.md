# Skills Guide

Skills are reusable workflows that teach the AI agent how to perform specific tasks. Instead of explaining what you want step by step every time, you can invoke a skill and the agent follows a predefined playbook — reading your data, running the right tools, and producing consistent results.

Think of skills like saved recipes: you provide the ingredients (your data files), invoke the skill, and the agent handles the rest.

## Using a Skill

Type `/` in the chat input to open the skill picker. You'll see a searchable list of all available skills with their descriptions. Select one, optionally add instructions after the name, and press Enter.

**Examples:**

```
/chart-generator
```
Runs the chart generator on whatever data files are in your workspace.

```
/financial-report focus on Q3 and Q4 margins
```
Runs the financial report skill with extra guidance to focus on specific quarters.

You can also type the full command directly without using the picker:

```
/chart-generator make a scatter plot of revenue vs headcount
```

## The Three Kinds of Skills

Skills exist at three levels, each with a different scope:

### Built-in Skills

These ship with the application and are available to every user in every session. They cover common workflows like chart generation and financial reporting. You can use them but cannot edit or delete them.

### My Skills (User Skills)

These are skills you've saved for yourself. They persist across all your sessions — start a new session and your skills are already there. You create them by **promoting** a session skill (see below).

### Session Skills

These are skills that live in your current session only. They're temporary — if you start a new session, they won't carry over unless you promote them.

Session skills are created in two ways:
- **The agent creates one.** During a conversation, the agent might define a new skill on its own (for example, if you ask it to create a reusable workflow). It will appear in the Session section automatically.
- **You demote a user skill.** If you want to edit one of your saved skills, you demote it back to the session so the agent can modify it.

## Creating a Skill

The simplest way to create a skill is to ask the agent:

> "Create a skill called `data-cleaner` that reads a CSV, removes duplicate rows, fills missing values with the column median, and saves a cleaned version to output/"

The agent will create a `SKILL.md` file in your session's skill directory. Once it's working the way you want, you can promote it to save it across sessions.

### Skill File Format

Under the hood, a skill is a folder containing a `SKILL.md` file. The file uses YAML frontmatter for metadata and Markdown for the workflow definition:

```markdown
---
name: data-cleaner
description: Clean CSV files by removing duplicates and filling missing values.
---

# Data Cleaner

Clean the target CSV file(s) for analysis.

## Steps

1. Read the input CSV and profile the data (row count, columns, types)
2. Remove exact duplicate rows
3. For numeric columns with missing values, fill with the column median
4. For text columns with missing values, fill with "Unknown"
5. Save the cleaned file to output/ with a `_cleaned` suffix
6. Print a summary of changes made

## Rules

- Never modify the original file
- Log every transformation applied
- If more than 30% of a column is missing, warn the user before filling
```

**Fields:**
| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Identifier used in the `/name` command. Use lowercase letters, numbers, and hyphens. |
| `description` | Yes | One-line summary shown in the skill picker popup. |

The Markdown body is the actual instruction set the agent follows when the skill is invoked. Structure it however you like — the `Steps` and `Rules` pattern works well but isn't mandatory.

### Supporting Files

A skill can include more than just `SKILL.md`. You can put Python scripts, templates, reference data, or anything else the agent might need in the same folder:

```
my-skill/
  SKILL.md
  template.py
  reference-data.csv
```

The agent can access these files by relative path when executing the skill.

## Managing Your Skills

The **Status Panel** in the bottom-left corner of the app shows all available skills grouped by tier. Click it to expand and see the full list.

### Promote: Save a Session Skill Across Sessions

When the agent creates a skill during your session (or you demote one for editing and you're done), click the **up arrow** button next to the session skill. This promotes it to **My Skills** — it will now be available in all your future sessions.

### Demote: Edit a Saved Skill

Want to tweak one of your saved skills? Click the **down arrow** button next to it in the My Skills section. This moves it back to a session skill where the agent can modify it. Once you're happy with the changes, promote it again.

### Delete: Remove a Saved Skill

Click the **x** button next to any skill in My Skills to permanently delete it. This removes it from all future sessions. (Session skills are automatically cleaned up when the session ends — no need to delete those.)

## Workflow: Creating and Refining Skills

Here's a typical workflow for building a skill:

1. **Ask the agent to create it.** Describe what you want the skill to do in plain language.
2. **Test it.** Upload some data and invoke the skill with `/skill-name`. Check the results.
3. **Iterate.** If the output isn't right, tell the agent what to change. It can edit the skill's `SKILL.md` directly.
4. **Promote it.** Once the skill works well, hit the promote button to save it to My Skills.
5. **Use it everywhere.** The skill is now available in every new session you create.

If you ever need to make changes later, demote the skill, refine it with the agent, and promote it again.

## Tips

- **Be specific in your skill definitions.** The more precise the steps and rules, the more consistent the results.
- **Use the Rules section** to set guardrails — things like "never modify original files" or "format currency with commas."
- **Keep skills focused.** A skill that does one thing well is more reusable than one that tries to handle every case.
- **Add context when invoking.** You can always add instructions after the skill name (`/chart-generator use a dark theme`) to customize a single run without changing the skill itself.
- **Supporting files are powerful.** Include Python scripts, templates, or reference data alongside your `SKILL.md` to give the agent exactly the tools it needs.
