import { NextRequest } from "next/server";

// Les vidéos de match peuvent être longues : on laisse le temps au transfert.
export const maxDuration = 300;

/**
 * Relais de téléchargement : récupère le fichier sur le CDN de Facebook et le
 * renvoie avec « Content-Disposition: attachment » pour que le navigateur
 * (iPhone compris) l'enregistre au lieu de l'ouvrir. Protégé par la connexion
 * (src/proxy.ts) et limité aux hôtes fbcdn.net pour ne pas servir de proxy ouvert.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  const name = (req.nextUrl.searchParams.get("nom") || "video-facebook").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);

  let target: URL;
  try {
    target = new URL(raw ?? "");
  } catch {
    return new Response("Lien invalide.", { status: 400 });
  }
  if (target.protocol !== "https:" || !/(^|\.)fbcdn\.net$/i.test(target.hostname)) {
    return new Response("Seuls les liens vidéo de Facebook (fbcdn.net) sont acceptés.", { status: 400 });
  }

  const upstream = await fetch(target, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
    redirect: "follow",
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(
      upstream.status === 403
        ? "Lien expiré ou refusé par Facebook. Recopiez le code source de la page et réessayez."
        : `Facebook a répondu ${upstream.status}.`,
      { status: 502 },
    );
  }

  const type = upstream.headers.get("content-type") ?? "video/mp4";
  const ext = type.startsWith("audio") ? "m4a" : "mp4";
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}.${ext}"`,
    "Cache-Control": "no-store",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  return new Response(upstream.body, { headers });
}
