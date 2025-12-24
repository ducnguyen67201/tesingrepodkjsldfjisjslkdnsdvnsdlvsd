# /plan - Feature Planning Command

**IMPORTANT: You MUST invoke the `senior-architect` skill to execute this command.**

## Instructions

The user wants to plan a feature: $ARGUMENTS

**Action Required:**
1. Use the Skill tool to invoke `senior-architect`
2. Pass the user's feature request and any referenced files
3. The skill will explore the codebase and produce a structured plan

## How to Execute

```
Skill: senior-architect
Args: Plan the following feature: $ARGUMENTS
```

If the user referenced a spec file (like `@docs/specs/...`), read that file first and include its contents when invoking the skill.

## Expected Output

The senior-architect skill will:
1. Analyze requirements from the spec/request
2. Explore existing codebase patterns
3. Design a convention-compliant solution
4. Output a structured JSON plan with:
   - Database schema changes
   - Zod schemas
   - API procedures
   - Test cases
   - Frontend components

## After Planning

Present the plan and ask:
> **"Plan complete! Next steps:"**
> - `/execute` - Start implementation with agents
> - `/create-ticket` - Create GitHub issues
> - Or describe adjustments needed
