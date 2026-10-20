import { NextRequest, NextResponse } from "next/server";
import { parseTournamentPdf } from "@/lib/tournoiPdf";

/**
 * Lecture du PDF du tournoi (pointages). Rien n'est enregistré ici : l'interface montre
 * les pointages lus avant de les appliquer au tableau.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  try {
    const games = await parseTournamentPdf(new Uint8Array(await file.arrayBuffer()));
    if (games.length === 0) {
      return NextResponse.json({ error: "Aucun match lu — est-ce bien le PDF du tournoi ?" }, { status: 422 });
    }
    return NextResponse.json({ games });
  } catch (error) {
    console.error("[tournoi/extract]", error);
    return NextResponse.json({ error: "Lecture impossible — PDF texte attendu." }, { status: 422 });
  }
}
