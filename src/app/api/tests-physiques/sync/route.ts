import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncTestsFromSheet } from "@/lib/testsSheetSync";

export const maxDuration = 60;

/**
 * Synchronise les tests physiques depuis le fichier Google Drive partagé.
 *  - GET  : appelé chaque jour par Vercel Cron (protégé par CRON_SECRET).
 *  - POST : bouton « Synchroniser » de l'onglet Tests physiques (entraîneur connecté).
 * On n'ajoute que les résultats absents : rien de ce qui est déjà dans l'app n'est écrasé.
 */
async function run() {
  try {
    const summary = await syncTestsFromSheet(createServiceClient());
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[tests-physiques/sync]", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Synchronisation impossible." }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  return run();
}
