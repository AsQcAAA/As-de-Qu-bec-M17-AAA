/**
 * Réunit une piste image et une piste son DASH de Facebook (deux MP4 fragmentés
 * séparés) en UN seul fichier MP4, directement dans le navigateur — c'est ce qui
 * donne accès à la HD (720p, 1080p) que Facebook ne fournit jamais en fichier
 * « image + son ».
 *
 * Aucun réencodage : les fragments (moof + mdat) sont recopiés tels quels, en
 * alternant image et son selon leur horodatage. Seuls trois nombres sont
 * réécrits : le numéro de piste du son, le numéro de séquence des fragments et
 * le prochain numéro de piste. Tout se fait au fil de l'eau : la mémoire reste
 * faible même pour un match complet, et rien ne passe par le serveur du site.
 */

type Box = { type: string; data: Uint8Array };

const td = new TextDecoder();
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
function setU32(b: Uint8Array, o: number, v: number) {
  b[o] = (v >>> 24) & 255;
  b[o + 1] = (v >>> 16) & 255;
  b[o + 2] = (v >>> 8) & 255;
  b[o + 3] = v & 255;
}
const boxType = (b: Uint8Array, o: number) => td.decode(b.subarray(o + 4, o + 8));

/** Enfants directs d'une boîte conteneur (après `headerSize` octets). */
function children(box: Uint8Array, headerSize = 8): Box[] {
  const out: Box[] = [];
  let o = headerSize;
  while (o + 8 <= box.length) {
    let size = u32(box, o);
    if (size === 1) size = u32(box, o + 12) + u32(box, o + 8) * 2 ** 32;
    else if (size === 0) size = box.length - o;
    if (size < 8 || o + size > box.length) break;
    out.push({ type: boxType(box, o), data: box.subarray(o, o + size) });
    o += size;
  }
  return out;
}
const child = (box: Uint8Array, type: string, headerSize = 8) => children(box, headerSize).find((c) => c.type === type)?.data;

function makeBox(type: string, parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  setU32(out, 0, size);
  out.set(new TextEncoder().encode(type), 4);
  let o = 8;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Lecteur de boîtes MP4 de premier niveau sur un flux réseau. */
class BoxStream {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  // Morceaux reçus, assemblés une seule fois par boîte (pas de recopie à chaque morceau).
  private chunks: Uint8Array[] = [];
  private length = 0;
  private done = false;
  constructor(stream: ReadableStream<Uint8Array>, private onBytes: (n: number) => void) {
    this.reader = stream.getReader();
  }
  private async fill(n: number): Promise<boolean> {
    while (this.length < n && !this.done) {
      const { value, done } = await this.reader.read();
      if (done) {
        this.done = true;
        break;
      }
      this.onBytes(value.length);
      this.chunks.push(value);
      this.length += value.length;
    }
    return this.length >= n;
  }
  /** Retire les n premiers octets du tampon. */
  private take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let o = 0;
    while (o < n) {
      const c = this.chunks[0];
      const k = Math.min(c.length, n - o);
      out.set(c.subarray(0, k), o);
      o += k;
      if (k === c.length) this.chunks.shift();
      else this.chunks[0] = c.subarray(k);
    }
    this.length -= n;
    return out;
  }
  private peek(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of this.chunks) {
      if (o >= n) break;
      const k = Math.min(c.length, n - o);
      out.set(c.subarray(0, k), o);
      o += k;
    }
    return out;
  }
  async next(): Promise<Box | null> {
    if (!(await this.fill(8))) return null;
    let head = this.peek(8);
    let size = u32(head, 0);
    if (size === 1) {
      if (!(await this.fill(16))) return null;
      head = this.peek(16);
      size = u32(head, 12) + u32(head, 8) * 2 ** 32;
    }
    if (size === 0) {
      while (await this.fill(this.length + 1)) {} // jusqu'à la fin du fichier
      size = this.length;
    }
    if (size < 8 || !(await this.fill(size))) throw new Error("Fichier vidéo tronqué.");
    const type = boxType(head, 0);
    return { type, data: this.take(size) };
  }
  cancel() {
    this.reader.cancel().catch(() => {});
  }
}

type Track = {
  stream: BoxStream;
  moov: Uint8Array;
  trackId: number;
  timescale: number;
};

async function openTrack(stream: BoxStream): Promise<{ track: Track; ftyp: Uint8Array | null }> {
  let ftyp: Uint8Array | null = null;
  for (;;) {
    const b = await stream.next();
    if (!b) throw new Error("Piste vide.");
    if (b.type === "ftyp") ftyp = b.data;
    if (b.type === "moov") {
      const trak = child(b.data, "trak");
      if (!trak || !child(b.data, "mvex")) throw new Error("Cette piste n'est pas un MP4 fragmenté.");
      const tkhd = child(trak, "tkhd")!;
      const trackId = u32(tkhd, tkhd[8] === 1 ? 28 : 20);
      const mdhd = child(child(trak, "mdia")!, "mdhd")!;
      const timescale = u32(mdhd, mdhd[8] === 1 ? 28 : 20);
      return { track: { stream, moov: b.data, trackId, timescale }, ftyp };
    }
  }
}

