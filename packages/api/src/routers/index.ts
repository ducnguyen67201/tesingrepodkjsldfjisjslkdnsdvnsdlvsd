/**
 * Central Router Registry
 *
 * All tRPC routers are defined here in one place.
 * Frontend usage: trpc.<module>.<action>
 *
 * @example
 * ```ts
 * // Frontend
 * trpc.apiKeys.list.useQuery({ projectId: "..." })
 * trpc.apiKeys.create.useMutation()
 * trpc.projects.get.useQuery({ id: "..." })
 * ```
 */

import { createRouter } from "../trpc";

// Import all route modules
import { apiKeysRouter } from "./apiKeys";
import { workspacesRouter } from "./workspaces";
import { projectsRouter } from "./projects";
import { tracesRouter } from "./traces";
import { domainsRouter } from "./domains";
import { costsRouter } from "./costs";
import { alertsRouter } from "./alerts";
import { channelsRouter } from "./channels";
import { trackedUsersRouter } from "./trackedUsers";
import { internalRouter } from "./internal";
import { githubRouter } from "./github";
import { evalsRouter } from "./evals";
import { filtersRouter } from "./filters";
import { promptsRouter } from "./prompts";
import { promptExperimentsRouter } from "./prompt-experiments";
import { knowledgeRouter } from "./knowledge";
import { extensionsRouter } from "./extensions";
import { themeRouter } from "./theme";
import { logsRouter } from "./logs";
import { dashboardsRouter, graphsRouter } from "./dashboards";

/**
 * Main application router.
 * All sub-routers are merged here.
 *
 * Add new modules by:
 * 1. Create router file in ./routers/<module>.ts
 * 2. Import it above
 * 3. Add to appRouter below
 */
