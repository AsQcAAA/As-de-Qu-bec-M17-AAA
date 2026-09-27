import { NextRequest, NextResponse } from "next/server";
import { parseTpeReportPdf } from "@/lib/tpeReportParser";

/**
 * Lecture automatique du rapport de statistiques avancées TPE
 * (portal.tpeteam.com), téléversé en PDF après chaque match.
 *
 * Ce n'est pas un formulaire comme la feuille de match officielle : c'est une
 * mise en page libre. Mais le PDF reste du texte véritable (pas un scan), donc
 * on peut le lire directement en reconstituant les tableaux à partir de la
 * position de chaque fragment de texte — voir src/lib/tpeReportParser.ts —
 * sans passer par une IA ni une clé API. Rien n'est appliqué directement :
 * l'interface affiche la lecture pour relecture avant tout enregistrement.
 */
export async function POST(req: NextRequest) {
  const { fileUrl } = await req.json();
  if (typeof fileUrl !== "string" || !fileUrl) {
    return NextResponse.json({ error: "fileUrl manquant." }, { status: 400 });
  }

  const res = await fetch(fileUrl);
  if (!res.ok) {
    return NextResponse.json({ error: "Fichier introuvable dans le stockage." }, { status: 400 });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  try {
    const parsed = await parseTpeReportPdf(bytes);
    return NextResponse.json(parsed);
  } catch (error) {
    // Consigné côté serveur (terminal `npm run dev`) : le message générique
    // renvoyé au navigateur ne suffit pas à diagnostiquer une vraie panne du
    // lecteur PDF (à distinguer d'un fichier qui n'est simplement pas le bon).
    console.error("[advanced-stats/extract]", error);
    return NextResponse.json(
      { error: "Lecture impossible — le fichier n'est peut-être pas un rapport TPE valide (PDF texte attendu, pas une image scannée)." },
      { status: 422 }
    );
  }
}
