# Knowledge Base User Guide

This guide explains how to use the Workspace Knowledge Base to store business rules, runbooks, and domain knowledge that automatically enhances Root Cause Analysis (RCA) during incidents.

## Overview

The Knowledge Base is a centralized repository for your team's operational knowledge. When errors occur and RCA is triggered, the system automatically searches your knowledge base to find relevant articles that help explain:

- What business rules may have been violated
- Known troubleshooting steps for similar issues
- Domain-specific context that helps diagnose the root cause

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Articles** | The content itself - markdown documents containing business rules, runbooks, how-to guides, or any domain knowledge |
| **Rules** | Matching logic that automatically associates articles with traces based on conditions (error types, service names, etc.) |
| **Groups** | Folders to organize articles hierarchically |
| **Links** | Manual connections between articles and specific traces, alerts, or projects |

## How It Works

```
Error Occurs → RCA Triggered → Knowledge Retrieval → Enhanced Analysis
                                      ↓
                    ┌─────────────────┼─────────────────┐
                    ↓                 ↓                 ↓
              Rule Matching    Semantic Search    Direct Links
              (conditions)     (embeddings)       (manual)
                    ↓                 ↓                 ↓
                    └─────────────────┼─────────────────┘
                                      ↓
                        Relevant Articles Found
                                      ↓
                        Included in RCA Prompt
                                      ↓
                        AI Generates Better RCA
```

### Three Ways Articles Are Matched

1. **Rule-Based Matching**: You define conditions (e.g., "when error contains 'payment'") and the system automatically includes linked articles
2. **Semantic Search**: The system uses AI embeddings to find articles with content similar to the error context
3. **Direct Links**: Manually linked articles to specific traces, alerts, or projects

---

## Getting Started

### Step 1: Navigate to Knowledge Base

1. Open your workspace
2. Click **Knowledge** in the left navigation (under Developer Tools)
3. You'll see a three-column layout:
   - Left: Groups (folders) and search
   - Middle: Article list
   - Right: Article detail/editor

### Step 2: Create Your First Group (Optional)

Groups help organize articles by topic, team, or domain.

1. Click the **+** button next to "Groups" in the left sidebar
2. Enter a name (e.g., "Payment Rules", "API Guidelines", "Runbooks")
3. Optionally add a description
4. Click **Create**

### Step 3: Create an Article

1. Click the **+ New Article** button
2. Fill in the details:
   - **Title**: Clear, descriptive name (e.g., "Payment Amount Validation Rules")
   - **Group**: Select a folder or leave in root
   - **Tags**: Add keywords for easier searching (e.g., "payment", "validation", "amount")
   - **Content**: Write your article in Markdown format

3. Click **Create**

### Step 4: Publish the Article

Articles start as **DRAFT** and must be published to be searchable:

1. Open the article from the list
2. Click the **Publish** button in the detail panel
3. Status changes to **PUBLISHED**

Only published articles are:
- Included in semantic search
- Matched by rules
- Available for manual linking

---

## Writing Effective Articles

### Article Types

| Type | Purpose | Example Content |
|------|---------|-----------------|
| **Business Rules** | Document what should/shouldn't happen | "Payment amounts must be positive and not exceed $10,000 per transaction" |
| **Runbooks** | Step-by-step troubleshooting guides | "If payment fails with code X, check Y, then try Z" |
| **Domain Knowledge** | Context about your system | "The legacy billing system uses format ABC for invoice numbers" |
| **Known Issues** | Document recurring problems | "Timeout errors during month-end are caused by batch processing" |

### Best Practices for Articles

1. **Be Specific**: Include exact error messages, codes, and patterns
2. **Use Keywords**: Include terms that appear in error messages
3. **Add Context**: Explain why rules exist, not just what they are
4. **Include Solutions**: For runbooks, provide actionable steps
5. **Keep Updated**: Regularly review and update outdated content

### Example Article: Business Rule

```markdown
# Payment Amount Validation

## Rule
All payment amounts must meet the following criteria:
- Greater than $0.00 (positive amount)
- Less than or equal to $10,000.00 (single transaction limit)
- Formatted as decimal with 2 decimal places

## Error Codes
- `PAYMENT_AMOUNT_NEGATIVE`: Amount is zero or negative
- `PAYMENT_AMOUNT_EXCEEDS_LIMIT`: Amount exceeds $10,000
- `PAYMENT_AMOUNT_INVALID_FORMAT`: Amount has more than 2 decimal places

## Resolution
1. Validate amount on client side before submission
2. Return 400 Bad Request with specific error code
3. Log validation failure for audit

## Related
- See "Payment Processing Flow" for full pipeline
- Contact payments-team@company.com for limit exceptions
```

