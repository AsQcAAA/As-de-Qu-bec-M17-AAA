"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { toPng } from "html-to-image";
import { lastName } from "@/lib/players";
import ResponsibilitiesBoard from "@/components/ResponsibilitiesBoard";
import type { Player, ResponsibilityCategory, ResponsibilityLog } from "@/lib/types";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

// Delarosbil est un rappel, mais s'entraîne avec le groupe assez régulièrement
// pour rester dans la rotation des responsabilités (seule exception).
const RESPONSIBILITY_CALL_UP_EXCEPTION_ID = "f34e7b01-52be-4810-848c-466a3ede78a6";

function Chip({ player, draggable = true }: { player: Player; draggable?: boolean }) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", player.id)}
      title={player.full_name}
      className="h-14 w-14 shrink-0 rounded-lg font-bold text-sm flex flex-col items-center justify-center border-2 border-slate-300 bg-white text-ink-800 cursor-grab active:cursor-grabbing select-none"
    >
      <span className="text-base leading-none">{player.jersey_number ?? "?"}</span>
      <span className="text-[8px] uppercase leading-tight truncate max-w-[50px]">{lastName(player.full_name)}</span>
    </div>
  );
}

export default function ResponsabilitesPage() {
  const supabase = createClient();
  const logDate = todayStr();
  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState<ResponsibilityCategory[]>([]);
  const [logRows, setLogRows] = useState<ResponsibilityLog[]>([]);
  const [randomOrder, setRandomOrder] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  /** Images sauvegardées, une par date — remplace l'ancien historique texte. */
  const [boards, setBoards] = useState<{ log_date: string; image_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  // Les échecs d'écriture étaient avalés : le joueur glissé ne se posait nulle
  // part et rien n'expliquait pourquoi. On les affiche.
  const [error, setError] = useState<string | null>(null);
  // Les dépôts sont déjà écrits un à un ; ce bouton confirme l'ensemble et
  // débloque l'image à envoyer aux joueurs.
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  async function load() {
    const [{ data: pls }, { data: cats }, { data: logs }, { data: savedBoards }] = await Promise.all([
      supabase
        .from("players")
        .select("*")
        .eq("active", true)
        .or(`is_call_up.eq.false,id.eq.${RESPONSIBILITY_CALL_UP_EXCEPTION_ID}`)
        .order("jersey_number"),
      supabase.from("responsibility_categories").select("*").order("position"),
      supabase.from("responsibility_log").select("*").eq("log_date", logDate),
      supabase.from("responsibility_boards").select("log_date, image_url").order("log_date", { ascending: false }),
    ]);
    setPlayers(pls ?? []);
    setCategories(cats ?? []);
    setLogRows(logs ?? []);
    setBoards(savedBoards ?? []);
    setRandomOrder((prev) => {
      const loggedIds = new Set((logs ?? []).map((l) => l.player_id));
      const stillPooled = (pls ?? []).filter((p) => p.priority_order == null && !loggedIds.has(p.id));
      const known = new Set(prev);
      const kept = prev.filter((id) => stillPooled.some((p) => p.id === id));
      const added = stillPooled.filter((p) => !known.has(p.id)).map((p) => p.id);
      return [...kept, ...added];
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const categoryByPlayer = new Map(logRows.map((l) => [l.player_id, l.category]));

  // Exclusivité : un joueur n'apparaît que dans UN seul endroit à la fois —
  // logué pour cette date (case de responsabilité), sinon "Ordre prioritaire"
  // s'il a un priority_order, sinon "Liste des joueurs" (aléatoire).
  const priorityOrdered = players
    .filter((p) => p.priority_order != null && !categoryByPlayer.has(p.id))
    .sort((a, b) => (a.priority_order ?? 0) - (b.priority_order ?? 0));
  const pooledIds = randomOrder.filter((id) => {
    const p = byId.get(id);
    return p && p.priority_order == null && !categoryByPlayer.has(id);
  });

  async function reorderPriority(draggedId: string, targetId: string | null) {
    const ids = priorityOrdered.map((p) => p.id).filter((id) => id !== draggedId);
    if (targetId) {
      const to = ids.indexOf(targetId);
      ids.splice(to === -1 ? ids.length : to, 0, draggedId);
    } else {
      ids.push(draggedId);
    }
    await Promise.all(ids.map((id, i) => supabase.from("players").update({ priority_order: i }).eq("id", id)));
    load();
  }

  async function removeFromPriority(playerId: string) {
    setError(null);
    await supabase.from("players").update({ priority_order: null }).eq("id", playerId);
    const { error: err } = await supabase
      .from("responsibility_log")
      .delete()
      .eq("log_date", logDate)
      .eq("player_id", playerId);
    if (err) setError(err.message);
    load();
  }

  function shuffle() {
    const loggedIds = new Set(logRows.map((l) => l.player_id));
    const ids = players.filter((p) => p.priority_order == null && !loggedIds.has(p.id)).map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setRandomOrder(ids);
  }

  async function assignToCategory(playerId: string, categoryName: string | null) {
    setError(null);
    const { error: err } = categoryName
      ? await supabase
          .from("responsibility_log")
          .upsert({ log_date: logDate, player_id: playerId, category: categoryName }, { onConflict: "log_date,player_id" })
      : await supabase.from("responsibility_log").delete().eq("log_date", logDate).eq("player_id", playerId);
    if (err) setError(err.message);
    load();
  }

  /** Joueurs assignés à une case, dans l'ordre des numéros. */
  function playersFor(categoryName: string) {
    return logRows
      .filter((l) => l.category === categoryName)
      .map((l) => byId.get(l.player_id))
      .filter((p): p is Player => !!p)
      .sort((a, b) => (a.jersey_number ?? 99) - (b.jersey_number ?? 99));
  }

  /**
   * Réécrit toutes les assignations du jour puis relit la base.
   *
   * Les dépôts s'enregistrent déjà au fil de l'eau : ce bouton sert à confirmer
   * que tout est bien en base avant de générer l'image — c'est cette relecture,
   * et non une écriture supplémentaire, qui donne la certitude.
   */
  async function saveAll() {
    setSaving(true);
    setError(null);
    const rows = logRows.map((l) => ({ log_date: logDate, player_id: l.player_id, category: l.category }));
    if (rows.length > 0) {
      const { error: err } = await supabase
        .from("responsibility_log")
        .upsert(rows, { onConflict: "log_date,player_id" });
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
    }
    await load();

    // L'image EST l'archive : on la produit et on la conserve dans la foulée,
    // pour que ce qui a été envoyé aux joueurs reste consultable tel quel.
    const url = await uploadBoardImage();
    if (url) setBoards((prev) => [{ log_date: logDate, image_url: url }, ...prev.filter((b) => b.log_date !== logDate)]);

    setSavedAt(new Date());
    setSaving(false);
  }

  /** Rend le tableau en PNG, le téléverse et l'enregistre pour cette date. */
  async function uploadBoardImage(): Promise<string | null> {
    if (!boardRef.current) return null;
    try {
      const dataUrl = await toPng(boardRef.current, { pixelRatio: 2, backgroundColor: "#0d0c0c" });
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${logDate}.png`;
      const { error: upErr } = await supabase.storage
        .from("responsibility-boards")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) {
        setError(upErr.message);
        return null;
      }
      const { data } = supabase.storage.from("responsibility-boards").getPublicUrl(path);
      // Le nom de fichier est la date : regénérer une journée écrase l'image
      // précédente, et l'URL publique reste la même. On ajoute un paramètre
      // pour que le navigateur ne serve pas l'ancienne version en cache.
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error: rowErr } = await supabase
        .from("responsibility_boards")
        .upsert({ log_date: logDate, image_url: url }, { onConflict: "log_date" });
      if (rowErr) setError(rowErr.message);
      return url;
    } catch {
      setError("L'image n'a pas pu être générée.");
      return null;
    }
  }

  async function exportImage() {
    if (!boardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(boardRef.current, { pixelRatio: 2, backgroundColor: "#0d0c0c" });
      const link = document.createElement("a");
      link.download = `responsabilites-${logDate}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setError(null);
    const { error: err } = await supabase
      .from("responsibility_categories")
      .insert({ name: newCategoryName.trim(), position: categories.length });
    if (err) setError(err.message);
    setNewCategoryName("");
    load();
  }

  async function removeCategory(cat: ResponsibilityCategory) {
    await supabase.from("responsibility_log").delete().eq("category", cat.name);
    await supabase.from("responsibility_categories").delete().eq("id", cat.id);
    load();
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
          ⚠ L&apos;assignation n&apos;a pas pu être enregistrée : {error}
        </p>
      )}

      <div>
        <h1 className="text-2xl font-bold">Responsabilités</h1>
        <p className="text-slate-400 text-sm">Glisse un joueur dans une case pour lui assigner une responsabilité.</p>
      </div>

      <section
        className="card space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (draggedId) reorderPriority(draggedId, null);
        }}
      >
        <h2 className="font-semibold">Ordre prioritaire</h2>
        <p className="text-xs text-slate-500">
          Glisse un joueur ici depuis la liste ci-dessous pour construire ton ordre (ex: priorité aux vétérans). Glisse
          pour réordonner ou re-déposer dans la liste des joueurs pour le retirer.
        </p>
        {priorityOrdered.length === 0 ? (
          <p className="text-xs text-slate-400">Aucun joueur priorisé. Dépose-en un ici.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {priorityOrdered.map((p) => (
              <div
                key={p.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const draggedId = e.dataTransfer.getData("text/plain");
                  if (draggedId) reorderPriority(draggedId, p.id);
                }}
              >
                <Chip player={p} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className="card space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          // Ramener un joueur dans la liste le libère de tout : de l'ordre
          // prioritaire comme de la case où il était assigné.
          if (draggedId) removeFromPriority(draggedId);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Liste des joueurs</h2>
          <button className="btn-secondary" onClick={shuffle}>
            🎲 Aléatoire
          </button>
        </div>
        <p className="text-xs text-slate-500">Glisse un joueur dans une case de responsabilité ci-dessous, ou vers l'ordre prioritaire.</p>
        {pooledIds.length === 0 ? (
          <p className="text-xs text-slate-400">Tous les joueurs sont priorisés ou assignés pour cette date.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pooledIds.map((id) => byId.get(id)).filter((p): p is Player => !!p).map((p) => (
              <Chip key={p.id} player={p} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Cases de responsabilités</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {categories.map((cat) => {
            const assigned = logRows.filter((l) => l.category === cat.name).map((l) => byId.get(l.player_id)).filter((p): p is Player => !!p);
            return (
              <div
                key={cat.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const playerId = e.dataTransfer.getData("text/plain");
                  if (playerId) assignToCategory(playerId, cat.name);
                }}
                className="card min-h-[140px] border-2 border-dashed border-slate-300 hover:border-gold-400 transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{cat.name}</h3>
                  <button onClick={() => removeCategory(cat)} className="text-xs text-red-600 hover:underline">
                    Retirer la case
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {assigned.length === 0 ? (
                    <span className="text-xs text-slate-400">Dépose un joueur ici</span>
                  ) : (
                    assigned.map((p) => (
                      // Déplaçable : c'est ainsi qu'on passe un joueur d'une
                      // responsabilité à l'autre. Le clic retire toujours.
                      <div key={p.id} onClick={() => assignToCategory(p.id, null)} title="Glisser pour déplacer · cliquer pour retirer" className="cursor-pointer">
                        <Chip player={p} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          <form onSubmit={addCategory} className="card min-h-[140px] border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2">
            <input
              className="input"
              placeholder="Nom de la responsabilité"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button type="submit" className="btn">
              + Ajouter une case
            </button>
          </form>
        </div>
      </section>

      {/* Sauvegarde + image à envoyer aux joueurs. */}
      <section className="card space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={saveAll} disabled={saving} className="btn">
            {saving ? "Enregistrement..." : "💾 Sauvegarder les responsabilités"}
          </button>
          {savedAt && (
            <>
              <span className="text-sm font-bold text-green-700">
                ✓ Enregistré à {format(savedAt, "HH:mm:ss")}
              </span>
              <button onClick={exportImage} disabled={exporting} className="btn-secondary">
                {exporting ? "Génération..." : "⬇ Télécharger l'image PNG"}
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Chaque dépôt est déjà enregistré au fil de l&apos;eau. Ce bouton confirme l&apos;ensemble et débloque
          l&apos;image à envoyer aux joueurs.
        </p>

      </section>

      {/* Le tableau à exporter est rendu hors de l'écran, à sa taille réelle :
          l'image produite ne dépend donc jamais de la place qu'on lui donne
          dans la page. Ce qui s'affiche ci-dessous, ce sont les PNG déjà
          enregistrés, réduits. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <ResponsibilitiesBoard ref={boardRef} date={logDate} categories={categories} playersFor={playersFor} />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Responsabilités enregistrées</h2>
        {boards.length === 0 ? (
          <p className="text-xs text-slate-400">
            Aucune image enregistrée. Sauvegarde les responsabilités pour en produire une.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => (
              <a
                key={b.log_date}
                href={b.image_url}
                target="_blank"
                rel="noreferrer"
                className="card space-y-2 hover:border-gold-400 transition-colors"
                title="Ouvrir l'image en pleine taille"
              >
                <div className="font-medium text-sm">{b.log_date}</div>
                {/* Réduite à l'écran, jamais à l'export : le fichier conserve
                    sa pleine résolution. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image_url} alt={`Responsabilités du ${b.log_date}`} className="w-full rounded-lg" />
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
