"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { useSubmitRCAFeedback } from "@/hooks/use-rca-detail";

interface RCAFeedbackCardProps {
  rcaId: string;
  workspaceSlug: string;
  currentHelpful: boolean | null;
  currentFeedback: string | null;
}

export function RCAFeedbackCard({
  rcaId,
  workspaceSlug,
  currentHelpful,
  currentFeedback,
}: RCAFeedbackCardProps) {
  const [helpful, setHelpful] = useState<boolean | null>(currentHelpful);
  const [feedback, setFeedback] = useState(currentFeedback ?? "");
  const [showFeedbackInput, setShowFeedbackInput] = useState(!!currentFeedback);

  const submitFeedback = useSubmitRCAFeedback(workspaceSlug);

  const handleVote = (isHelpful: boolean) => {
    setHelpful(isHelpful);
    setShowFeedbackInput(true);

    submitFeedback.mutate({
      workspaceSlug,
      rcaId,
      helpful: isHelpful,
      feedback: feedback || undefined,
    });
  };

  const handleSubmitComment = () => {
    if (helpful === null) return;

    submitFeedback.mutate({
      workspaceSlug,
      rcaId,
      helpful,
      feedback,
    });
  };

  const handleFeedbackChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFeedback(e.target.value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Was this RCA helpful?
        </CardTitle>
        <CardDescription>
          Your feedback helps improve future root cause analyses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vote buttons */}
        <div className="flex gap-4">
          <Button
            variant={helpful === true ? "default" : "outline"}
            onClick={() => handleVote(true)}
            disabled={submitFeedback.isPending}
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            Yes, helpful
          </Button>
          <Button
            variant={helpful === false ? "destructive" : "outline"}
            onClick={() => handleVote(false)}
            disabled={submitFeedback.isPending}
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            Not helpful
          </Button>
        </div>

        {/* Feedback text input */}
        {showFeedbackInput && (
          <div className="space-y-2">
            <Textarea
              placeholder={
                helpful === false
                  ? "What was incorrect or missing?"
                  : "Any additional feedback? (optional)"
              }
              value={feedback}
              onChange={handleFeedbackChange}
              rows={3}
            />
            <Button
              size="sm"
              onClick={handleSubmitComment}
              disabled={submitFeedback.isPending || !feedback.trim()}
            >
              {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        )}

        {/* Confirmation message */}
        {currentHelpful !== null && !submitFeedback.isPending && (
          <p className="text-sm text-muted-foreground">Thank you for your feedback!</p>
        )}
      </CardContent>
    </Card>
  );
}
