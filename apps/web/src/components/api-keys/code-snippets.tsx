"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CODE_SNIPPETS,
  CODE_SNIPPET_LABELS,
  CODE_SNIPPET_LANGUAGES,
  COPY_TIMEOUT_MS,
  type CodeSnippetLanguage,
} from "@/lib/constants/api-keys";

interface CodeSnippetsProps {
  apiKey: string;
}

export function CodeSnippets({ apiKey }: CodeSnippetsProps) {
  const [copiedTab, setCopiedTab] = useState<CodeSnippetLanguage | null>(null);

  const handleCopy = async (language: CodeSnippetLanguage) => {
    const code = CODE_SNIPPETS[language](apiKey);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedTab(language);
      setTimeout(() => setCopiedTab(null), COPY_TIMEOUT_MS);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  };

  const renderTabContent = (language: CodeSnippetLanguage) => {
    const code = CODE_SNIPPETS[language](apiKey);
    const isCopied = copiedTab === language;

    return (
      <TabsContent key={language} value={language} className="mt-0">
        <div className="relative">
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs">
            <code>{code}</code>
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2"
            onClick={() => handleCopy(language)}
          >
            {isCopied ? (
              <>
                <Check className="mr-1 h-3 w-3 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </>
            )}
          </Button>
        </div>
      </TabsContent>
    );
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Quick Start</h4>
      <Tabs defaultValue="curl">
        <TabsList className="grid w-full grid-cols-3">
          {CODE_SNIPPET_LANGUAGES.map((lang) => (
            <TabsTrigger key={lang} value={lang}>
              {CODE_SNIPPET_LABELS[lang]}
            </TabsTrigger>
          ))}
        </TabsList>
        {CODE_SNIPPET_LANGUAGES.map(renderTabContent)}
      </Tabs>
    </div>
  );
}
