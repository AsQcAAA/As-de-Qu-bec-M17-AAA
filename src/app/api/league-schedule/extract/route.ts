import { NextRequest, NextResponse } from "next/server";
import { computeRecords, parseLeagueSchedulePdf } from "@/lib/leagueSchedule";

/**
 * Lecture du calendrier M17 AAA de la LHEQ (PDF) — mise à jour hebdomadaire
 * des fiches du Pre-Scout. Aucune IA : le PDF est du texte positionné.
 * Rien n'est enregistré ici : l'interface montre le résultat avant d'appliquer.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  try {
    const games = await parseLeagueSchedulePdf(new Uint8Array(await file.arrayBuffer()));
    if (games.length === 0) {
      return NextResponse.json({ error: "Aucun match lu — est-ce bien le calendrier M17 AAA de la LHEQ (PDF) ?" }, { status: 422 });
    }
    const played = games.filter((g) => g.homeScore != null).length;
    return NextResponse.json({ games: games.length, played, records: computeRecords(games), allGames: games });
  } catch (error) {
    console.error("[league-schedule/extract]", error);
    return NextResponse.json({ error: "Lecture impossible — PDF texte attendu." }, { status: 422 });
  }
}
