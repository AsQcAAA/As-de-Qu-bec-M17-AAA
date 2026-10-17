"use client";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { lastName } from "@/lib/players";
import type { Player } from "@/lib/types";

/** Image prête à publier : les joueurs envoyés à la Farandole ce vendredi-là. Exportée en PNG par la page et le pense-bête du mardi. */
export default function FarandoleExportPanel({
  day,
  players,
  panelRef,
}: {
  day: Date;
  players: Player[];
  panelRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={panelRef} className="w-[600px] bg-ink-900 p-8 space-y-5">
      <div className="text-center space-y-1">
        <div className="text-xs font-black uppercase tracking-widest text-gold-400">Farandole</div>
        <h2 className="text-2xl font-black capitalize text-white">{format(day, "EEEE d MMMM yyyy", { locale: fr })}</h2>
      </div>
      <div className="grid grid-cols-3 gap-4 justify-items-center pt-2">
        {players.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1.5 w-28">
            <div className="relative h-16 w-16 shrink-0">
              <div className="h-16 w-16 rounded-full bg-gold-500 text-ink-900 text-2xl font-black flex items-center justify-center border-2 border-gold-300 overflow-hidden">
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" />
                ) : (
                  p.jersey_number ?? "?"
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-ink-900 text-gold-400 text-xs font-black flex items-center justify-center border-2 border-gold-300">
                {p.jersey_number ?? "?"}
              </span>
            </div>
            <span className="text-sm font-bold text-white text-center leading-tight">{lastName(p.full_name)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
