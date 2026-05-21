"use client";

import { DirectActionsSection } from "@/components/direct-actions/direct-actions-section";
import { PurchaseDashboardGraphs } from "./purchase-dashboard-graphs";

export function PurchaseDashboardContent() {
  return (
    <div className="space-y-8">
      <PurchaseDashboardGraphs />
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Direct Actions</h2>
        <DirectActionsSection showHeader={false} showCreateButton={true} compact={false} />
      </div>
    </div>
  );
}
