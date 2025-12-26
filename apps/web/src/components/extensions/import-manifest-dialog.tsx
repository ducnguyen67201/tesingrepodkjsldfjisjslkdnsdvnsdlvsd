"use client";

import { useState, useCallback, useMemo } from "react";
import { Loader2, FileJson, AlertCircle, Info, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ExtensionManifestSchema,
  ExtensionVisibilitySchema,
  ExtensionTypeSchema,
  EXTENSION_TYPES,
  type ExtensionManifest,
  type ExtensionVisibility,
  type ExtensionType,
} from "@ducsigr/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ImportManifestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onImport: (manifest: ExtensionManifest, visibility: ExtensionVisibility) => Promise<void>;
  isImporting: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const VISIBILITY_OPTIONS: { value: ExtensionVisibility; label: string; description: string }[] = [
  { value: "PRIVATE", label: "Private", description: "Only visible in this workspace" },
  { value: "UNLISTED", label: "Unlisted", description: "Accessible by direct link" },
  { value: "PUBLIC", label: "Public", description: "Visible to all workspaces" },
];

const TYPE_INFO: Record<ExtensionType, { label: string; description: string; permissions: string[] }> = {
  THEME: {
    label: "Theme",
    description: "Customize workspace colors and fonts",
    permissions: ["ui:theme"],
  },
  INGESTION: {
    label: "Ingestion Handler",
    description: "Process and transform trace data during ingestion",
    permissions: ["ingest:read-span", "ingest:write-span"],
  },
  POLICY: {
    label: "Policy Pack",
    description: "Define rules and policies for traces",
    permissions: ["policy:read", "policy:write"],
  },
  WEBHOOK: {
    label: "Webhook",
    description: "Send notifications to external services",
    permissions: ["network:restricted"],
  },
};

const SAMPLE_MANIFESTS: Record<ExtensionType, object> = {
  THEME: {
    id: "mycompany.theme.custom",
    name: "My Custom Theme",
    version: "1.0.0",
    type: "THEME",
    description: "A custom theme with my brand colors",
    permissions: ["ui:theme"],
    configSchema: {
      type: "object",
      properties: {
        primaryColor: { type: "string", default: "#3b82f6" },
        backgroundColor: { type: "string", default: "#ffffff" },
        fonts: {
          type: "object",
          properties: {
            body: { type: "string", default: "Inter" },
            heading: { type: "string", default: "Inter" },
          },
        },
      },
    },
  },
  INGESTION: {
    id: "mycompany.ingestion.custom-tagger",
    name: "Custom Tagger",
    version: "1.0.0",
    type: "INGESTION",
    description: "Add custom tags to traces based on content",
    permissions: ["ingest:read-span", "ingest:write-span"],
    hooks: ["after_parse", "after_normalize"],
    configSchema: {
      type: "object",
      properties: {
        tagPrefix: { type: "string", default: "custom:" },
        patterns: {
          type: "array",
          items: { type: "string" },
          default: ["error", "warning"],
        },
      },
    },
  },
  POLICY: {
    id: "mycompany.policy.custom-rules",
    name: "Custom Policy Rules",
    version: "1.0.0",
    type: "POLICY",
    description: "Custom policy rules for trace validation",
    permissions: ["policy:read", "policy:write"],
    configSchema: {
      type: "object",
      properties: {
        maxLatencyMs: { type: "number", default: 5000 },
        requireTags: {
          type: "array",
          items: { type: "string" },
          default: ["environment", "service"],
        },
      },
    },
  },
  WEBHOOK: {
    id: "mycompany.webhook.custom-notifier",
    name: "Custom Notifier",
    version: "1.0.0",
    type: "WEBHOOK",
    description: "Send notifications to custom endpoint",
    permissions: ["network:restricted"],
    configSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        events: {
          type: "array",
          items: { type: "string" },
          default: ["trace.error", "alert.triggered"],
        },
      },
    },
  },
};

// ============================================================================
// Component
// ============================================================================

