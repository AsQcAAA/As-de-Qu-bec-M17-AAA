"use client";

import { use } from "react";
import TvDayBoard from "@/components/TvDayBoard";

/**
 * Page nue, destinée à être castée sur la télé du vestiaire : ni menu, ni
 * bouton, ni fond photo — seulement l'horaire du jour, en grand.
 */
export default function DiffusionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  return <TvDayBoard date={date} cast />;
}
