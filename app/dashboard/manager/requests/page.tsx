/**
 * Manager Requests Page
 * 
 * View and approve/reject all requests from site engineers.
 */

import { requireRole } from "@/lib/auth/redirect";
import { ROLES } from "@/lib/auth/roles";
import { ManagerRequestsContent } from "@/components/requests/manager-requests-content";
import { Suspense } from "react";

export default async function ManagerRequestsPage() {
  await requireRole(ROLES.MANAGER);

  return (
    <div className="space-y-6">
      <Suspense fallback={<div>Loading requests...</div>}>
        <ManagerRequestsContent />
      </Suspense>
    </div>
  );
}