export function ImportManifestDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
}: ImportManifestDialogProps) {
  const [mode, setMode] = useState<"guided" | "json">("guided");
  const [visibility, setVisibility] = useState<ExtensionVisibility>("PRIVATE");
  const [error, setError] = useState<string | null>(null);

  // Guided mode state
  const [extType, setExtType] = useState<ExtensionType>("THEME");
  const [extId, setExtId] = useState("");
  const [extName, setExtName] = useState("");
  const [extVersion, setExtVersion] = useState("1.0.0");
  const [extDescription, setExtDescription] = useState("");

  // JSON mode state
  const [manifestJson, setManifestJson] = useState("");

  // Build manifest from guided inputs
  const guidedManifest = useMemo(() => {
    if (!extId || !extName || !extVersion) return null;

    const sample = SAMPLE_MANIFESTS[extType];
    return {
      ...sample,
      id: extId,
      name: extName,
      version: extVersion,
      description: extDescription || undefined,
      type: extType,
      permissions: TYPE_INFO[extType].permissions,
    };
  }, [extType, extId, extName, extVersion, extDescription]);

  // Validate JSON manifest
  const jsonValidation = useMemo(() => {
    if (!manifestJson.trim()) {
      return { valid: false, error: null, manifest: null };
    }

    try {
      const parsed = JSON.parse(manifestJson);
      const result = ExtensionManifestSchema.safeParse(parsed);

      if (!result.success) {
        const firstError = result.error.issues[0];
        return {
          valid: false,
          error: `${firstError?.path.join(".") || "root"}: ${firstError?.message}`,
          manifest: null,
        };
      }

      return { valid: true, error: null, manifest: result.data };
    } catch {
      return { valid: false, error: "Invalid JSON syntax", manifest: null };
    }
  }, [manifestJson]);

  // Validate guided manifest
  const guidedValidation = useMemo(() => {
    if (!guidedManifest) {
      return { valid: false, error: null };
    }

    const result = ExtensionManifestSchema.safeParse(guidedManifest);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return {
        valid: false,
        error: `${firstError?.path.join(".") || "root"}: ${firstError?.message}`,
      };
    }

    return { valid: true, error: null };
  }, [guidedManifest]);

  // Handlers
  const handleTypeChange = useCallback((value: string) => {
    const parsed = ExtensionTypeSchema.safeParse(value);
    if (parsed.success) {
      setExtType(parsed.data);
      // Auto-generate ID prefix
      const typePrefix = value.toLowerCase();
      setExtId(`mycompany.${typePrefix}.`);
    }
  }, []);

  const handleVisibilityChange = useCallback((value: string) => {
    const parsed = ExtensionVisibilitySchema.safeParse(value);
    if (parsed.success) {
      setVisibility(parsed.data);
    }
  }, []);

  const handleLoadSample = useCallback(() => {
    const sample = SAMPLE_MANIFESTS[extType];
    setManifestJson(JSON.stringify(sample, null, 2));
    setError(null);
  }, [extType]);

  const resetForm = useCallback(() => {
    setMode("guided");
    setVisibility("PRIVATE");
    setExtType("THEME");
    setExtId("");
    setExtName("");
    setExtVersion("1.0.0");
    setExtDescription("");
    setManifestJson("");
    setError(null);
  }, []);

  const handleImport = useCallback(async () => {
    let manifest: ExtensionManifest | null = null;

    if (mode === "guided") {
      if (!guidedManifest || !guidedValidation.valid) {
        setError("Please fill in all required fields");
        return;
      }
      const result = ExtensionManifestSchema.safeParse(guidedManifest);
      if (result.success) {
        manifest = result.data;
      }
    } else {
      if (!jsonValidation.manifest) {
        setError("Invalid manifest JSON");
        return;
      }
      manifest = jsonValidation.manifest;
    }

    if (!manifest) {
      setError("Invalid manifest");
      return;
    }

    try {
      await onImport(manifest, visibility);
      // Reset form on success
      resetForm();
    } catch {
      // Error handled by parent
    }
  }, [mode, guidedManifest, guidedValidation, jsonValidation, visibility, onImport, resetForm]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetForm();
      }
      onOpenChange(open);
    },
    [onOpenChange, resetForm]
  );

  const isValid = mode === "guided" ? guidedValidation.valid : jsonValidation.valid;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Create Extension
          </DialogTitle>
          <DialogDescription>
            Create a new extension for your workspace. Choose guided mode for a step-by-step
            process, or JSON mode to paste a complete manifest.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "guided" | "json")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="guided" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Guided
            </TabsTrigger>
            <TabsTrigger value="json" className="gap-2">
              <FileJson className="h-4 w-4" />
              JSON
            </TabsTrigger>
          </TabsList>

          {/* Guided Mode */}
          <TabsContent value="guided" className="space-y-4 mt-4">
            {/* Extension Type */}
            <div className="space-y-2">
              <Label>Extension Type</Label>
              <Select value={extType} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTENSION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <span>{TYPE_INFO[type].label}</span>
                        <span className="text-xs text-muted-foreground">
                          {TYPE_INFO[type].description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-xs text-muted-foreground">Permissions:</span>
                {TYPE_INFO[extType].permissions.map((perm) => (
                  <Badge key={perm} variant="secondary" className="text-xs">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Extension ID */}
            <div className="space-y-2">
              <Label htmlFor="ext-id">
                Extension ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ext-id"
                placeholder="mycompany.theme.custom-dark"
                value={extId}
                onChange={(e) => setExtId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier using reverse domain notation (e.g., com.company.extension-name)
              </p>
            </div>

            {/* Extension Name */}
            <div className="space-y-2">
              <Label htmlFor="ext-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ext-name"
                placeholder="My Custom Theme"
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
              />
            </div>

            {/* Version */}
            <div className="space-y-2">
              <Label htmlFor="ext-version">
                Version <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ext-version"
                placeholder="1.0.0"
                value={extVersion}
                onChange={(e) => setExtVersion(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Semantic version (e.g., 1.0.0)</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="ext-description">Description</Label>
              <Textarea
                id="ext-description"
                placeholder="A brief description of what this extension does..."
                value={extDescription}
                onChange={(e) => setExtDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={handleVisibilityChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview */}
            {guidedManifest && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>{extName || "Untitled"}</strong> v{extVersion}
                  <span className="ml-2 text-muted-foreground">({extType})</span>
                </AlertDescription>
              </Alert>
            )}

            {guidedValidation.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{guidedValidation.error}</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* JSON Mode */}
          <TabsContent value="json" className="space-y-4 mt-4">
            {/* Type selector for sample */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Load Sample Template</Label>
              </div>
              <div className="flex gap-2">
                <Select value={extType} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXTENSION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_INFO[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleLoadSample}>
                  Load {TYPE_INFO[extType].label} Sample
                </Button>
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={handleVisibilityChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* JSON Input */}
            <div className="space-y-2">
              <Label htmlFor="manifest">Manifest JSON</Label>
              <Textarea
                id="manifest"
                placeholder="Paste your extension manifest JSON here..."
                value={manifestJson}
                onChange={(e) => {
                  setManifestJson(e.target.value);
                  setError(null);
                }}
                className="min-h-[250px] font-mono text-sm"
              />
            </div>

            {/* Validation feedback */}
            {jsonValidation.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{jsonValidation.error}</AlertDescription>
              </Alert>
            )}

            {jsonValidation.valid && jsonValidation.manifest && (
              <Alert>
                <FileJson className="h-4 w-4" />
                <AlertDescription>
                  <strong>{jsonValidation.manifest.name}</strong> v{jsonValidation.manifest.version}
                  <span className="ml-2 text-muted-foreground">
                    ({jsonValidation.manifest.type})
                  </span>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!isValid || isImporting}>
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