export const appRouter = createRouter({
  /**
   * API Keys management
   * @see ./apiKeys.ts
   *
   * - apiKeys.list    - List all API keys for a project
   * - apiKeys.create  - Create a new API key
   * - apiKeys.delete  - Delete an API key
   */
  apiKeys: apiKeysRouter,

  /**
   * Workspaces management
   * @see ./workspaces.ts
   *
   * - workspaces.list           - List user's workspaces
   * - workspaces.listWithDetails - List with full details
   * - workspaces.getBySlug      - Get workspace by slug
   * - workspaces.create         - Create a new workspace
   * - workspaces.checkSlug      - Check if slug is available
   * - workspaces.listMembers    - List workspace members
   * - workspaces.inviteMember   - Invite a member
   * - workspaces.removeMember   - Remove a member
   */
  workspaces: workspacesRouter,

  /**
   * Projects management
   * @see ./projects.ts
   *
   * - projects.list   - List projects in a workspace
   * - projects.get    - Get a single project
   * - projects.create - Create a new project
   */
  projects: projectsRouter,

  /**
   * Traces (OTLP-first design)
   * @see ./traces.ts
   *
   * - traces.list     - List traces with filters & pagination
   * - traces.get      - Get trace with spans
   * - traces.getStats - Get trace statistics
   */
  traces: tracesRouter,

  /**
   * Allowed Domains (Domain Matcher)
   * @see ./domains.ts
   *
   * - domains.list   - List allowed domains for a workspace
   * - domains.create - Add a domain for auto-join
   * - domains.delete - Remove an allowed domain
   */
  domains: domainsRouter,

  /**
   * Cost Analytics
   * @see ./costs.ts
   *
   * - costs.getOverview   - Get cost overview for a project
   * - costs.getByModel    - Get cost breakdown by model
   * - costs.getTimeSeries - Get cost time series data
   * - costs.listPricing   - List all model pricing
   */
  costs: costsRouter,

  /**
   * Alerts
   * @see ./alerts.ts
   *
   * - alerts.list        - List alerts for a project
   * - alerts.get         - Get alert details
   * - alerts.create      - Create new alert
   * - alerts.update      - Update alert config
   * - alerts.delete      - Delete alert
   * - alerts.toggle      - Enable/disable alert
   * - alerts.history     - Get alert history
   * - alerts.addChannel  - Add notification channel (legacy)
   * - alerts.removeChannel - Remove channel (legacy)
   * - alerts.testChannel - Test notification channel (legacy)
   * - alerts.linkChannel - Link workspace channel to alert
   * - alerts.unlinkChannel - Unlink workspace channel from alert
   * - alerts.getLinkedChannels - Get channels linked to alert
   * - alerts.getProviders - Get available providers
   */
  alerts: alertsRouter,

  /**
   * Notification Channels
   * @see ./channels.ts
   *
   * - channels.list   - List workspace notification channels
   * - channels.get    - Get channel details
   * - channels.create - Create notification channel
   * - channels.update - Update channel config
   * - channels.delete - Delete channel
   * - channels.test   - Test notification channel
   */
  channels: channelsRouter,

  /**
   * Tracked Users (end-users of AI applications)
   * @see ./trackedUsers.ts
   *
   * - trackedUsers.list          - List tracked users
   * - trackedUsers.get           - Get user with sessions
   * - trackedUsers.getByExternalId - Get user by external ID
   * - trackedUsers.summary       - Get project user summary
   * - trackedUsers.update        - Update user metadata
   * - trackedUsers.delete        - Delete tracked user
   *
   * NOTE: traces and analytics endpoints removed - will be reworked for OTLP-first design
   */
  trackedUsers: trackedUsersRouter,

  /**
   * Internal API (Server-to-Server)
   * @see ./internal.ts
   *
   * Used by Temporal activities for database mutations.
   * Requires INTERNAL_API_SECRET authentication.
   *
   * NOTE: Legacy trace ingestion removed - replaced by OTLP-first ingest-node service
   *
   * - internal.ingestScore         - Persist score (TODO: Issue #104)
   * - internal.validateScoreConfig - Validate score config (TODO: Issue #104)
   * - internal.transitionAlertState - Transition alert state
   * - internal.dispatchNotification - Dispatch notification
   */
  internal: internalRouter,

  /**
   * GitHub Integration (RCA System)
   * @see ./github.ts
   *
   * Workspace-level GitHub repository management.
   *
   * - github.getInstallation    - Get GitHub App installation
   * - github.listRepositories   - List repos with filter/search
   * - github.enableRepository   - Enable indexing
   * - github.disableRepository  - Disable indexing
   * - github.reindexRepository  - Trigger re-index
   * - github.getRepository      - Get repo details
   */
  github: githubRouter,

  /**
   * Eval Pipeline (Regression Detection)
   * @see ./evals.ts
   *
   * Proactive regression detection for AI endpoints.
   *
   * - evals.listSuites    - List eval suites for a project
   * - evals.getSuite      - Get eval suite details
   * - evals.createSuite   - Create new eval suite
   * - evals.updateSuite   - Update eval suite config
   * - evals.deleteSuite   - Delete eval suite
   * - evals.toggleSuite   - Enable/disable eval suite
   * - evals.listRuns      - List runs for a suite
   * - evals.getRun        - Get run details
   * - evals.triggerRun    - Trigger manual eval run
   * - evals.updateBaseline - Set baseline from a run
   * - evals.getRunStatus  - Get run status for polling
   * - evals.getPresets    - Get labels and defaults
   */
  evals: evalsRouter,

  /**
   * Filters (v2 Autocomplete & Facets)
   * @see ./filters.ts
   *
   * Used for filter autocomplete and statistics.
   *
   * - filters.keys   - Get attribute keys for autocomplete
   * - filters.values - Get attribute values for autocomplete
   * - filters.stats  - Get filter statistics (facets)
   */
  filters: filtersRouter,

  /**
   * Prompt Management (Prompt Registry)
   * @see ./prompts.ts
   *
   * Central prompt registry with versioning, labels, and SDK retrieval.
   *
   * - prompts.list         - List prompts for a project
   * - prompts.get          - Get prompt with versions
   * - prompts.create       - Create new prompt with initial version
   * - prompts.createVersion - Create new version for existing prompt
   * - prompts.update       - Update prompt metadata
   * - prompts.setLabel     - Set label (production/staging/latest) for version
   * - prompts.archive      - Archive/unarchive prompt
   * - prompts.delete       - Permanently delete prompt
   * - prompts.search       - Search across prompts and versions
   * - prompts.import       - Bulk import prompts
   * - prompts.export       - Export prompts
   * - prompts.getPresets   - Get labels and defaults
   * - prompts.getTags      - Get all tags for a project
   */
  prompts: promptsRouter,

  /**
   * Prompt A/B Experiments
   * @see ./prompt-experiments.ts
   *
   * A/B testing for prompts with deterministic assignment and analytics.
   *
   * - promptExperiments.list      - List experiments for a project
   * - promptExperiments.get       - Get experiment with variants
   * - promptExperiments.getBySlug - Get experiment by slug
   * - promptExperiments.create    - Create new experiment with variants
   * - promptExperiments.update    - Update experiment metadata
   * - promptExperiments.updateWeights - Update variant weights
   * - promptExperiments.start     - Start experiment
   * - promptExperiments.pause     - Pause experiment
   * - promptExperiments.stop      - Complete experiment
   * - promptExperiments.archive   - Archive experiment
   * - promptExperiments.delete    - Delete experiment
   * - promptExperiments.analytics - Get variant analytics
   * - promptExperiments.compare   - Compare two prompt versions
   * - promptExperiments.getPresets - Get labels and defaults
   * - promptExperiments.getTags   - Get experiment tags
   */
  promptExperiments: promptExperimentsRouter,

  /**
   * Knowledge Base (Workspace-Level KB)
   * @see ./knowledge.ts
   *
   * Workspace-level knowledge base for rules, runbooks, and domain knowledge.
   * Integrates with RCA and trace views for auto-matched guidance.
   *
   * Groups:
   * - knowledge.listGroups    - List hierarchical groups
   * - knowledge.createGroup   - Create a group/folder
   * - knowledge.updateGroup   - Update group metadata
   * - knowledge.deleteGroup   - Delete group (moves children)
   *
   * Articles:
   * - knowledge.listArticles  - List articles with filters
   * - knowledge.getArticle    - Get article with versions
   * - knowledge.createArticle - Create new article
   * - knowledge.updateArticle - Update article content
   * - knowledge.publishArticle - Publish article (triggers indexing)
   * - knowledge.archiveArticle - Archive/unarchive article
   * - knowledge.deleteArticle - Permanently delete article
   *
   * Versions:
   * - knowledge.listVersions    - List version history
   * - knowledge.getVersion      - Get specific version
   * - knowledge.revertToVersion - Revert to previous version
   * - knowledge.compareVersions - Compare two versions (diff)
   *
   * Attachments:
   * - knowledge.uploadAttachment - Upload file attachment
   * - knowledge.deleteAttachment - Delete attachment
   * - knowledge.listAttachments  - List article attachments
   *
   * Search:
   * - knowledge.search - Keyword + semantic search
   *
   * Links:
   * - knowledge.linkEntity   - Link article to entity
   * - knowledge.unlinkEntity - Unlink article from entity
   * - knowledge.listLinks    - List entity links
   *
   * Rules:
   * - knowledge.upsertRule  - Create/update auto-match rule
   * - knowledge.deleteRule  - Delete rule
   * - knowledge.listRules   - List rules
   * - knowledge.previewRule - Preview rule matches
   *
   * Stats:
   * - knowledge.stats        - Get KB statistics
   * - knowledge.submitFeedback - Submit article feedback
   * - knowledge.getTags      - Get all tags
   */
  knowledge: knowledgeRouter,

  /**
   * Extensions Hub
   * @see ./extensions.ts
   *
   * Workspace-level extension management for themes, ingestion handlers, etc.
   *
   * Catalog:
   * - extensions.list        - List available extensions
   * - extensions.getById     - Get extension details with versions
   *
   * Installation (admin only):
   * - extensions.install     - Install extension to workspace
   * - extensions.toggle      - Enable/disable installed extension
   * - extensions.configure   - Update extension config
   * - extensions.uninstall   - Uninstall extension
   *
   * Publishing (admin only):
   * - extensions.importManifest - Import manifest to create extension
   */
  extensions: extensionsRouter,

  /**
   * Workspace Theme Customization
   * @see ./theme.ts
   *
   * Visual customization using CSS variables (works with THEME extensions).
   *
   * - theme.getActive     - Get active theme for workspace
   * - theme.setActive     - Enable theme, disable others
   * - theme.saveConfig    - Update theme configuration
   * - theme.listInstalled - List installed THEME extensions
   * - theme.getPresets    - Get available theme presets
   */
  theme: themeRouter,

  /**
   * Logs Explorer
   * @see ./logs.ts
   *
   * Workspace-level access to ingested OTLP logs.
   *
   * - logs.list           - List logs with filters & pagination
   * - logs.get            - Get log details
   * - logs.getServices    - Get distinct services for filters
   * - logs.getSeverityStats - Get severity distribution
   */
  logs: logsRouter,

  /**
   * Observability Dashboards
   * @see ./dashboards.ts
   *
   * Configurable dashboards for metrics visualization.
   *
   * - dashboards.list      - List dashboards
   * - dashboards.get       - Get dashboard with widgets
   * - dashboards.getDefault - Get default dashboard
   * - dashboards.create    - Create dashboard
   * - dashboards.update    - Update dashboard metadata
   * - dashboards.delete    - Delete dashboard
   * - dashboards.upsertWidget - Create/update widget
   * - dashboards.deleteWidget - Delete widget
   * - dashboards.updateLayout - Batch update widget positions
   * - dashboards.getPresets - Get labels and options
   */
  dashboards: dashboardsRouter,

  /**
   * Graph Queries
   * @see ./dashboards.ts
   *
   * Execute metric queries for dashboard widgets.
   *
   * - graphs.query          - Execute graph query
   * - graphs.projectSummaries - Get project summaries for overview
   */
  graphs: graphsRouter,

  /**
   * Future modules:
   *
   * billing: billingRouter,    // Billing & subscriptions
   */
});

/**
 * Type definition for the app router.
 * Used for type inference on the client.
 */
export type AppRouter = typeof appRouter;

/**
 * Re-export individual routers for direct imports if needed.
 */
export {
  apiKeysRouter,
  workspacesRouter,
  projectsRouter,
  tracesRouter,
  domainsRouter,
  costsRouter,
  alertsRouter,
  channelsRouter,
  trackedUsersRouter,
  internalRouter,
  githubRouter,
  evalsRouter,
  filtersRouter,
  promptsRouter,
  promptExperimentsRouter,
  knowledgeRouter,
  extensionsRouter,
  themeRouter,
  logsRouter,
  dashboardsRouter,
  graphsRouter,
};
