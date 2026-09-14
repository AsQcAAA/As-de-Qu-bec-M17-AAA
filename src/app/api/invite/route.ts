import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CoachRole } from "@/lib/types";

// Only a head_coach can invite new users. Uses the service-role key
// server-side only (never exposed to the browser) to send a Supabase invite
// email; the invited person sets their own password via
// /definir-mot-de-passe.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("coach_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "head_coach") {
    return NextResponse.json({ error: "Seul un entraîneur-chef peut inviter." }, { status: 403 });
  }

  const { email, full_name, role } = (await req.json()) as {
    email: string;
    full_name: string;
    role: CoachRole;
  };

  if (!email || !full_name) {
    return NextResponse.json({ error: "Courriel et nom requis." }, { status: 400 });
  }

  const service = createServiceClient();
  const siteUrl = req.nextUrl.origin;
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/definir-mot-de-passe`,
  });

  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? "Échec de l'invitation." }, { status: 500 });
  }

  const { error: profileError } = await service.from("coach_profiles").insert({
    id: invited.user.id,
    full_name,
    role: role === "head_coach" ? "head_coach" : "assistant",
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
