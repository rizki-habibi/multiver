"use client";

import { Suspense, useState, lazy } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CardSkeleton, SegmentedControl } from "@/shared/components";
import ConversationsClient from "./ConversationsClient";

export default function ConversationsPage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ConversationsContent />
    </Suspense>
  );
}

function ConversationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [period, setPeriod] = useState("today");

  const tabFromUrl = searchParams.get("tab");
  const validTabs = ["all", "success", "error"];
  const activeTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "all";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/conversations?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "all", label: "Semua" },
            { value: "success", label: "Sukses" },
            { value: "error", label: "Gagal" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
      </div>
      <ConversationsClient status={activeTab === "all" ? null : activeTab} period={period} />
    </div>
  );
}
