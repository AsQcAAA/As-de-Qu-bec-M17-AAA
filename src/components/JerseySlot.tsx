"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import type { Player } from "@/lib/types";
import { lastName } from "@/lib/players";

// Valeur sentinelle du menu déroulant : ouvre la fenêtre de choix d'un
// remplaçant plutôt que d'assigner directement un joueur.
const CALL_UP_SENTINEL = "__remplacant__";

const POSITION_LABEL: Record<"F" | "D" | "G", string> = {
  F: "Attaquants",
  D: "Défenseurs",
  G: "Gardiens",
};
const POSITION_ORDER: ("F" | "D" | "G")[] = ["F", "D", "G"];

// Silhouette de chandail boxy (épaules + manches carrées, bande au bas) —
// inspirée de la maquette Canva du coach : chandail blanc, nom au-dessus,
// numéro géant à l'intérieur.
const JERSEY_CLIP =
  "polygon(20% 0%, 80% 0%, 80% 8%, 100% 8%, 100% 32%, 82% 24%, 82% 100%, 18% 100%, 18% 24%, 0% 32%, 0% 8%, 20% 8%)";

/**
 * Habillage du chandail.
 *  - "gris" / "jaune" : groupes de pratique (deux camps qui s'opposent).
 *  - "local" / "visiteur" : uniforme réel du match — gris+or à domicile,
 *    blanc+or à l'étranger. Ce n'est pas un choix par joueur : toute l'équipe
 *    porte le même, d'où l'absence de bouton pour en changer.
 */
export type JerseySkin = "gris" | "jaune" | "local" | "visiteur";

const SKIN_FILL: Record<JerseySkin, string> = {
  gris: "bg-gradient-to-b from-slate-300 to-slate-500",
  jaune: "bg-gradient-to-b from-gold-300 to-gold-600",
  local: "bg-gradient-to-b from-slate-300 via-slate-400 to-gold-500",
  visiteur: "bg-gradient-to-b from-white via-slate-50 to-gold-400",
};
const SKIN_STRIPE: Record<JerseySkin, string> = {
  gris: "bg-slate-700",
  jaune: "bg-gold-800",
  local: "bg-gold-700",
  visiteur: "bg-gold-600",
};
// Le gris foncé est le seul habillage assez sombre pour exiger un numéro blanc.
const SKIN_NUMBER: Record<JerseySkin, string> = {
  gris: "text-white",
  jaune: "text-ink-900",
  local: "text-ink-900",
  visiteur: "text-ink-900",
};

