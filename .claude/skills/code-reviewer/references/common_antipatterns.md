# Common Antipatterns

## The Golden Rule

> Every antipattern here was written in production code by smart people.
> Don't feel bad if you recognize your code. Fix it and move on.

---

## TypeScript / React Antipatterns

### 1. Inline Functions in JSX

**The Problem:**
Creates new function references on every render, breaks memoization, makes code harder to read.

```tsx
// BAD - New function created every render
<Button onClick={() => setOpen(true)}>Open</Button>
<Button onClick={() => handleSubmit(item.id)}>Submit</Button>
{items.map((item) => (
  <Card key={item.id} onClick={() => onSelect(item.id)} />
))}

// GOOD - Stable references, readable
const handleOpen = () => setOpen(true);
const handleSubmit = (id: string) => submitItem(id);
const renderItem = (item: Item) => (
  <Card key={item.id} onClick={() => handleSelect(item.id)} />
);

<Button onClick={handleOpen}>Open</Button>
{items.map(renderItem)}
```

**Why It Matters:**
- Child components re-render even when props haven't changed
- DevTools debugging shows `anonymous` instead of `handleOpen`
- Logic scattered throughout JSX is hard to test

---

### 2. Using `any` Type

**The Problem:**
Defeats the purpose of TypeScript. Bugs slip through. Autocomplete breaks.

```tsx
// BAD - No type safety
const data: any = await fetchData();
const handleEvent = (e: any) => { ... };
function transform(input: any): any { ... }

// GOOD - Explicit types
const data: Project[] = await fetchData();
const handleEvent = (e: React.MouseEvent<HTMLButtonElement>) => { ... };
function transform(input: unknown): Project { ... }

// If you truly don't know the type, use unknown and narrow
function parseJson(input: string): unknown {
  const parsed = JSON.parse(input);
  if (isProject(parsed)) {
    return parsed; // Now typed as Project
  }
  throw new Error("Invalid project data");
}
```

---

### 3. Direct `process.env` Usage

**The Problem:**
No validation, no type safety, runtime errors, missing vars in production.

```tsx
// BAD - String | undefined, no validation
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const secret = process.env.API_SECRET;

// GOOD - Validated at startup, typed
import { env } from "@/lib/env";

const apiUrl = env.NEXT_PUBLIC_API_URL; // string (guaranteed)
const secret = env.API_SECRET; // string (server-only, validated)
```

---

### 4. Fat Components

**The Problem:**
Business logic mixed with UI. Hard to test. Hard to reuse.

```tsx
// BAD - Everything in one place
export function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name");

  useEffect(() => {
    async function fetchProjects() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        setProjects(data);
      } catch (err) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProjects();
  }, []);

  const filteredProjects = projects
    .filter(p => p.name.includes(searchTerm))
    .sort((a, b) => a[sortBy].localeCompare(b[sortBy]));

  // 200 more lines of JSX...
}

// GOOD - Thin component, logic in hooks
export function ProjectsPage() {
  const { projects, isLoading, error } = useProjects();
  const { searchTerm, setSearchTerm, sortBy, setSortBy, filtered } =
    useProjectFilters(projects);

  if (isLoading) return <ProjectsSkeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <ProjectsLayout>
      <ProjectsToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
      <ProjectList projects={filtered} />
    </ProjectsLayout>
  );
}
```

---

### 5. Constants Inside Components

**The Problem:**
Recreated every render. Can't be imported. Harder to test.

```tsx
// BAD - Inside component
export function Navigation() {
  const navItems = [
    { title: "Dashboard", href: "/" },
    { title: "Projects", href: "/projects" },
  ];

  return <nav>{navItems.map(...)}</nav>;
}

// GOOD - Module level constant
const NAV_ITEMS = [
  { title: "Dashboard", href: "/" },
  { title: "Projects", href: "/projects" },
] as const;

export function Navigation() {
  return <nav>{NAV_ITEMS.map(renderNavItem)}</nav>;
}

// BETTER - Shared constants file for reuse
// src/lib/constants/navigation.ts
export const NAV_ITEMS = [...] as const;
```

---

### 6. Custom CSS for Standard UI

**The Problem:**
Inconsistent design. Maintenance nightmare. Reinventing the wheel.

```tsx
// BAD - Custom everything
<button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
  Submit
</button>
<div className="border rounded-lg p-4 shadow-sm">
  <h3 className="text-lg font-semibold">Title</h3>
  <p>Content</p>
</div>

// GOOD - shadcn/ui components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

<Button>Submit</Button>
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

---

### 7. Premature Optimization

**The Problem:**
useMemo/useCallback everywhere "just in case". Adds complexity, rarely helps.

```tsx
// BAD - Memoizing everything
const Component = () => {
  const data = useMemo(() => items.filter(x => x.active), [items]);
  const handleClick = useCallback(() => setOpen(true), []);
  const styles = useMemo(() => ({ color: "red" }), []);

  return <Child data={data} onClick={handleClick} style={styles} />;
};

