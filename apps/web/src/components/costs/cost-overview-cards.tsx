"use client";

import { DollarSign, Coins, Receipt, Layers } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCost, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CostOverview } from "@ducsigr/api/schemas";

interface CostOverviewCardsProps {
  overview: CostOverview;
}

const formatChange = (change: number): string => {
  const prefix = change >= 0 ? "+" : "";
  return `${prefix}${change.toFixed(1)}%`;
};

function ChangeIndicator({ change }: { change: number }) {
  if (change === 0) return null;
  const isIncrease = change > 0;

  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs",
        isIncrease ? "text-destructive" : "text-green-600"
      )}
    >
      {isIncrease ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {formatChange(change)}
    </span>
  );
}

const CARDS = [
  {
    key: "totalCost",
    label: "Total Cost",
    icon: DollarSign,
    getValue: (o: CostOverview) => formatCost(o.totalCost),
    getChange: (o: CostOverview) => o.costChange,
  },
  {
    key: "tokens",
    label: "Total Tokens",
    icon: Coins,
    getValue: (o: CostOverview) => formatNumber(o.totalTokens),
    getChange: (o: CostOverview) => o.tokenChange,
  },
  {
    key: "avgCost",
    label: "Avg Cost / Trace",
    icon: Receipt,
    getValue: (o: CostOverview) => formatCost(o.avgCostPerTrace),
    getChange: null,
  },
  {
    key: "billable",
    label: "Billable Spans",
    icon: Layers,
    getValue: (o: CostOverview) => formatNumber(o.billableSpans),
    getChange: null,
  },
] as const;

function renderCard(
  card: (typeof CARDS)[number],
  overview: CostOverview
) {
  const Icon = card.icon;
  const change = card.getChange ? card.getChange(overview) : null;

  return (
    <Card key={card.key}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{card.label}</span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{card.getValue(overview)}</span>
          {change !== null && <ChangeIndicator change={change} />}
        </div>
      </CardContent>
    </Card>
  );
}

export function CostOverviewCards({ overview }: CostOverviewCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {CARDS.map((card) => renderCard(card, overview))}
    </div>
  );
}
