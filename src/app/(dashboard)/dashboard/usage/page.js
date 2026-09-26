"use client";

import { Suspense, useState, lazy } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UsageStats, RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";
import ConsoleTab from "./components/ConsoleTab";
import KeyValidationTab from "./components/KeyValidationTab";

const PERIODS = [
  { value: "today", label: "Hari ini" },
  { value: "24h", label: "24j" },
  { value: "7d", label: "7H" },
  { value: "30d", label: "30H" },
  { value: "60d", label: "60H" },
  { value: "all", label: "Semua" },
];

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState("today");

  const tabFromUrl = searchParams.get("tab");
  const validTabs = ["overview", "details", "console", "keys"];
  const activeTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + period selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Ikhtisar" },
            { value: "details", label: "Detail" },
            { value: "console", label: "Konsol" },
            { value: "keys", label: "Validasi Kunci" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        {activeTab === "overview" && (
          <SegmentedControl
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            size="sm"
            className="w-full sm:w-auto"
          />
        )}
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "details" && <RequestDetailsTab />}
      {activeTab === "console" && <ConsoleTab />}
      {activeTab === "keys" && <KeyValidationTab />}
    </div>
  );
}