// GOOD - Only memoize when proven necessary
const Component = () => {
  const data = items.filter(x => x.active);
  const handleClick = () => setOpen(true);

  return <Child data={data} onClick={handleClick} style={{ color: "red" }} />;
};

// When DO you need memoization?
// 1. Expensive calculations (proven by profiling)
// 2. Referential equality matters (passing to memoized child)
// 3. Effect dependencies that would cause infinite loops
```

---

### 8. Prop Drilling

**The Problem:**
Passing props through many layers. Fragile. Annoying to refactor.

```tsx
// BAD - Props passed through 4 levels
<App user={user}>
  <Layout user={user}>
    <Sidebar user={user}>
      <UserMenu user={user} />
    </Sidebar>
  </Layout>
</App>

// GOOD - Context for cross-cutting concerns
const UserContext = createContext<User | null>(null);

function App() {
  const user = useUser();
  return (
    <UserContext.Provider value={user}>
      <Layout>
        <Sidebar />
      </Layout>
    </UserContext.Provider>
  );
}

function UserMenu() {
  const user = useContext(UserContext);
  // ...
}
```

---

## Go Antipatterns

### 1. Silent Error Swallowing

**The Problem:**
Errors disappear. Bugs become impossible to debug.

```go
// BAD - Error ignored
result, _ := doSomething()

// BAD - Error logged but not propagated
if err != nil {
    log.Printf("error: %v", err)
    return nil // Caller doesn't know something failed
}

// GOOD - Always handle or propagate
result, err := doSomething()
if err != nil {
    return nil, fmt.Errorf("doing something: %w", err)
}
```

---

### 2. Naked Returns with Errors

**The Problem:**
Loses context. Makes debugging a nightmare.

```go
// BAD - No context
func ProcessTrace(ctx context.Context, trace *Trace) error {
    if err := validate(trace); err != nil {
        return err
    }
    if err := save(ctx, trace); err != nil {
        return err
    }
    if err := notify(ctx, trace.ID); err != nil {
        return err
    }
    return nil
}
// When this fails, you get: "invalid input"
// Which step? No idea.

// GOOD - Wrapped with context
func ProcessTrace(ctx context.Context, trace *Trace) error {
    if err := validate(trace); err != nil {
        return fmt.Errorf("validating trace: %w", err)
    }
    if err := save(ctx, trace); err != nil {
        return fmt.Errorf("saving trace %s: %w", trace.ID, err)
    }
    if err := notify(ctx, trace.ID); err != nil {
        return fmt.Errorf("notifying for trace %s: %w", trace.ID, err)
    }
    return nil
}
// Now you get: "notifying for trace abc123: connection refused"
```

---

### 3. Ignoring Context Cancellation

**The Problem:**
Goroutines leak. Resources held. Requests hang.

```go
// BAD - Context ignored
func (s *Service) Process(ctx context.Context, data []byte) error {
    // Long operation that ignores ctx
    result := expensiveOperation(data)
    return s.save(result)
}

// GOOD - Check context
func (s *Service) Process(ctx context.Context, data []byte) error {
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }

    result := expensiveOperation(data)

    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
    }

    return s.save(ctx, result)
}
```

---

### 4. Defer in Hot Loops

**The Problem:**
Deferred calls stack up. Memory grows. Performance tanks.

```go
// BAD - Defer accumulates
func ProcessAll(items []Item) error {
    for _, item := range items {
        f, err := os.Open(item.Path)
        if err != nil {
            return err
        }
        defer f.Close() // All defers run at function end!

        process(f)
    }
    return nil
}

// GOOD - Close immediately or extract to function
func ProcessAll(items []Item) error {
    for _, item := range items {
        if err := processOne(item); err != nil {
            return err
        }
    }
    return nil
}

func processOne(item Item) error {
    f, err := os.Open(item.Path)
    if err != nil {
        return err
    }
    defer f.Close() // Now runs after each item

    return process(f)
}
```

---

### 5. Panic in Libraries

**The Problem:**
Crashes the whole program. Caller can't handle it gracefully.

```go
// BAD - Panic for recoverable errors
func ParseConfig(path string) *Config {
    data, err := os.ReadFile(path)
    if err != nil {
        panic(err) // Kills the program
    }
    // ...
}

// GOOD - Return errors
func ParseConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("reading config %s: %w", path, err)
    }
    // ...
}
```

---

## Database Antipatterns

### 1. N+1 Queries

**The Problem:**
1 query for list + N queries for relations = slow.

```tsx
// BAD - N+1
const projects = await prisma.project.findMany();
for (const project of projects) {
  const traces = await prisma.trace.findMany({
    where: { projectId: project.id }
  });
  // 1 + N queries
}

// GOOD - Include relation
const projects = await prisma.project.findMany({
  include: { traces: true }
});
// 1 query (or 2 with separate queries optimization)

