"use client";

import { use } from "react";
import TvDayBoard from "@/components/TvDayBoard";

export default function JourTvPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  return <TvDayBoard date={date} />;
}
