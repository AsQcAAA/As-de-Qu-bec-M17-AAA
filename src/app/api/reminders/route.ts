import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { computeMeetingStatuses } from "@/lib/meetings";
import type { Meeting, Player } from "@/lib/types";

// Called weekly by Vercel Cron (see vercel.json). Checks which active
// players have gone 3+ weeks without an individual meeting and emails the
// coach a summary. Protected by CRON_SECRET so it can't be triggered by
// random requests to a public URL.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const [{ data: players }, { data: meetings }] = await Promise.all([
    supabase.from("players").select("*").eq("active", true).eq("is_call_up", false),
    supabase.from("meetings").select("*"),
  ]);

  const statuses = computeMeetingStatuses((players ?? []) as Player[], (meetings ?? []) as Meeting[]);
  const overdue = statuses.filter((s) => s.overdue);

  if (overdue.length === 0) {
    return NextResponse.json({ ok: true, overdueCount: 0, emailSent: false });
  }

  if (!process.env.RESEND_API_KEY || !process.env.COACH_EMAIL) {
    return NextResponse.json(
      { ok: true, overdueCount: overdue.length, emailSent: false, reason: "RESEND_API_KEY or COACH_EMAIL missing" },
      { status: 200 }
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const listHtml = overdue
    .map(
      (s) =>
        `<li><strong>${s.player.full_name}</strong> — ${
          s.daysSince === null ? "aucune rencontre enregistrée" : `${s.daysSince} jours depuis la dernière rencontre`
        }</li>`
    )
    .join("");

  await resend.emails.send({
    from: process.env.REMINDER_FROM_EMAIL || "rappels@resend.dev",
    to: process.env.COACH_EMAIL,
    subject: `⏰ ${overdue.length} joueur(s) sans rencontre individuelle depuis 3+ semaines`,
    html: `
      <p>Bonjour,</p>
      <p>Les joueurs suivants n'ont pas eu de rencontre individuelle depuis au moins 3 semaines :</p>
      <ul>${listHtml}</ul>
      <p>— App As de Québec M17 AAA</p>
    `,
  });

  return NextResponse.json({ ok: true, overdueCount: overdue.length, emailSent: true });
}
