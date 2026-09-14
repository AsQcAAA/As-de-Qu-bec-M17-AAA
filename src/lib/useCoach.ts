"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CoachProfile } from "@/lib/types";

/**
 * Le coach connecté, et l'annuaire de tous les coachs — pour afficher un nom
 * à partir d'un `updated_by` (rapport quotidien, rencontre, alignement).
 *
 * Cette traçabilité n'est montrée qu'à l'entraîneur-chef (`isHeadCoach`) :
 * un adjoint ne doit pas voir qui a écrit quoi, seul le chef en a besoin.
 */
export function useCoachDirectory() {
  const supabase = createClient();
  const [me, setMe] = useState<CoachProfile | null>(null);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: all } = await supabase.from("coach_profiles").select("*");
      setCoaches(all ?? []);
      setMe((all ?? []).find((c) => c.id === user?.id) ?? null);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameById = new Map(coaches.map((c) => [c.id, c.full_name]));

  return {
    me,
    myId: me?.id ?? null,
    isHeadCoach: me?.role === "head_coach",
    nameById,
    /** Nom court à afficher pour un updated_by, ou null s'il n'y a rien à montrer. */
    authorLabel: (updatedBy: string | null) => (updatedBy ? (nameById.get(updatedBy) ?? "Inconnu") : null),
    loading,
  };
}
