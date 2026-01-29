"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Link as LinkIcon, Sparkles, Target, ExternalLink } from "lucide-react";

interface KnowledgeMatch {
  id: string;
  articleId: string;
  matchType: "RULE" | "SEMANTIC" | "DIRECT_LINK";
  matchScore: number | null;
  matchReason: string | null;
  snapshotTitle: string;
  snapshotExcerpt: string | null;
  article: {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
  } | null;
}

interface RCAKnowledgeCardProps {
  knowledgeMatches: KnowledgeMatch[];
  workspaceSlug: string;
}

const MATCH_TYPE_CONFIG = {
  RULE: {
    label: "Rule Match",
    icon: Target,
    variant: "default" as const,
    description: "Matched by auto-association rule",
  },
  SEMANTIC: {
    label: "Semantic",
    icon: Sparkles,
    variant: "secondary" as const,
    description: "Matched by content similarity",
  },
  DIRECT_LINK: {
    label: "Linked",
    icon: LinkIcon,
    variant: "outline" as const,
    description: "Directly linked to this alert",
  },
};

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function RCAKnowledgeCard({
  knowledgeMatches,
  workspaceSlug,
}: RCAKnowledgeCardProps) {
  if (knowledgeMatches.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Related Knowledge
          <Badge variant="secondary" className="ml-auto">
            {knowledgeMatches.length} {knowledgeMatches.length === 1 ? "article" : "articles"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {knowledgeMatches.map((match) => {
          const config = MATCH_TYPE_CONFIG[match.matchType];
          const MatchIcon = config.icon;
          const articleTitle = match.article?.title || match.snapshotTitle;
          const articleSlug = match.article?.slug;

          return (
            <div
              key={match.id}
              className="p-4 bg-muted/50 rounded-lg border space-y-2"
            >
              {/* Header with title and match type */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    {articleSlug ? (
                      <Link
                        href={`/workspace/${workspaceSlug}/knowledge?article=${articleSlug}`}
                        className="font-medium text-primary hover:underline line-clamp-2"
                      >
                        {articleTitle}
                      </Link>
                    ) : (
                      <span className="font-medium line-clamp-2">{articleTitle}</span>
                    )}
                  </div>
                </div>
                <Badge variant={config.variant} className="shrink-0">
                  <MatchIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </div>

              {/* Excerpt */}
              {match.snapshotExcerpt && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {match.snapshotExcerpt}
                </p>
              )}

              {/* Match reason and score */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                {match.matchReason && (
                  <span className="italic">{match.matchReason}</span>
                )}
                {match.matchScore !== null && (
                  <span className="font-medium">
                    Relevance: {formatScore(match.matchScore)}
                  </span>
                )}
              </div>

              {/* View article button */}
              {articleSlug && (
                <div className="pt-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                    <Link href={`/workspace/${workspaceSlug}/knowledge?article=${articleSlug}`}>
                      View Article
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
