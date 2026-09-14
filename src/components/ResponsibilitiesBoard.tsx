"use client";

import { forwardRef } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { Player, ResponsibilityCategory } from "@/lib/types";

/**
 * Tableau des responsabilités destiné à être exporté en image et envoyé aux
 * joueurs.
 *
 * Contrairement à l'écran de travail, il ne montre que ce qui est assigné :
 * une case vide n'apprend rien au joueur qui reçoit l'image, et les cases
 * pleines doivent respirer. Photo, numéro et nom au complet, pour qu'un joueur
 * se reconnaisse d'un coup d'œil dans une conversation de groupe.
 */
const ResponsibilitiesBoard = forwardRef<
  HTMLDivElement,
  {
    date: string;
    categories: ResponsibilityCategory[];
    playersFor: (categoryName: string) => Player[];
  }
>(function ResponsibilitiesBoard({ date, categories, playersFor }, ref) {
  const filled = categories.filter((c) => playersFor(c.name).length > 0);

  return (
    <div ref={ref} className="bg-ink-900 text-white p-10 w-[900px]">
      <div className="border-b border-gold-500/40 pb-5 mb-6">
        <div className="text-3xl font-black">Responsabilités</div>
        <div className="mt-1 text-lg capitalize text-slate-300">
          {format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}
        </div>
        <div className="mt-2 text-gold-400 font-bold text-lg">As de Québec M17 AAA</div>
      </div>

      {filled.length === 0 ? (
        <p className="text-slate-400 text-lg">Aucune responsabilité assignée.</p>
      ) : (
        <div className="space-y-5">
          {filled.map((cat) => (
            <div key={cat.id}>
              <div className="text-gold-400 font-black uppercase tracking-wide text-lg mb-2">{cat.name}</div>
              <div className="flex flex-wrap gap-3">
                {playersFor(cat.name).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl bg-white/[0.07] border border-white/10 px-3 py-2"
                  >
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.photo_url}
                        alt={p.full_name}
                        className="h-12 w-12 rounded-full border-2 border-gold-400/60 object-cover"
                      />
                    ) : (
                      <span className="h-12 w-12 rounded-full bg-gold-500 text-ink-900 text-lg font-black flex items-center justify-center">
                        {p.jersey_number ?? "?"}
                      </span>
                    )}
                    <span>
                      <span className="block text-xl font-black leading-none">#{p.jersey_number ?? "–"}</span>
                      <span className="block text-base text-slate-200">{p.full_name}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default ResponsibilitiesBoard;
