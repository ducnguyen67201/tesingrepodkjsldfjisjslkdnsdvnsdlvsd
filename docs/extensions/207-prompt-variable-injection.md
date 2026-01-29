# Spec 06 - Prompt Variable Injection

## Summary
Enable dynamic variable injection into prompt templates using `{{variableName}}` placeholder syntax. Variables can be injected both in the web UI (for preview/testing) and via the SDK (for runtime compilation).

## Goals
- Allow users to define variables in prompt templates using `{{variable}}` syntax
- Provide a web UI for injecting variable values and previewing compiled prompts
- Enable SDK users to compile prompts with variables at runtime
- Support variable metadata (required, default, description)

## Non-Goals
- Complex template logic (conditionals, loops)
- Variable type validation beyond string
- Nested variable references
- Expression evaluation inside placeholders

## User Stories
- As a prompt author, I can define variables in my template using `{{variableName}}` syntax
- As a prompt author, I can specify if a variable is required, has a default value, or has a description
- As a web user, I can inject variable values and see the compiled prompt preview
- As an SDK user, I can fetch a prompt and compile it with variables in my application

## Variable Syntax

### Placeholder Format
```
{{variableName}}
```
- Variable names must match `\w+` (alphanumeric + underscore)
- Placeholders are replaced with provided values during compilation
- Unresolved placeholders remain as-is (non-strict mode) or throw (strict mode)

### Variable Definition Schema
```typescript
interface PromptVariable {
  name: string;        // Variable name (matches placeholder)
  required: boolean;   // Whether the variable must be provided
  default?: string;    // Default value if not provided
  description?: string; // Description shown in UI
}
```

## Architecture

### Web UI Components

#### PromptVariableInjector
Location: `apps/web/src/components/prompts/prompt-variable-injector.tsx`

Responsibilities:
- Extract variables from template content
- Render input fields for each variable
- Show required/default badges
- Display live compiled preview

Props:
```typescript
interface PromptVariableInjectorProps {
  content: PromptTemplate;
  variables?: PromptVariable[] | null;
}
```

#### Integration Points
- `version-card.tsx` - Renders PromptVariableInjector in expanded view
- `prompt-detail-panel.tsx` - Passes variables through to VersionCard

### SDK Integration

#### Current Implementation
Location: `packages/sdk/src/prompts.ts`

The SDK already supports variable compilation via `prompt.compile()`:

```typescript
// Fetch prompt
const prompt = await Ducsigr.prompts.get("movie-critic", {
  label: "production",
});

// Compile with variables
const compiled = prompt.compile({
  movie: "Dune 2",
  criticLevel: "expert",
});

// Use with LLM
const response = await openai.chat.completions.create({
  model: prompt.config?.model || "gpt-4",
  messages: compiled.messages,
});
```

#### Compilation Modes
| Mode | Behavior | Use Case |
|------|----------|----------|
| Non-strict (default) | Unresolved placeholders remain as-is | Development, partial compilation |
| Strict | Throws error for missing variables | Production, ensuring completeness |

```typescript
// Non-strict (default)
prompt.compile({ movie: "Dune 2" }); // {{rating}} stays if undefined

// Strict mode
prompt.compile({ movie: "Dune 2" }, { strict: true }); // Throws if rating missing
```

#### Standalone Utilities
```typescript
import { compilePrompt, extractVariables } from '@ducsigr/sdk';

// Extract variable names from template
const vars = extractVariables(template); // ["movie", "rating"]

// Compile without fetching
const compiled = compilePrompt(
  { type: "text", text: "Review {{movie}} with {{rating}}" },
  { movie: "Dune 2", rating: "5 stars" }
);
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PROMPT VARIABLE INJECTION FLOW                   │
└─────────────────────────────────────────────────────────────────────┘

Web UI Flow:
┌──────────────┐    ┌───────────────────┐    ┌──────────────────┐
│ VersionCard  │───►│VariableInjector   │───►│ Compiled Preview │
│ (expanded)   │    │ - Extract vars    │    │ (live update)    │
│              │    │ - Render inputs   │    │                  │
└──────────────┘    │ - Apply defaults  │    └──────────────────┘
                    └───────────────────┘

SDK Flow:
┌──────────────┐    ┌───────────────────┐    ┌──────────────────┐
│ prompts.get  │───►│ prompt.compile()  │───►│ CompiledPrompt   │
│ (fetch)      │    │ - Replace {{var}} │    │ (ready for LLM)  │
└──────────────┘    └───────────────────┘    └──────────────────┘
```

## API Surface

### Types (Source of Truth)
Location: `packages/api/src/schemas/prompts.ts`

```typescript
// Variable placeholder regex
export const VARIABLE_PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

// Variable definition
export const PromptVariableSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(true),
  default: z.string().optional(),
  description: z.string().optional(),
});
```

### SDK Exports
Location: `packages/sdk/src/index.ts`

```typescript
// Types
export type { PromptVariable, CompiledPrompt } from './prompts';

// Utilities
export { compilePrompt, extractVariables } from './prompts';
```

## UI Design

### Variable Injector Card
```
┌──────────────────────────────────────────────────────────────────┐
│ Dynamic Variables                                                 │
│ Inject values to preview the compiled prompt.                    │
├──────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐  ┌─────────────────────────┐        │
│ │ movie        [required] │  │ rating        [default] │        │
│ │ ┌─────────────────────┐ │  │ ┌─────────────────────┐ │        │
│ │ │ Dune 2              │ │  │ │ 5 stars             │ │        │
│ │ └─────────────────────┘ │  │ └─────────────────────┘ │        │
│ │ Movie title to review   │  │                         │        │
│ └─────────────────────────┘  └─────────────────────────┘        │
├──────────────────────────────────────────────────────────────────┤
│ Compiled Preview                                                 │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │ Review the movie "Dune 2" and provide a rating of 5 stars.   ││
│ └──────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

## Implementation Status

### Completed
- [x] `PromptVariableInjector` component
- [x] Variable extraction from templates
- [x] Live compilation preview
- [x] Default value support
- [x] Required/optional badges
- [x] Integration with `VersionCard`
- [x] SDK `prompt.compile()` method
- [x] SDK `compilePrompt()` utility
- [x] SDK `extractVariables()` utility
- [x] Strict mode support

### File Changes Summary
| File | Changes |
|------|---------|
| `prompt-variable-injector.tsx` | +207 lines (new) |
| `version-card.tsx` | +9/-4 (added variables prop, integration) |
| `prompt-detail-panel.tsx` | +30/-16 (pass variables through) |

## Testing

### Unit Tests Required
Location: `apps/web/src/components/prompts/__tests__/`

1. `extractVariables` - Variable extraction from text/chat templates
2. `compileTemplate` - Placeholder replacement
3. `PromptVariableInjector` - Component rendering and interaction

### Test Cases
- Extract variables from text template
- Extract variables from chat template (multiple messages)
- Handle no variables gracefully
- Apply default values
- Show required badge
- Live preview updates on input
- Handle empty/undefined variables prop

## Future Enhancements
- Variable type hints (string, number, date)
- Variable validation rules
- Autocomplete from variable definitions
- Copy compiled prompt to clipboard
- Export compiled prompt
