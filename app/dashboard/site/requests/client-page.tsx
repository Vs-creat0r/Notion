"use client";

/**
 * Client Component for Site Requests Page
 *
 * Handles query parameter checking and form opening.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SiteRequestsContent } from "@/components/requests/site-requests-content";

export default function RequestsPageClient() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if create=true is in the URL
    const shouldCreate = searchParams.get('create') === 'true';
    const requestId = searchParams.get('requestId');

    if (shouldCreate) {
      // Trigger the form open event
      const event = new CustomEvent('openRequestForm');
      window.dispatchEvent(event);

      // Clean up the URL by removing the query parameter
      const url = new URL(window.location.href);
      url.searchParams.delete('create');
      window.history.replaceState({}, '', url.toString());
    }

    if (requestId) {
      // Dispatch an event to open request details
      const event = new CustomEvent('openRequestDetails', { detail: requestId });
      window.dispatchEvent(event);

      const url = new URL(window.location.href);
      url.searchParams.delete('requestId');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <SiteRequestsContent />
    </div>
  );
}
