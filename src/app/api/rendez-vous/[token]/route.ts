import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Réservation publique des rencontres bulletins. Chaque joueur a un lien
 * personnel (jeton aléatoire) : il ne voit que son nom et les créneaux libres,
 * jamais les noms des autres joueurs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function playerFor(token: string) {
  if (!UUID.test(token)) return null;
  const db = createServiceClient();
  const { data } = await db.from("bulletin_links").select("player_id, players(full_name)").eq("token", token).maybeSingle();
  if (!data) return null;
  const p = data.players as unknown as { full_name: string } | { full_name: string }[] | null;
  const name = Array.isArray(p) ? p[0]?.full_name : p?.full_name;
  return { db, playerId: data.player_id as string, name: name ?? "" };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await playerFor(token);
  if (!ctx) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const { data: slots } = await ctx.db
    .from("bulletin_slots")
    .select("id, slot_date, start_time, duration_min, location, player_id")
    .or(`player_id.is.null,player_id.eq.${ctx.playerId}`)
    .order("slot_date")
    .order("start_time");
  const mine = (slots ?? []).find((s) => s.player_id === ctx.playerId) ?? null;
  const available = (slots ?? []).filter((s) => s.player_id === null).map(({ player_id: _p, ...s }) => s);
  return NextResponse.json({
    name: ctx.name,
    mine: mine ? { id: mine.id, slot_date: mine.slot_date, start_time: mine.start_time, duration_min: mine.duration_min, location: mine.location } : null,
    available,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await playerFor(token);
  if (!ctx) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const { slotId } = (await req.json().catch(() => ({}))) as { slotId?: string };
  if (!slotId || !UUID.test(slotId)) return NextResponse.json({ error: "Créneau invalide." }, { status: 400 });

  // Libère l'ancien créneau (un seul par joueur), puis réserve seulement si le nouveau est encore libre.
  const { data: previous } = await ctx.db.from("bulletin_slots").select("id").eq("player_id", ctx.playerId).maybeSingle();
  if (previous?.id === slotId) return NextResponse.json({ ok: true });
  if (previous) await ctx.db.from("bulletin_slots").update({ player_id: null, booked_at: null }).eq("id", previous.id);
  const { data: taken } = await ctx.db
    .from("bulletin_slots")
    .update({ player_id: ctx.playerId, booked_at: new Date().toISOString() })
    .eq("id", slotId)
    .is("player_id", null)
    .select("id");
  if (!taken || taken.length === 0) {
    // Créneau pris entre-temps : on redonne son ancien créneau au joueur si possible.
    if (previous) await ctx.db.from("bulletin_slots").update({ player_id: ctx.playerId, booked_at: new Date().toISOString() }).eq("id", previous.id).is("player_id", null);
    return NextResponse.json({ error: "Ce créneau vient d'être pris. Choisis-en un autre." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await playerFor(token);
  if (!ctx) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  await ctx.db.from("bulletin_slots").update({ player_id: null, booked_at: null }).eq("player_id", ctx.playerId);
  return NextResponse.json({ ok: true });
}
