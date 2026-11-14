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

/**
 * Les liens de Facebook portent un paramètre « efg » (JSON en base64) qui décrit
 * le fichier, ex. vencode_tag = « dash_h264-basic-gen2_1080p » ou « …_audio ».
 * C'est ce qui permet de reconnaître la qualité d'un lien trouvé « en vrac ».
 */
export function describeUrl(u: string): { height: number | null; audio: boolean; dash: boolean } | null {
  try {
    const efg = new URL(u).searchParams.get("efg");
    if (!efg) return null;
    const json = atob(efg.replace(/-/g, "+").replace(/_/g, "/"));
    const tag = /"vencode_tag"\s*:\s*"([^"]+)"/.exec(json)?.[1] ?? "";
    if (!tag) return null;
    const audio = /audio/i.test(tag);
    const h = Number(/(\d{3,4})p/.exec(tag)?.[1] ?? 0) || null;
    // Une piste DASH ne contient que l'image (ou que le son) ; un fichier « progressive » contient les deux.
    return { height: audio ? null : h, audio, dash: /^dash/i.test(tag) };
  } catch {
    return null;
  }
}

/** Un lien chargé par le lecteur ne couvre qu'un morceau (bytestart/byteend) : on le ramène au fichier entier. */
export function fullFileUrl(u: string): string {
  try {
    const url = new URL(u);
    if (!url.searchParams.has("bytestart") && !url.searchParams.has("byteend")) return u;
    url.searchParams.delete("bytestart");
    url.searchParams.delete("byteend");
    return url.toString();
  } catch {
    return u;
  }
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
    v = { ...v, url: fullFileUrl(v.url) };
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
    const info = describeUrl(decodeJsonString(m[1]));
    const h = Number(/"height"\s*:\s*(\d{3,4})/.exec(win)?.[1] ?? 0) || info?.height || null;
    const isAudio = mime ? mime === "audio" : !!info?.audio;
    push({
      url: decodeJsonString(m[1]),
      quality: isAudio ? "Audio" : h ? `${h}p` : "DASH",
      kind: isAudio ? "audio_only" : "video_only",
      height: isAudio ? null : h,
      source: "base_url",
    });
  }

  // 3. Manifestes DASH XML intégrés (<BaseURL> dans une chaîne JSON).
  const manRe = /"[A-Za-z_]+"\s*:\s*"((?:[^"\\]|\\.)*?(?:<|\\u003C)MPD(?:[^"\\]|\\.)*)"/g;
  for (const m of text.matchAll(manRe)) {
    const xml = decodeJsonString(m[1]);
    const repRe = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/g;
    for (const r of xml.matchAll(repRe)) {
      const attrs = r[1];
      const base = /<BaseURL>([^<]+)<\/BaseURL>/.exec(r[2])?.[1];
      if (!base) continue;
      const isAudio = /mimeType="audio/.test(attrs) || /audio/i.test(/id="([^"]*)"/.exec(attrs)?.[1] ?? "");
      const w = Number(/\bwidth="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const hh = Number(/\bheight="(\d+)"/.exec(attrs)?.[1] ?? 0);
      const label = Number(/FBQualityLabel="(\d{3,4})p"/.exec(attrs)?.[1] ?? 0);
      const h = label || (w && hh ? Math.min(w, hh) : hh) || null;
      push({
        url: decodeHtmlEntities(base),
        quality: isAudio ? "Audio" : h ? `${h}p` : "DASH",
        kind: isAudio ? "audio_only" : "video_only",
        height: isAudio ? null : h,
        source: "dash_manifest",
      });
    }
  }

  // 4. Tout autre lien MP4 de Facebook (version mobile, balise <video>, etc.).
  const anyRe = /https?:(?:\\?\/){2}[^"'\s<>]*?fbcdn\.net[^"'\s<>]*?\.mp4[^"'\s<>]*/g;
  for (const m of text.matchAll(anyRe)) {
    const raw = m[0].replace(/\\+$/, "");
    const url = decodeHtmlEntities(decodeJsonString(raw));
    // Un lien « en vrac » peut être une piste DASH : on le reconnaît grâce à efg.
    const info = describeUrl(url);
    if (info?.audio) push({ url, quality: "Audio", kind: "audio_only", height: null, source: "mp4" });
    else push({ url, quality: info?.height ? `${info.height}p` : "MP4", kind: info?.dash ? "video_only" : "complete", height: info?.height ?? null, source: "mp4" });
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
