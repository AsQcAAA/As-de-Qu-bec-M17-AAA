"use client";

import { useMemo, useState } from "react";
import { lastName } from "@/lib/players";
import type { Player, PlayerContact } from "@/lib/types";

const GROUPS: { key: string; label: string; match: (p: Player) => boolean }[] = [
  { key: "F", label: "Attaquants", match: (p) => !p.is_call_up && p.position === "F" },
  { key: "D", label: "Défenseurs", match: (p) => !p.is_call_up && p.position === "D" },
  { key: "G", label: "Gardiens", match: (p) => !p.is_call_up && p.position === "G" },
  { key: "R", label: "Remplaçants", match: (p) => p.is_call_up },
];

const tag = (p: Player) => `${p.jersey_number ? `#${p.jersey_number} ` : ""}${lastName(p.full_name)}`;

/**
 * Choix des destinataires : cocher/décocher un joueur, ajouter ou retirer un
 * groupe d'un clic, retirer quelqu'un directement depuis la rangée des
 * sélectionnés. Les remplaçants font partie de la liste.
 */
export default function RecipientPicker({
  players,
  contacts,
  selected,
  onChange,
}: {
  players: Player[];
  contacts: Map<string, PlayerContact>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [search, setSearch] = useState("");

  const hasEmail = (id: string) => (contacts.get(id)?.emails.length ?? 0) > 0;
  const sections = useMemo(
    () => GROUPS.map((g) => ({ ...g, players: players.filter(g.match) })).filter((g) => g.players.length > 0),
    [players]
  );
  const q = search.trim().toLowerCase();
  const visible = (p: Player) => !q || p.full_name.toLowerCase().includes(q) || String(p.jersey_number ?? "") === q;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }
  function setMany(ids: string[], on: boolean) {
    const next = new Set(selected);
    for (const id of ids) (on ? next.add(id) : next.delete(id));
    onChange(next);
  }
  const allIds = players.map((p) => p.id);
  const regularIds = players.filter((p) => !p.is_call_up).map((p) => p.id);
  const selectedPlayers = players.filter((p) => selected.has(p.id));
  const withoutEmail = selectedPlayers.filter((p) => !hasEmail(p.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-auto min-w-[12rem] flex-1"
          placeholder="Rechercher un joueur ou un numéro…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn-secondary text-xs" onClick={() => onChange(new Set(allIds))}>
          Tous
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => onChange(new Set(regularIds))}>
          Équipe régulière
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => onChange(new Set())}>
          Aucun
        </button>
      </div>

      <div className="rounded-lg bg-slate-100 px-3 py-2">
        <div className="text-xs font-bold text-slate-600 mb-1.5">
          {selectedPlayers.length} destinataire{selectedPlayers.length > 1 ? "s" : ""}
        </div>
        {selectedPlayers.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun joueur sélectionné — coche des joueurs ci-dessous.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedPlayers.map((p) => (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-semibold ${
                  hasEmail(p.id) ? "bg-gold-200 text-ink-900" : "bg-red-100 text-red-800"
                }`}
                title={hasEmail(p.id) ? undefined : "Aucun courriel enregistré pour ce joueur"}
              >
                {tag(p)}
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="h-4 w-4 rounded-full bg-black/10 hover:bg-black/25 leading-none"
                  aria-label={`Retirer ${p.full_name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {withoutEmail.length > 0 && (
          <p className="mt-1.5 text-[11px] font-semibold text-red-700">
            ⚠ Sans courriel (ne recevront rien) : {withoutEmail.map((p) => lastName(p.full_name)).join(", ")}
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {sections.map((g) => {
          const ids = g.players.map((p) => p.id);
          const allOn = ids.every((id) => selected.has(id));
          return (
            <div key={g.key}>
              <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">{g.label}</span>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-ink-800 hover:underline"
                  onClick={() => setMany(ids, !allOn)}
                >
                  {allOn ? "Tout retirer" : "Tout ajouter"}
                </button>
              </div>
              <ul>
                {g.players.filter(visible).map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 rounded px-1 py-1 text-sm cursor-pointer hover:bg-slate-100">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                      <span className="flex-1">{tag(p)}</span>
                      {hasEmail(p.id) ? (
                        <span className="text-[11px] text-slate-400">✉ {contacts.get(p.id)!.emails.length}</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-red-600">sans courriel</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
