"use client";

import { ManagerDailyReportsView } from "@/components/manager/daily-reports-view";

export default function ManagerReportsPage() {
    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <ManagerDailyReportsView />
        </div>
    );
}
