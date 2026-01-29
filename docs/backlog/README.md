# Ducsigr Backlog Import Files

This folder contains issue/ticket definitions ready for import into project management tools.

## Files

| File | Format | Use For |
|------|--------|---------|
| `epics.csv` | CSV | Jira/Linear - Epic-level items |
| `stories.csv` | CSV | Jira/Linear - Stories and tasks |
| `linear-import.json` | JSON | Linear API import |

---

## Jira Import Instructions

### Step 1: Create Project
1. Go to Jira → Projects → Create Project
2. Choose "Scrum" template
3. Name: `Ducsigr` (Key: `COG`)

### Step 2: Import Epics First
1. Go to **Project Settings → System → External System Import**
2. Or use: **Settings → System → Import Issues → CSV**
3. Upload `epics.csv`
4. Map columns:
   - Summary → Summary
   - Description → Description
   - Issue Type → Issue Type
   - Priority → Priority
   - Labels → Labels
5. Import

### Step 3: Import Stories
1. Same process with `stories.csv`
2. Additional mappings:
   - Story Points → Story Points (custom field)
   - Epic → Epic Link
   - Sprint → Sprint

### Step 4: Create Sprints
1. Go to Backlog view
2. Create sprints: Sprint 1, Sprint 2, ... Sprint 14
3. Drag issues into appropriate sprints based on "Sprint" field

---

## Linear Import Instructions

### Option A: CSV Import (Recommended)
1. Go to **Settings → Import/Export → Import issues**
2. Select CSV format
3. Upload `stories.csv`
4. Map columns:
   - Summary → Title
   - Description → Description
   - Priority → Priority
   - Story Points → Estimate
   - Labels → Labels
   - Epic → Parent Issue
   - Sprint → Cycle

### Option B: API Import (Programmatic)
Use the Linear API with `linear-import.json`:

```bash
# Install Linear SDK
npm install @linear/sdk

# Create import script
node import-to-linear.js
```

```javascript
// import-to-linear.js
import { LinearClient } from '@linear/sdk';
import issues from './linear-import.json';

const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

async function importIssues() {
  const team = await client.team('YOUR_TEAM_ID');

  for (const issue of issues.issues) {
    await client.createIssue({
      teamId: team.id,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      estimate: issue.estimate,
    });
  }
}

importIssues();
```

### Option C: Copy-Paste
For quick setup, manually create issues from the CSV data.

---

## Sprint Summary

| Sprint | Focus | Story Points |
|--------|-------|--------------|
| Sprint 1-2 | Authentication & API Keys | 13 |
| Sprint 3-4 | Basic Dashboard | 16 |
| Sprint 5-6 | Trace Visualization | 21 |
| Sprint 7-8 | TypeScript SDK | 21 |
| Sprint 9-10 | Python SDK (Core) | 23 |
| Sprint 11 | Python SDK (Frameworks) | 16 |
| Sprint 12-13 | User Management | 15 |
| Sprint 14-15 | Alerting System | 18 |
| Sprint 16-17 | Cost Tracking | 18 |
| **Total** | | **161 pts** |

### SDK Breakdown

| SDK | Stories | Points | Sprints |
|-----|---------|--------|---------|
| TypeScript SDK | 5 | 21 | 7-8 |
| Python SDK | 9 | 39 | 9-11 |
| **Total SDK** | **14** | **60** | |

---

## Label Definitions

| Label | Meaning |
|-------|---------|
| `mvp` | Required for MVP launch |
| `auth` | Authentication related |
| `dashboard` | Web dashboard UI |
| `sdk` | SDK development |
| `infrastructure` | Backend/ops work |
| `visualization` | Trace visualization |
| `alerting` | Alert system |
| `cost` | Cost tracking features |

---

## Priority Mapping

| CSV Value | Jira | Linear |
|-----------|------|--------|
| Highest | Highest | Urgent (1) |
| High | High | High (2) |
| Medium | Medium | Medium (3) |
| Low | Low | Low (4) |
