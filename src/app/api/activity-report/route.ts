import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { MEDALS, fmtNum, monthBounds, monthLabel, rankBy, shiftMonth, totalsByCoach, type ActivityRow, type CoachTotal } from "@/lib/activity";

/**
 * Rapport mensuel d'activité (clics et caractères ajoutés) — appelé par Vercel Cron le 1er
 * de chaque mois à 12 h UTC, pour le mois qui vient de finir. Protégé par CRON_SECRET.
 * Essai ou renvoi : /api/activity-report?month=2026-11 (envoie à COACH_EMAIL seulement).
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const to = process.env.COACH_EMAIL;
  if (!process.env.RESEND_API_KEY || !to) {
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY ou COACH_EMAIL manquant" }, { status: 500 });
  }

  const thisMonth = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Toronto" }).slice(0, 7);
  const requested = new URL(req.url).searchParams.get("month");
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : shiftMonth(thisMonth, -1);
  const { from, to: until } = monthBounds(month);

  const supabase = createServiceClient();
  const [{ data: coaches }, { data: rows, error }] = await Promise.all([
    supabase.from("coach_profiles").select("id, full_name"),
    supabase.from("activity_daily").select("user_id, day, clicks, chars").gte("day", from).lt("day", until),
  ]);
  if (error) return NextResponse.json({ sent: false, reason: error.message }, { status: 500 });

  const totals = totalsByCoach((rows ?? []) as ActivityRow[], coaches ?? []);
  const label = monthLabel(month);

  const podium = (title: string, unit: string, key: "clicks" | "chars") =>
    `<h3 style="margin:18px 0 6px;">${title}</h3><ol style="margin:0;padding-left:0;list-style:none;">${rankBy(totals, key)
      .slice(0, 3)
      .map((c: CoachTotal, i) => `<li style="margin:4px 0;">${MEDALS[i]} <strong>${c.name}</strong> — ${fmtNum(c[key])} ${unit}</li>`)
      .join("")}</ol>`;

  const table = `<table style="border-collapse:collapse;margin-top:8px;font-size:14px;">
    <tr style="text-align:left;border-bottom:1px solid #ccc;"><th style="padding:4px 14px 4px 0;">Coach</th><th style="padding:4px 14px;text-align:right;">Caractères</th><th style="padding:4px 14px;text-align:right;">Clics</th><th style="padding:4px 0 4px 14px;text-align:right;">Jours actifs</th></tr>
    ${rankBy(totals, "chars")
      .map(
        (c) =>
          `<tr><td style="padding:4px 14px 4px 0;">${c.name}</td><td style="padding:4px 14px;text-align:right;">${fmtNum(c.chars)}</td><td style="padding:4px 14px;text-align:right;">${fmtNum(c.clicks)}</td><td style="padding:4px 0 4px 14px;text-align:right;">${c.activeDays}</td></tr>`
      )
      .join("")}
  </table>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">
    <p>Bonjour,</p>
    <p>Voici le classement d'activité des coachs sur le site pour <strong>${label}</strong>.</p>
    ${podium("🏆 Contributions — caractères ajoutés", "caractères", "chars")}
    ${podium("🖱️ Actions — clics sur le site", "clics", "clicks")}
    <h3 style="margin:18px 0 6px;">Détail du mois</h3>
    ${table}
    <p style="color:#666;font-size:13px;margin-top:18px;">Seuls des compteurs sont conservés (jamais le contenu écrit). — App As de Québec M17 AAA</p>
  </div>`;

  await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: `App As de Québec M17 <${to}>`,
    to,
    subject: `📊 Rapport mensuel d'activité — ${label}`,
    html,
  });
  return NextResponse.json({ sent: true, month, totals });
}
