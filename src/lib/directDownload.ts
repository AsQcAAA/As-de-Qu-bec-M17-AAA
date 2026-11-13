/**
 * Téléchargement direct Facebook → appareil, sans passer par le serveur du site
 * (aucune consommation Vercel, aucune limite mensuelle).
 *
 * 1. On lit le fichier dans le navigateur (fetch). Sur Chrome/Edge ordinateur,
 *    il est écrit directement sur le disque au fil de l'eau (aucune limite de taille) ;
 *    ailleurs, il est assemblé en mémoire puis enregistré.
 * 2. Si le navigateur refuse (sécurité CORS, mémoire), on ouvre le lien Facebook
 *    avec « dl=1 », qui demande au CDN de servir le fichier en téléchargement.
 */

type SaveFilePicker = (opts: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;

export type DownloadResult = "saved" | "fallback" | "cancelled";

export function withDlParam(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("dl", "1");
    return u.toString();
  } catch {
    return url;
  }
}

function openFallback(url: string) {
  const a = document.createElement("a");
  a.href = withDlParam(url);
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  a.referrerPolicy = "no-referrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function directDownload(url: string, filename: string, onProgress: (loaded: number, total: number | null) => void): Promise<DownloadResult> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  // Le sélecteur de fichier doit être ouvert tout de suite (geste de l'utilisateur).
  let writable: WritableStream<Uint8Array> | null = null;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: filename, types: [{ description: "Vidéo", accept: { "video/mp4": [".mp4", ".m4a"] } }] });
      writable = await handle.createWritable();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
      writable = null;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer", credentials: "omit" });
    if (!res.ok || !res.body) throw new Error(String(res.status));
  } catch {
    if (writable) await writable.abort().catch(() => {});
    openFallback(url);
    return "fallback";
  }

  const total = Number(res.headers.get("content-length")) || null;
  let loaded = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      loaded += chunk.byteLength;
      onProgress(loaded, total);
      ctrl.enqueue(chunk);
    },
  });

  try {
    if (writable) {
      await res.body.pipeThrough(counter).pipeTo(writable);
    } else {
      const blob = await new Response(res.body.pipeThrough(counter)).blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    }
    return "saved";
  } catch {
    openFallback(url);
    return "fallback";
  }
}
