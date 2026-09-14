import type { Player } from "@/lib/types";
import { lastName } from "@/lib/players";
import type { JerseySkin } from "./JerseySlot";

const JERSEY_CLIP =
  "polygon(20% 0%, 80% 0%, 80% 8%, 100% 8%, 100% 32%, 82% 24%, 82% 100%, 18% 100%, 18% 24%, 0% 32%, 0% 8%, 20% 8%)";

// Mêmes habillages que JerseySlot : la vue en lecture seule doit être
// indiscernable de l'écran de construction, photos comprises.
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
const SKIN_NUMBER: Record<JerseySkin, string> = {
  gris: "text-white",
  jaune: "text-ink-900",
  local: "text-ink-900",
  visiteur: "text-ink-900",
};

/**
 * Version lecture seule de JerseySlot — aucun menu, aucun bouton, mais le même
 * rendu : photo du joueur, dégradé, ombre portée, étoile de partant et
 * mention de position quand le joueur est utilisé hors de sa position.
 */
export default function JerseyDisplay({
  player,
  color = "gold",
  ring = null,
  starting = false,
  expectedPosition,
  size = "normal",
  statusLabel,
}: {
  player: Player | null;
  color?: "gold" | "gris";
  ring?: JerseySkin | null;
  starting?: boolean;
  expectedPosition?: "F" | "D" | "G";
  /** « sm » : version réduite, pour les affichages où la place manque (télé). */
  size?: "normal" | "sm";
  /** Mention posée sur le chandail — « sans contact » et compagnie. */
  statusLabel?: string;
}) {
  const fill = ring ? SKIN_FILL[ring] : "bg-gradient-to-b from-white to-slate-200";
  const stripe = ring ? SKIN_STRIPE[ring] : color === "gold" ? "bg-gold-600" : "bg-slate-600";
  const numberColor = ring ? SKIN_NUMBER[ring] : "text-ink-900";
  const outOfPosition = Boolean(player && expectedPosition && player.position !== expectedPosition);

  const small = size === "sm";

  return (
    <div className={`flex flex-col items-center ${small ? "gap-0.5 w-16" : "gap-1.5 w-28"}`}>
      <span
        className={`font-black uppercase tracking-wide text-center truncate w-full drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${
          small ? "text-[8px] min-h-[0.7rem]" : "text-xs min-h-[1rem]"
        } ${
          player ? "text-white" : "text-white/25"
        }`}
      >
        {player ? lastName(player.full_name) : "libre"}
      </span>

      <div className={`relative w-full ${small ? "h-16" : "h-28"} ${player ? "" : "opacity-60"}`}>
        <div
          style={{ clipPath: JERSEY_CLIP }}
          className="absolute inset-0 translate-y-1 bg-black/50 blur-[2px]"
          aria-hidden
        />
        <div style={{ clipPath: JERSEY_CLIP }} className={`absolute inset-0 ${player ? fill : "bg-white/25"}`}>
          {player && <div className={`absolute bottom-0 inset-x-0 h-[16%] ${stripe}`} />}
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent" aria-hidden />
        </div>
        <div className="absolute inset-0 flex items-center justify-center pb-2">
          <span
            className={`font-black tabular-nums ${small ? "text-xl" : "text-4xl"} ${
              player ? numberColor : "text-white/40"
            } [text-shadow:0_1px_0_rgba(255,255,255,0.35)]`}
          >
            {player?.jersey_number ?? "-"}
          </span>
        </div>

        {player?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.photo_url}
            alt={player.full_name}
            className={`pointer-events-none absolute -left-1 -top-1 rounded-full border-2 border-white object-cover shadow-md ${
              small ? "h-5 w-5" : "h-9 w-9"
            }`}
          />
        )}

        {/* Un joueur signalé reste dans l'alignement : la mention se pose sur
            son chandail plutôt que de le retirer de la grille. */}
        {player && statusLabel && (
          <span
            className={`pointer-events-none absolute inset-x-0 bg-amber-500/90 text-ink-900 font-black uppercase tracking-wide text-center ${
              small ? "bottom-3 text-[7px] py-px" : "bottom-6 text-[9px] py-0.5"
            }`}
          >
            {statusLabel}
          </span>
        )}

        {player && starting && (
          <span
            title="Partant"
            className="absolute -right-1 -top-1 h-6 w-6 rounded-full border-2 border-gold-200 bg-gold-400 text-ink-900 text-[11px] font-black leading-none flex items-center justify-center shadow-[0_0_10px_rgba(253,202,55,0.7)]"
          >
            ★
          </span>
        )}

        {/* Joueur affilié (remplaçant) inscrit dans l'alignement. */}
        {player?.is_call_up && (
          <span
            title="Joueur affilié (remplaçant)"
            className="pointer-events-none absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-gold-400 bg-ink-900 text-gold-400 text-[10px] font-black leading-none flex items-center justify-center shadow"
          >
            A
          </span>
        )}

        {outOfPosition && player && (
          <span className="pointer-events-none absolute -bottom-1 -left-1 rounded-full border border-ink-900 bg-sky-500 px-1.5 text-[10px] font-black leading-4 text-white shadow">
            {player.position}
          </span>
        )}

        {player && (ring === "gris" || ring === "jaune") && !starting && (
          <span
            className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-ink-900 ${
              ring === "gris" ? "bg-slate-400" : "bg-gold-400"
            }`}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
