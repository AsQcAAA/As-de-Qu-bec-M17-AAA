import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createServiceClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";

/** Avertit Jean par courriel d'une réservation ou d'une annulation. Un échec d'envoi ne bloque jamais la famille. */
async function notifyCoach(kind: "booked" | "cancelled", playerName: string, slot: { slot_date: string; start_time: string; location: string | null } | null) {
  try {
    const to = process.env.COACH_EMAIL;
    if (!process.env.RESEND_API_KEY || !to || !slot) return;
    const when = `${format(parseISO(slot.slot_date), "EEEE d MMMM", { locale: fr })} à ${slot.start_time.slice(0, 5).replace(":", "h")}`;
    const verb = kind === "booked" ? "réservée" : "annulée";
    const text = `Rencontre bulletin ${verb} : ${playerName}\n\n${when}${slot.location ? ` · ${slot.location}` : ""}\n\n${kind === "booked" ? "L'évènement a été ajouté à votre calendrier." : "L'évènement a été retiré de votre calendrier et le créneau est de nouveau libre."}`;
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Rencontres bulletins <${to}>`,
      to,
      subject: `Rencontre bulletin ${verb} — ${playerName} — ${when}`,
      html: buildEmailHtml(text),
      text: buildEmailText(text),
      attachments: [{ filename: "signature.png", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID }],
    });
  } catch (e) {
    console.error("[rendez-vous] notification échouée", e);
  }
}

/**
 * Réservation publique des rencontres bulletins. Chaque joueur a un lien
 * personnel (jeton aléatoire) : il ne voit que son nom et les créneaux libres,
 * jamais les noms des autres joueurs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function playerFor(token: string) {
  if (!UUID.test(token)) return null;
  const db = createServiceClient();
  const { data } = await db.from("bulletin_links").select("player_id, players(full_name, position)").eq("token", token).maybeSingle();
  if (!data) return null;
  const raw = data.players as unknown as { full_name: string; position: string } | { full_name: string; position: string }[] | null;
  const p = Array.isArray(raw) ? raw[0] : raw;
  // Les gardiens ont leurs propres plages ; les patineurs ne voient pas celles des gardiens.
  const audiences = p?.position === "G" ? ["all", "goalies"] : ["all", "skaters"];
  return { db, playerId: data.player_id as string, name: p?.full_name ?? "", audiences };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await playerFor(token);
  if (!ctx) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const { data: slots } = await ctx.db
    .from("bulletin_slots")
    .select("id, slot_date, start_time, duration_min, location, player_id")
    .or(`player_id.is.null,player_id.eq.${ctx.playerId}`)
    .in("audience", ctx.audiences)
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
    .in("audience", ctx.audiences)
    .is("player_id", null)
    .select("id");
  if (taken && taken.length > 0) {
    const { data: slot } = await ctx.db.from("bulletin_slots").select("slot_date, start_time, location").eq("id", slotId).maybeSingle();
    await notifyCoach("booked", ctx.name, slot);
  }
  if (!taken || taken.length === 0) {
    // Créneau pris entre-temps : on redonne son ancien créneau au joueur si possible.
    if (previous) await ctx.db.from("bulletin_slots").update({ player_id: ctx.playerId, booked_at: new Date().toISOString() }).eq("id", previous.id).is("player_id", null);
    return NextResponse.json({ error: "Ce créneau vient d'être pris. Veuillez en choisir un autre." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await playerFor(token);
  if (!ctx) return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  const { data: mine } = await ctx.db.from("bulletin_slots").select("slot_date, start_time, location").eq("player_id", ctx.playerId).maybeSingle();
  await ctx.db.from("bulletin_slots").update({ player_id: null, booked_at: null }).eq("player_id", ctx.playerId);
  if (mine) await notifyCoach("cancelled", ctx.name, mine);
  return NextResponse.json({ ok: true });
}