export default function JerseySlot({
  value,
  onChange,
  options,
  color = "gold",
  ring = null,
  onRingClick,
  starting = false,
  onStartingClick,
  callUpOptions = [],
  onDragStartSlot,
  onDragEndSlot,
  onDropSlot,
  dropState = "idle",
  expectedPosition,
  absentLabels = {},
  presentStatusIds,
}: {
  value: string;
  onChange: (playerId: string) => void;
  options: Player[];
  color?: "gold" | "gris";
  /** Remplaçants disponibles — proposés via l'option « Remplaçant » du menu. */
  callUpOptions?: Player[];
  /** Habillage du chandail — groupe de pratique ou uniforme de match. */
  ring?: JerseySkin | null;
  /** Clic sur le chandail : fait cycler le groupe de pratique. */
  onRingClick?: () => void;
  /** Le joueur fait partie du cinq partant. */
  starting?: boolean;
  /** Bouton « partant » — absent si non fourni. */
  onStartingClick?: () => void;
  /** Glisser-déposer : déplacer un joueur déjà placé vers une autre case. */
  onDragStartSlot?: () => void;
  onDragEndSlot?: () => void;
  onDropSlot?: () => void;
  /**
   * "idle"    : rien en cours.
   * "source"  : c'est cette case qu'on déplace.
   * "target"  : case pouvant recevoir le joueur déplacé.
   * "blocked" : glissement en cours, mais cette case n'est pas compatible.
   */
  dropState?: "idle" | "source" | "target" | "blocked";
  /** Position attendue dans ce panneau — sert à signaler un joueur hors position. */
  expectedPosition?: "F" | "D" | "G";
  /** Joueurs déclarés blessés ou suspendus ce jour-là : id → « Blessé »/« Suspendu ». */
  absentLabels?: Record<string, string>;
  /** Joueurs signalés mais PRÉSENTS (sans contact) : bandeau ambre, pas rouge. */
  presentStatusIds?: Set<string>;
}) {
  const [pickingCallUp, setPickingCallUp] = useState(false);
  // Le joueur affiché peut venir de l'effectif régulier ou de la liste des
  // remplaçants — les deux doivent pouvoir s'afficher dans le chandail.
  const selected = [...options, ...callUpOptions].find((p) => p.id === value) ?? null;
  const fill = ring ? SKIN_FILL[ring] : "bg-gradient-to-b from-white to-slate-200";
  const stripe = ring ? SKIN_STRIPE[ring] : color === "gold" ? "bg-gold-600" : "bg-slate-600";
  const numberColor = ring ? SKIN_NUMBER[ring] : "text-ink-900";
  const clickable = Boolean(onRingClick && selected);
  const sortedOptions = [...options].sort((a, b) => lastName(a.full_name).localeCompare(lastName(b.full_name)));
  // Le menu n'affiche « Remplaçant » que si le joueur retenu vient bien de la
  // liste des remplaçants proposés ici. Delarosbil, par exemple, est un rappel
  // mais figure dans l'effectif régulier des pratiques : il doit s'afficher
  // sous son propre nom, pas sous l'étiquette « Remplaçant ».
  const selectedIsCallUpOption = selected ? callUpOptions.some((p) => p.id === selected.id) : false;
  // Joueur utilisé hors de sa position naturelle (un défenseur à l'attaque, par
  // exemple) : c'est permis, mais ça doit se voir d'un coup d'œil.
  const outOfPosition = Boolean(selected && expectedPosition && selected.position !== expectedPosition);

  return (
    <div className="group/slot flex flex-col items-center gap-1.5 w-28">
      <span
        className={`text-xs font-black uppercase tracking-wide text-center truncate w-full min-h-[1rem] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${
          selected ? "text-white" : "text-white/25"
        }`}
      >
        {selected ? lastName(selected.full_name) : "libre"}
      </span>

      <div
        draggable={Boolean(selected && onDragStartSlot)}
        onDragStart={(e) => {
          if (!selected || !onDragStartSlot) return;
          // Une charge utile est obligatoire pour que Firefox démarre le glissement.
          e.dataTransfer.setData("text/plain", value);
          e.dataTransfer.effectAllowed = "move";
          onDragStartSlot();
        }}
        onDragEnd={onDragEndSlot}
        onDragOver={(e) => {
          if (dropState === "target" || dropState === "source") {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(e) => {
          if (dropState === "target") {
            e.preventDefault();
            onDropSlot?.();
          }
        }}
        className={`relative h-28 w-full transition-all duration-150 rounded-md ${
          clickable ? "hover:-translate-y-1" : ""
        } ${selected ? "" : "opacity-60"} ${selected && onDragStartSlot ? "cursor-grab active:cursor-grabbing" : ""} ${
          dropState === "source"
            ? "opacity-40 scale-95"
            : dropState === "target"
              ? "ring-2 ring-gold-400 ring-offset-2 ring-offset-black/60"
              : dropState === "blocked"
                ? "opacity-30"
                : ""
        }`}
      >
        {/* Le chandail lui-même est la zone cliquable du groupe ; la photo et le
            bouton « partant » sont posés par-dessus avec leur propre gestion. */}
        <div
          onClick={clickable ? onRingClick : undefined}
          title={clickable ? "Cliquer pour changer de groupe (gris → jaune → neutre)" : undefined}
          className={`absolute inset-0 ${clickable ? "cursor-pointer" : ""}`}
        >
          {/* Ombre portée sous le chandail — impossible avec un clip-path seul. */}
          <div
            style={{ clipPath: JERSEY_CLIP }}
            className="absolute inset-0 translate-y-1 bg-black/50 blur-[2px]"
            aria-hidden
          />
          <div
            style={{ clipPath: JERSEY_CLIP }}
            className={`absolute inset-0 transition-colors ${selected ? fill : "bg-white/25"}`}
          >
            {selected && <div className={`absolute bottom-0 inset-x-0 h-[16%] ${stripe}`} />}
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent" aria-hidden />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pb-2">
            <span
              className={`text-4xl font-black tabular-nums ${
                selected ? numberColor : "text-white/40"
              } [text-shadow:0_1px_0_rgba(255,255,255,0.35)]`}
            >
              {selected?.jersey_number ?? "?"}
            </span>
          </div>
        </div>

        {/* Visage du joueur, en haut à gauche du chandail. */}
        {selected?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selected.photo_url}
            alt={selected.full_name}
            className="pointer-events-none absolute -left-1 -top-1 h-9 w-9 rounded-full border-2 border-white object-cover shadow-md"
          />
        )}

        {/* Bouton « partant » — jours de match seulement. */}
        {selected && onStartingClick && (
          <button
            type="button"
            onClick={onStartingClick}
            aria-pressed={starting}
            title={starting ? "Retirer du cinq partant" : "Faire débuter le match"}
            className={`absolute -right-1 -top-1 h-6 w-6 rounded-full border-2 text-[11px] font-black leading-none flex items-center justify-center transition-colors ${
              starting
                ? "bg-gold-400 border-gold-200 text-ink-900 shadow-[0_0_10px_rgba(253,202,55,0.7)]"
                : "bg-ink-900/85 border-white/40 text-white/60 hover:bg-gold-500 hover:text-ink-900 hover:border-gold-300"
            }`}
          >
            ★
          </button>
        )}

        {/* Joueur déclaré blessé ou suspendu ce jour-là : il ne devrait pas être
            dans l'alignement, mais on le signale plutôt que de l'interdire —
            c'est au coach de trancher. */}
        {selected && absentLabels[selected.id] && (
          <span
            className={`pointer-events-none absolute inset-x-0 bottom-6 text-[9px] font-black uppercase tracking-wide text-center py-0.5 ${
              presentStatusIds?.has(selected.id) ? "bg-amber-500/90 text-ink-900" : "bg-red-600/90 text-white"
            }`}
          >
            {absentLabels[selected.id]}
          </span>
        )}

        {/* Joueur affilié (remplaçant) inscrit dans l'alignement. */}
        {selected?.is_call_up && (
          <span
            title="Joueur affilié (remplaçant)"
            className="pointer-events-none absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-gold-400 bg-ink-900 text-gold-400 text-[10px] font-black leading-none flex items-center justify-center shadow"
          >
            A
          </span>
        )}

        {/* Joueur hors de sa position naturelle — ex. un défenseur à l'attaque. */}
        {outOfPosition && selected && (
          <span
            title={`${selected.full_name} est ${selected.position === "D" ? "défenseur" : selected.position === "F" ? "attaquant" : "gardien"}`}
            className="pointer-events-none absolute -bottom-1 -left-1 rounded-full border border-ink-900 bg-sky-500 px-1.5 text-[10px] font-black leading-4 text-white shadow"
          >
            {selected.position}
          </span>
        )}

        {/* Pastille de groupe de pratique. */}
        {selected && (ring === "gris" || ring === "jaune") && !onStartingClick && (
          <span
            className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-ink-900 ${
              ring === "gris" ? "bg-slate-400" : "bg-gold-400"
            }`}
            aria-hidden
          />
        )}
      </div>

      <select
        className="input text-xs px-1 py-1 w-full"
        value={selectedIsCallUpOption ? CALL_UP_SENTINEL : value}
        onChange={(e) => {
          if (e.target.value === CALL_UP_SENTINEL) setPickingCallUp(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">— Vide —</option>
        {/* Les joueurs de la position attendue viennent en premier ; les autres
            restent accessibles plus bas, pour un défenseur envoyé à l'attaque. */}
        {POSITION_ORDER.slice()
          .sort((a, b) => (a === expectedPosition ? -1 : b === expectedPosition ? 1 : 0))
          .filter((pos) => sortedOptions.some((p) => p.position === pos))
          .map((pos) => {
          const group = sortedOptions.filter((p) => p.position === pos);
          return (
            <optgroup key={pos} label={POSITION_LABEL[pos]}>
              {group.map((p) => (
                <option key={p.id} value={p.id}>
                  {lastName(p.full_name)}
                  {p.jersey_number ? ` #${p.jersey_number}` : ""}
                  {absentLabels[p.id] ? ` — ${absentLabels[p.id]}` : ""}
                </option>
              ))}
            </optgroup>
          );
        })}
        {callUpOptions.length > 0 && (
          <option value={CALL_UP_SENTINEL}>
            {selectedIsCallUpOption ? `Remplaçant : ${lastName(selected!.full_name)}` : "— Remplaçant… —"}
          </option>
        )}
      </select>

      {pickingCallUp && (
        <Modal onClose={() => setPickingCallUp(false)}>
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">Choisir un remplaçant</h2>
              <p className="text-sm text-slate-400">Sélectionne le joueur qui comblera cette place.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {callUpOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setPickingCallUp(false);
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    p.id === value
                      ? "border-gold-400 bg-gold-500/15"
                      : "border-white/15 bg-white/5 hover:border-gold-400/60 hover:bg-white/10"
                  }`}
                >
                  <span className="h-8 w-8 shrink-0 rounded-full bg-ink-900 text-gold-400 text-sm font-black flex items-center justify-center">
                    {p.jersey_number ?? "–"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white truncate">{p.full_name}</span>
                    <span className="block text-[11px] text-slate-400">
                      {p.position === "G" ? "Gardien" : p.position === "D" ? "Défenseur" : "Attaquant"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {selectedIsCallUpOption && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onChange("");
                    setPickingCallUp(false);
                  }}
                >
                  Retirer le remplaçant
                </button>
              )}
              <button type="button" className="btn-dark" onClick={() => setPickingCallUp(false)}>
                Annuler
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