### Example Article: Runbook

```markdown
# Database Connection Pool Exhaustion

## Symptoms
- Errors containing "connection pool exhausted" or "no available connections"
- Increased latency across all database operations
- Timeouts in trace spans related to database queries

## Immediate Actions
1. Check current connection count: `SELECT count(*) FROM pg_stat_activity`
2. Identify long-running queries: See "Long Query Identification" article
3. If > 80% pool utilization, trigger connection recycle

## Root Causes
- Long-running transactions not being committed
- Connection leaks from improper error handling
- Sudden traffic spike exceeding pool size

## Prevention
- Set transaction timeouts to 30 seconds max
- Use connection pool monitoring dashboard
- Configure autoscaling for high-traffic periods
```

---

## Creating Rules

Rules automatically associate articles with traces based on conditions. When a trace matches a rule's conditions, the linked article is included in RCA.

### Step 1: Open Rules Tab

1. Go to Knowledge Base
2. Click the **Rules** tab (next to Articles)
3. Click **+ New Rule**

### Step 2: Configure the Rule

| Field | Description |
|-------|-------------|
| **Name** | Descriptive name for the rule (e.g., "Payment Error Rules") |
| **Description** | What this rule matches and why |
| **Scope** | Where the rule applies (Workspace-wide) |
| **Enabled** | Toggle rule on/off |
| **Link To** | Choose Article or Group to associate |
| **Conditions** | FilterExpression that defines matching logic |

### Step 3: Define Conditions

Conditions use the FilterExpression DSL (same as trace filtering). Examples:

```json
{
  "field": "error.message",
  "operator": "contains",
  "value": "payment"
}
```

```json
{
  "and": [
    { "field": "service.name", "operator": "equals", "value": "payment-api" },
    { "field": "error.type", "operator": "equals", "value": "ValidationError" }
  ]
}
```

### Available Condition Fields

| Field | Description |
|-------|-------------|
| `error.message` | The error message text |
| `error.type` | Error class/type name |
| `service.name` | Name of the service |
| `span.name` | Name of the span operation |
| `http.status_code` | HTTP response status |
| `span.attributes.*` | Custom span attributes |

### Available Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match | `"value": "payment-api"` |
| `contains` | Substring match | `"value": "timeout"` |
| `startsWith` | Prefix match | `"value": "PAYMENT_"` |
| `endsWith` | Suffix match | `"value": "_ERROR"` |
| `regex` | Regular expression | `"value": "PAYMENT_\\d+"` |

### Rule Examples

**Match all payment errors:**
```json
{
  "field": "error.message",
  "operator": "contains",
  "value": "payment"
}
```

**Match validation errors in specific service:**
```json
{
  "and": [
    { "field": "service.name", "operator": "equals", "value": "user-api" },
    { "field": "error.type", "operator": "equals", "value": "ValidationError" }
  ]
}
```

**Match any of multiple error types:**
```json
{
  "or": [
    { "field": "error.message", "operator": "contains", "value": "connection refused" },
    { "field": "error.message", "operator": "contains", "value": "pool exhausted" },
    { "field": "error.message", "operator": "contains", "value": "timeout" }
  ]
}
```

---

## Manual Linking

You can manually link articles to specific entities when automatic matching isn't appropriate.

### Link from Trace View

1. Open a trace detail page
2. Find the **Knowledge Articles** section
3. Click the **+** button
4. Search for and select the article to link
5. The article is now permanently linked to this trace

### Link from Article Detail

1. Open an article in the Knowledge Base
2. Go to the **Links** tab
3. View existing links to traces, alerts, and projects
4. (Coming soon: Add links from article view)

### When to Use Manual Links

- One-time incidents that don't fit a pattern
- Historical traces that should reference documentation
- Training examples for new team members
- Incident post-mortems linked to the triggering trace

---

## How RCA Uses Knowledge Base

When RCA is triggered (either automatically via alerts or manually), the system:

