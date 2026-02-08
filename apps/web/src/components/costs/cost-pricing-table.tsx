"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc/client";

const formatPrice = (price: number): string => {
  return `$${price.toFixed(2)}`;
};

function renderPricingRow(item: {
  id: string;
  provider: string;
  model: string;
  displayName: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}) {
  return (
    <TableRow key={item.id}>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {item.provider}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs">{item.model}</TableCell>
      <TableCell>{item.displayName}</TableCell>
      <TableCell className="text-right">
        {formatPrice(item.inputPricePerMillion)}
      </TableCell>
      <TableCell className="text-right">
        {formatPrice(item.outputPricePerMillion)}
      </TableCell>
    </TableRow>
  );
}

export function CostPricingTable() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: pricing } = trpc.costs.listPricing.useQuery(undefined, {
    enabled: isOpen,
  });

  const handleToggle = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={handleToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-2 hover:bg-muted/50">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Tag className="h-4 w-4" />
              Model Pricing Reference
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {pricing && pricing.length > 0 ? (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead className="text-right">Input $/1M</TableHead>
                      <TableHead className="text-right">Output $/1M</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{pricing.map(renderPricingRow)}</TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex h-[80px] items-center justify-center text-sm text-muted-foreground">
                {pricing ? "No pricing data available" : "Loading..."}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
