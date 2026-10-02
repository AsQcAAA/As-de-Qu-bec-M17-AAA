"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Player, PlayerContact } from "@/lib/types";

/** Effectif actif (remplaçants compris) et coordonnées des familles, par joueur. */
export function usePlayerContacts() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [contacts, setContacts] = useState<Map<string, PlayerContact>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("players").select("*").eq("active", true).order("jersey_number"),
      supabase.from("player_contacts").select("*"),
    ]).then(([{ data: pls }, { data: cts }]) => {
      setPlayers(pls ?? []);
      setContacts(new Map(((cts ?? []) as PlayerContact[]).map((c) => [c.player_id, c])));
      setLoading(false);
    });
  }, []);

  return { players, contacts, loading };
}

/** « Jean-Gabriel Bussières » → « Jean-Gabriel ». */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