1. **Evaluates Rules**: Checks all enabled rules against the trace context
2. **Performs Semantic Search**: Uses AI embeddings to find similar content
3. **Retrieves Direct Links**: Gets any manually linked articles
4. **Deduplicates**: Removes duplicate matches
5. **Builds Context**: Formats relevant articles for the LLM prompt
6. **Generates RCA**: AI uses knowledge context to provide better analysis

### What Gets Included in RCA

The system includes:
- Article titles
- Relevant excerpts (matched sections)
- Match reason (rule, semantic, or direct link)
- Confidence scores for semantic matches

### Example RCA Enhancement

**Without Knowledge Base:**
> Error: Payment amount validation failed
> Root Cause: Unknown validation error in payment processing

**With Knowledge Base:**
> Error: Payment amount validation failed
>
> **Relevant Knowledge:**
> - "Payment Amount Validation" article matched (rule: error contains 'payment')
>   - Rule: Amounts must be > $0 and <= $10,000
>   - Error code PAYMENT_AMOUNT_EXCEEDS_LIMIT indicates amount exceeded limit
>
> **Root Cause:** The payment amount of $15,000 exceeded the $10,000 single transaction limit defined in business rules. This validation is intentional to prevent fraud.
>
> **Resolution:** Either split into multiple transactions or request a limit exception per the documented process.

---

## Managing Your Knowledge Base

### Article Lifecycle

```
DRAFT → PUBLISHED → ARCHIVED
  ↑         ↓           ↓
  └── Edit ──┘     Restore
```

| Status | Searchable | Matchable | Editable |
|--------|------------|-----------|----------|
| DRAFT | No | No | Yes |
| PUBLISHED | Yes | Yes | Yes |
| ARCHIVED | No | No | Yes |

### Version History

Every article change creates a new version:

1. Open an article
2. Click the **Versions** tab
3. View all previous versions with timestamps
4. Click **Revert** to restore a previous version

### Search and Filter

**Search articles:**
- Use the search bar in the left sidebar
- Search queries match title, content, and tags

**Filter by status:**
- Use the status dropdown (All, Published, Draft, Archived)

**Filter by group:**
- Click a group in the left sidebar to show only articles in that group

---

## Tips for Success

### Start Small
1. Begin with 5-10 high-value articles for your most common errors
2. Create rules for clear patterns (specific error types, service names)
3. Expand based on RCA feedback

### Iterate Based on RCA Quality
1. Review RCA outputs to see which knowledge was helpful
2. Improve articles that provided useful context
3. Add new articles for gaps you identify
4. Refine rules that are too broad or too narrow

### Team Collaboration
1. Assign article ownership by domain
2. Review and update articles quarterly
3. Use tags consistently across the team
4. Document tribal knowledge before it's lost

### Measure Impact
1. Compare RCA quality before/after knowledge base
2. Track which articles are matched most frequently
3. Gather feedback from on-call engineers
4. Reduce MTTR by having context readily available

---

## Troubleshooting

### Articles Not Appearing in Search
- Ensure article is **PUBLISHED** (not DRAFT)
- Wait 1-2 minutes for indexing to complete
- Check that search terms match article content

### Rules Not Matching
- Verify the rule is **Enabled**
- Check condition syntax is valid JSON
- Test conditions match your trace attributes
- Use "Preview" to test against recent traces

### Knowledge Not Showing in RCA
- Ensure at least one matching method works (rule, semantic, or link)
- Check that articles are published
- Verify RCA workflow is completing successfully
- Review RCA output for "Knowledge Context" section

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search |
| `n` | New article (when in list view) |
| `e` | Edit article (when viewing) |
| `Escape` | Close dialogs |

### Status Icons

| Icon | Meaning |
|------|---------|
| 📝 | Draft article |
| ✅ | Published article |
| 📦 | Archived article |
| 🔗 | Has linked entities |
| ⚡ | Rule is enabled |

---

## Next Steps

1. **Create your first article**: Document a common error or business rule
2. **Publish it**: Make it searchable and matchable
3. **Create a rule**: Automatically match for similar errors
4. **Trigger an RCA**: See your knowledge in action
5. **Iterate**: Improve based on results

For technical details on the Knowledge Base API and data models, see the [Knowledge Base Spec](./179_workspace_knowledge_base.md).
