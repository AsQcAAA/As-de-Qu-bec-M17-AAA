"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Player } from "@/lib/types";

const POSITION_LABEL: Record<string, string> = { F: "Attaquant", D: "Défenseur", G: "Gardien" };
const POSITION_GROUP_LABEL: Record<string, string> = { F: "Attaquants", D: "Défenseurs", G: "Gardiens" };
const POSITION_ORDER: ("F" | "D" | "G")[] = ["F", "D", "G"];

function Avatar({ player }: { player: Player }) {
  if (player.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={player.photo_url} alt={player.full_name} className="h-20 w-20 rounded-full object-cover" />;
  }
  return (
    <div className="h-20 w-20 rounded-full bg-ink-900 text-gold-400 flex items-center justify-center text-2xl font-bold">
      {player.jersey_number ?? player.full_name.charAt(0)}
    </div>
  );
}

export default function JoueursPage() {
  const supabase = createClient();
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRoster, setShowRoster] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNumber, setNewPlayerNumber] = useState("");
  const [newPlayerPos, setNewPlayerPos] = useState<"F" | "D" | "G">("F");

  async function loadPlayers() {
    const { data } = await supabase.from("players").select("*").order("jersey_number");
    setAllPlayers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    await supabase.from("players").insert({
      full_name: newPlayerName.trim(),
      jersey_number: newPlayerNumber ? Number(newPlayerNumber) : null,
      position: newPlayerPos,
    });
    setNewPlayerName("");
    setNewPlayerNumber("");
    loadPlayers();
  }

  async function togglePlayerActive(p: Player) {
    await supabase.from("players").update({ active: !p.active }).eq("id", p.id);
    loadPlayers();
  }

  const players = allPlayers.filter((p) => p.active && !p.is_call_up);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Joueurs</h1>
        <p className="text-slate-500 text-sm">Clique un joueur pour voir sa fiche complète.</p>
      </div>

      <div>
        <button className="text-sm text-ink-800 hover:text-gold-700 font-medium hover:underline" onClick={() => setShowRoster((s) => !s)}>
          {showRoster ? "Masquer l'effectif" : "Gérer l'effectif →"}
        </button>
        {showRoster && (
          <div className="card mt-3 space-y-4">
            <form onSubmit={addPlayer} className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="label">Nom</label>
                <input className="input" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} />
              </div>
              <div className="w-24">
                <label className="label">#</label>
                <input
                  type="number"
                  className="input"
                  value={newPlayerNumber}
                  onChange={(e) => setNewPlayerNumber(e.target.value)}
                />
              </div>
              <div className="w-28">
                <label className="label">Position</label>
                <select className="input" value={newPlayerPos} onChange={(e) => setNewPlayerPos(e.target.value as "F" | "D" | "G")}>
                  <option value="F">Attaquant</option>
                  <option value="D">Défenseur</option>
                  <option value="G">Gardien</option>
                </select>
              </div>
              <button className="btn" type="submit">
                Ajouter
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              {allPlayers
                .filter((p) => !p.is_call_up)
                .map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlayerActive(p)}
                  className={`badge ${p.active ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-400 line-through"}`}
                  title="Cliquer pour activer/désactiver"
                >
                  {p.jersey_number ? `#${p.jersey_number} ` : ""}
                  {p.full_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun joueur actif. Ajoute des joueurs avec « Gérer l'effectif → » ci-dessus.
        </p>
      ) : (
        <div className="space-y-8">
          {POSITION_ORDER.map((pos) => {
            const group = players.filter((p) => p.position === pos);
            if (group.length === 0) return null;
            return (
              <div key={pos}>
                <h2 className="font-semibold text-slate-100 mb-3">
                  {POSITION_GROUP_LABEL[pos]} ({group.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {group.map((p) => (
                    <Link
                      key={p.id}
                      href={`/joueurs/${p.id}`}
                      className="card flex flex-col items-center gap-2 hover:border-gold-400 transition-colors py-5"
                    >
                      <Avatar player={p} />
                      <span className="font-medium text-center">{p.full_name}</span>
                      <div className="flex items-center gap-1.5">
                        {p.jersey_number && <span className="badge bg-gold-100 text-ink-800">#{p.jersey_number}</span>}
                        {p.position && <span className="badge bg-slate-200 text-slate-700">{POSITION_LABEL[p.position]}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          {players.some((p) => !p.position) && (
            <div>
              <h2 className="font-semibold text-slate-100 mb-3">Sans position</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {players
                  .filter((p) => !p.position)
                  .map((p) => (
                    <Link
                      key={p.id}
                      href={`/joueurs/${p.id}`}
                      className="card flex flex-col items-center gap-2 hover:border-gold-400 transition-colors py-5"
                    >
                      <Avatar player={p} />
                      <span className="font-medium text-center">{p.full_name}</span>
                      {p.jersey_number && <span className="badge bg-gold-100 text-ink-800">#{p.jersey_number}</span>}
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
