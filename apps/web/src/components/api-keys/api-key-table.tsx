"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApiKeyListItem } from "@ducsigr/api/client";
import { toast } from "sonner";

interface ApiKeyTableProps {
  apiKeys: ApiKeyListItem[];
  onDelete: (key: ApiKeyListItem) => void;
}

export function ApiKeyTable({ apiKeys, onDelete }: ApiKeyTableProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateString);
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const handleCopyDisplayKey = async (displayKey: string) => {
    try {
      await navigator.clipboard.writeText(displayKey);
      toast.success("Key identifier copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const renderRow = (key: ApiKeyListItem) => {
    const expired = isExpired(key.expiresAt);

    return (
      <TableRow key={key.id} className={expired ? "opacity-60" : ""}>
        <TableCell className="font-medium">{key.name}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-xs">{key.displayKey}</code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleCopyDisplayKey(key.displayKey)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy key identifier</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatRelativeDate(key.createdAt)}
        </TableCell>
        <TableCell>
          {key.expiresAt ? (
            expired ? (
              <Badge variant="destructive">Expired</Badge>
            ) : (
              <span className="text-muted-foreground">{formatDate(key.expiresAt)}</span>
            )
          ) : (
            <Badge variant="secondary">Never</Badge>
          )}
        </TableCell>
        <TableCell>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(key)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete key</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{apiKeys.map(renderRow)}</TableBody>
    </Table>
  );
}