/** Prochain fragment (moof + mdat) d'une piste, avec son heure de début en secondes. */
async function nextFragment(t: Track): Promise<{ moof: Uint8Array; mdat: Uint8Array; time: number } | null> {
  let moof: Uint8Array | null = null;
  for (;;) {
    const b = await t.stream.next();
    if (!b) return null;
    if (b.type === "moof") moof = b.data;
    else if (b.type === "mdat" && moof) {
      const traf = child(moof, "traf")!;
      const tfhd = child(traf, "tfhd")!;
      if (tfhd[11] & 0x01) throw new Error("Format de fragment non pris en charge (base-data-offset).");
      const tfdt = child(traf, "tfdt");
      const base = !tfdt ? 0 : tfdt[8] === 1 ? u32(tfdt, 12) * 2 ** 32 + u32(tfdt, 16) : u32(tfdt, 12);
      return { moof, mdat: b.data, time: base / t.timescale };
    }
  }
}

/** moov commun : celui de l'image, plus la piste son renumérotée. */
function mergeMoov(video: Track, audio: Track, audioId: number): Uint8Array {
  const vKids = children(video.moov);
  const aTrak = child(audio.moov, "trak")!.slice();
  const tkhd = child(aTrak, "tkhd")!;
  setU32(tkhd, tkhd[8] === 1 ? 28 : 20, audioId);
  const aTrex = child(child(audio.moov, "mvex")!, "trex")!.slice();
  setU32(aTrex, 12, audioId);

  const parts: Uint8Array[] = [];
  for (const k of vKids) {
    if (k.type === "mvhd") {
      const mvhd = k.data.slice();
      setU32(mvhd, mvhd.length - 4, audioId + 1); // next_track_ID
      parts.push(mvhd);
    } else if (k.type === "mvex") {
      const vMvex = children(k.data).filter((c) => c.type !== "trex" || u32(c.data, 12) === video.trackId);
      parts.push(makeBox("mvex", [...vMvex.map((c) => c.data), aTrex]));
    } else if (k.type === "trak") {
      parts.push(k.data, aTrak);
    } else {
      parts.push(k.data);
    }
  }
  return makeBox("moov", parts);
}

function retag(moof: Uint8Array, seq: number, trackId: number | null): Uint8Array {
  const out = moof.slice();
  const mfhd = child(out, "mfhd");
  if (mfhd) setU32(mfhd, 12, seq);
  if (trackId != null) {
    for (const traf of children(out).filter((c) => c.type === "traf")) {
      const tfhd = child(traf.data, "tfhd");
      if (tfhd) setU32(tfhd, 12, trackId);
    }
  }
  return out;
}

export type MergeResult = "saved" | "cancelled";

type SaveFilePicker = (opts: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;

/** Ouvre l'emplacement d'enregistrement : à appeler tout de suite après le clic. */
export async function openSink(filename: string): Promise<{ write: (b: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> } | "cancelled"> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: filename, types: [{ description: "Vidéo", accept: { "video/mp4": [".mp4"] } }] });
      const w = (await handle.createWritable()).getWriter();
      return { write: (b) => w.write(b), close: () => w.close(), abort: () => w.abort().catch(() => {}) };
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  // Autres navigateurs : le fichier est assemblé en mémoire puis enregistré.
  const chunks: BlobPart[] = [];
  return {
    write: async (b) => {
      chunks.push(b as unknown as BlobPart);
    },
    close: async () => {
      const href = URL.createObjectURL(new Blob(chunks, { type: "video/mp4" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    },
    abort: async () => {
      chunks.length = 0;
    },
  };
}

async function openUrl(url: string) {
  const res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer", credentials: "omit" });
  if (!res.ok || !res.body) throw new Error(`Facebook a refusé le fichier (${res.status}).`);
  return { body: res.body, size: Number(res.headers.get("content-length")) || 0 };
}

/**
 * Télécharge et réunit les deux pistes. `sink` vient de openSink (ouvert au clic).
 * onProgress reçoit les octets lus et le total des deux pistes.
 */
export async function mergeDash(
  videoUrl: string,
  audioUrl: string,
  sink: Exclude<Awaited<ReturnType<typeof openSink>>, "cancelled">,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<MergeResult> {
  let loaded = 0;
  const [v, a] = await Promise.all([openUrl(videoUrl), openUrl(audioUrl)]);
  const total = v.size && a.size ? v.size + a.size : null;
  const tick = (n: number) => {
    loaded += n;
    onProgress(loaded, total);
  };
  const vs = new BoxStream(v.body, tick);
  const as = new BoxStream(a.body, tick);
  try {
    const { track: video, ftyp } = await openTrack(vs);
    const { track: audio } = await openTrack(as);
    const audioId = video.trackId + 1;

    if (ftyp) await sink.write(ftyp);
    await sink.write(mergeMoov(video, audio, audioId));

    let seq = 1;
    let vf = await nextFragment(video);
    let af = await nextFragment(audio);
    while (vf || af) {
      const takeVideo = vf && (!af || vf.time <= af.time);
      const f = takeVideo ? vf! : af!;
      await sink.write(retag(f.moof, seq++, takeVideo ? null : audioId));
      await sink.write(f.mdat);
      if (takeVideo) vf = await nextFragment(video);
      else af = await nextFragment(audio);
    }
    await sink.close();
    return "saved";
  } catch (e) {
    vs.cancel();
    as.cancel();
    await sink.abort();
    throw e;
  }
}
