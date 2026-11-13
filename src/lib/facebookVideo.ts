/**
 * Extraction des liens vidéo d'une page Facebook (groupe privé compris) à partir
 * de son code source, copié par l'utilisateur pendant qu'il est connecté.
 * Rien ne passe par Facebook côté serveur : on lit seulement le texte collé.
 */

export type VideoKind = "complete" | "video_only" | "audio_only";

export type FoundVideo = {
  url: string;
  quality: string; // ex. "HD", "SD", "1080p"
  kind: VideoKind;
  height: number | null;
  source: string; // clé JSON d'origine
};

const PROGRESSIVE_KEYS: Record<string, { quality: string; rank: number }> = {
  browser_native_hd_url: { quality: "HD", rank: 720 },
  playable_url_quality_hd: { quality: "HD", rank: 720 },
  hd_src: { quality: "HD", rank: 720 },
  hd_src_no_ratelimit: { quality: "HD", rank: 720 },
  browser_native_sd_url: { quality: "SD", rank: 360 },
  playable_url: { quality: "SD", rank: 360 },
  sd_src: { quality: "SD", rank: 360 },
  sd_src_no_ratelimit: { quality: "SD", rank: 360 },
};

/** Décode une chaîne JSON échappée (\/, %, etc.). */
function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\\//g, "/");
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isVideoUrl(u: string): boolean {
  return /^https:\/\/[^/]*(fbcdn\.net|facebook\.com)\//i.test(u);
}

/** Identifiant stable d'un fichier (chemin sans la signature) pour éviter les doublons. */
function fileKey(u: string): string {
  try {
    const { pathname } = new URL(u);
    return pathname;
  } catch {
    return u;
  }
}

export function extractFacebookVideos(input: string): FoundVideo[] {
  const text = input.includes("&quot;") ? decodeHtmlEntities(input) : input;
  const found: FoundVideo[] = [];
  const seen = new Set<string>();

  const push = (v: FoundVideo) => {
    if (!isVideoUrl(v.url)) return;
    const k = fileKey(v.url);
    if (seen.has(k)) return;
    seen.add(k);
    found.push(v);
  };

  // Lien direct collé tel quel.
  const trimmed = text.trim();
  if (/^https:\/\/\S+$/.test(trimmed) && /fbcdn\.net/i.test(trimmed)) {
    push({ url: decodeHtmlEntities(trimmed), quality: "Lien direct", kind: "complete", height: null, source: "url" });
  }

  // 1. Fichiers MP4 complets (image + son).
  const progRe = new RegExp(`"(${Object.keys(PROGRESSIVE_KEYS).join("|")})"\\s*:\\s*"((?:[^"\\\\]|\\\\.)+)"`, "g");
  for (const m of text.matchAll(progRe)) {
    const meta = PROGRESSIVE_KEYS[m[1]];
    push({ url: decodeJsonString(m[2]), quality: meta.quality, kind: "complete", height: meta.rank, source: m[1] });
  }

  // 2. Pistes DASH (souvent la meilleure qualité, mais image et son séparés).
  const baseRe = /"base_url"\s*:\s*"((?:[^"\\]|\\.)+)"/g;
  for (const m of text.matchAll(baseRe)) {
    const idx = m.index ?? 0;
    // Attributs de la même représentation : l'objet JSON qui entoure base_url.
    const start = Math.max(text.lastIndexOf("{", idx), idx - 1500);
    const endBrace = text.indexOf("}", idx);
    const win = text.slice(start, endBrace === -1 ? idx + 1500 : endBrace);
    const mime = /"mime_type"\s*:\s*"(video|audio)\\?\/mp4"/.exec(win)?.[1];
    const h = Number(/"height"\s*:\s*(\d{3,4})/.exec(win)?.[1] ?? 0) || null;
    const isAudio = mime === "audio";
    push({
      url: decodeJsonString(m[1]),
      quality: isAudio ? "Audio" : h ? `${h}p` : "DASH",
      kind: isAudio ? "audio_only" : "video_only",
      height: isAudio ? null : h,
      source: "base_url",
    });
  }

  // 3. Manifestes DASH XML intégrés (<BaseURL> dans une chaîne JSON).
  const manRe = /"(?:dash_manifest|manifest_xml|dash_manifest_xml_string)"\s*:\s*"((?:[^"\\]|\\.)+)"/g;
  for (const m of text.matchAll(manRe)) {
    const xml = decodeJsonString(m[1]);
    const repRe = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/g;
    for (const r of xml.matchAll(repRe)) {
      const attrs = r[1];
      const base = /<BaseURL>([^<]+)<\/BaseURL>/.exec(r[2])?.[1];
      if (!base) continue;
      const isAudio = /mimeType="audio/.test(attrs) || /audio/i.test(/id="([^"]*)"/.exec(attrs)?.[1] ?? "");
      const h = Number(/\bheight="(\d+)"/.exec(attrs)?.[1] ?? 0) || null;
      push({
        url: decodeHtmlEntities(base),
        quality: isAudio ? "Audio" : h ? `${h}p` : "DASH",
        kind: isAudio ? "audio_only" : "video_only",
        height: isAudio ? null : h,
        source: "dash_manifest",
      });
    }
  }

  const kindOrder: Record<VideoKind, number> = { complete: 0, video_only: 1, audio_only: 2 };
  return found.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || (b.height ?? 0) - (a.height ?? 0));
}

/** Titre de la vidéo si présent, pour nommer le fichier. */
export function extractTitle(input: string): string | null {
  const og = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i.exec(input)?.[1];
  const t = og ?? /<title[^>]*>([^<]+)<\/title>/i.exec(input)?.[1];
  if (!t) return null;
  const clean = decodeHtmlEntities(t).replace(/\s*\|\s*Facebook\s*$/i, "").trim();
  return clean || null;
}

export function safeFileName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 _-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "video-facebook"
  );
}
