"use client";

import { use } from "react";
import JourContent from "@/components/JourContent";

export default function JourPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  return <JourContent date={date} />;
}