// BETTER for large relations - Separate queries
const projects = await prisma.project.findMany();
const projectIds = projects.map(p => p.id);
const traces = await prisma.trace.findMany({
  where: { projectId: { in: projectIds } }
});
// 2 queries total, regardless of count
```

---

### 2. Unbounded Queries

**The Problem:**
Fetching all records. Memory explosion. Timeout.

```tsx
// BAD - Could be millions of records
const allTraces = await prisma.trace.findMany();

// GOOD - Always paginate
const traces = await prisma.trace.findMany({
  take: 20,
  skip: page * 20,
  orderBy: { createdAt: "desc" }
});

// GOOD - For processing, use cursor-based
let cursor: string | undefined;
while (true) {
  const batch = await prisma.trace.findMany({
    take: 100,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
  });
  if (batch.length === 0) break;
  cursor = batch[batch.length - 1].id;
  await processBatch(batch);
}
```

---

### 3. Selecting Everything

**The Problem:**
Fetching all columns when you need 2. Wasted bandwidth. Slower queries.

```tsx
// BAD - Fetches all columns
const projects = await prisma.project.findMany();
// Only using project.id and project.name in the UI

// GOOD - Select only what you need
const projects = await prisma.project.findMany({
  select: {
    id: true,
    name: true,
  }
});
```

---

## Architecture Antipatterns

### 1. Wrong Layer for Code

**The Problem:**
Web code in shared. Database code in UI. Chaos.

```
// BAD - React component in shared package
packages/shared/src/components/Button.tsx

// BAD - Prisma queries in component
apps/web/src/components/ProjectCard.tsx
  const projects = await prisma.project.findMany() // NO

// GOOD - Proper layers
apps/web/src/components/       # UI components
apps/web/src/hooks/            # Data fetching hooks
apps/web/src/app/api/          # API routes with Prisma
packages/shared/src/           # Pure utilities, types
packages/db/                   # Database schema, client
```

---

### 2. Editing Generated Files

**The Problem:**
Changes lost on next generation. Conflicts. Confusion.

```bash
# BAD - Directly editing generated proto files
apps/ingest/internal/proto/ducsigrv1/trace.pb.go  # Generated!
packages/proto/src/generated/trace_pb.ts              # Generated!

# GOOD - Edit source, regenerate
proto/ducsigr/v1/trace.proto  # Edit this
make proto                        # Regenerates all
```

---

### 3. Backwards Compatibility for Unused Code

**The Problem:**
Dead code lives forever. "Someone might be using it."

```tsx
// BAD - Keeping around "just in case"
export function oldFunction() {
  // deprecated, use newFunction
}

// @deprecated Use newFunction instead
export const legacyExport = oldFunction;

// Re-export for backwards compatibility
export { renamed as _oldName };

// GOOD - Delete it
// If it breaks something, tests will tell you
// If no tests, monitor errors after deploy
```

---

## Security Antipatterns

### 1. Secrets in Code

**The Problem:**
Committed to git. Visible in logs. Leaked.

```tsx
// BAD - Hardcoded secrets
const API_KEY = "sk_live_abc123";
const DATABASE_URL = "postgres://user:password@host/db";

// GOOD - Environment variables (validated)
import { env } from "@/lib/env";
const apiKey = env.API_KEY;
const databaseUrl = env.DATABASE_URL;
```

---

### 2. Logging Sensitive Data

**The Problem:**
Credentials in logs. PII exposed. Compliance nightmare.

```go
// BAD - Logging everything
log.Printf("Request: %+v", request) // May contain auth headers, tokens

// GOOD - Redact sensitive fields
log.Printf("Request: method=%s path=%s user=%s",
    r.Method, r.URL.Path, request.UserID)
```

---

### 3. No Input Validation at Boundaries

**The Problem:**
Trusting user input. SQL injection. XSS. Command injection.

```tsx
// BAD - Direct use of user input
const query = `SELECT * FROM users WHERE id = '${userId}'`;
const result = exec(`ls ${userPath}`);

// GOOD - Validate and sanitize
import { z } from "zod";

const UserIdSchema = z.string().uuid();
const userId = UserIdSchema.parse(input); // Throws if invalid

// Prisma handles SQL injection
await prisma.user.findUnique({ where: { id: userId } });
```

---

## Quick Reference: Smell → Fix

| Code Smell | Quick Fix |
|------------|-----------|
| `onClick={() => {}}` | Extract to `handleClick` |
| `any` type | Use proper type or `unknown` |
| `process.env.X` | Use `env.X` from env.ts |
| 200+ line component | Extract hooks and sub-components |
| `const x = []` inside component | Move to module level |
| Custom `<button>` styles | Use `<Button>` from shadcn |
| `useMemo` everywhere | Remove unless profiler shows need |
| `return err` in Go | `return fmt.Errorf("context: %w", err)` |
| `_, _ = doThing()` | Handle the error |
| `defer` in loop | Extract to separate function |
| `findMany()` without limit | Add `take` parameter |
| Editing `*.pb.go` or `*_pb.ts` | Edit `.proto` file instead |
| Secrets in code | Move to environment variables |
