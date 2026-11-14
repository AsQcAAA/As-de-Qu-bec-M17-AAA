"use client";

import { useEffect, useMemo, useState } from "react";
import { extractFacebookVideos, extractTitle, safeFileName, type FoundVideo } from "@/lib/facebookVideo";
import { directDownload } from "@/lib/directDownload";
import { mergeDash, openSink } from "@/lib/dashMerge";

type DlState = { status: "running" | "saved" | "fallback" | "error"; loaded: number; total: number | null; message?: string };

/** « 720p », « 1080p »… : le petit côté de l'image, comme sur YouTube (vaut aussi pour une vidéo verticale). */
function resolutionLabel(d: { w: number; h: number }) {
  return `${Math.min(d.w, d.h)}p`;
}

function mb(n: number) {
  return `${(n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1)} Mo`;
}

const KIND_LABEL: Record<FoundVideo["kind"], string> = {
  complete: "Image + son",
  video_only: "Image seulement (sans son)",
  audio_only: "Son seulement",
};

export default function VideoFacebookPage() {
  const [source, setSource] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [showDash, setShowDash] = useState(false);
  const [dl, setDl] = useState<Record<string, DlState>>({});
  /** Résolution réelle de chaque fichier, lue dans la vidéo elle-même (Facebook ne la donne pas toujours). */
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  const [fromBookmark, setFromBookmark] = useState<string | null>(null); // titre de la page Facebook

  // Arrivée depuis le favori : les liens trouvés sont dans l'adresse (#fb=…).
  useEffect(() => {
    const m = /^#fb=(.+)$/.exec(window.location.hash);
    if (!m) return;
    try {
      const { t, d } = JSON.parse(decodeURIComponent(m[1])) as { t?: string; d?: string };
      setFromBookmark((t ?? "").replace(/^\(\d+\)\s*/, "").replace(/\s*\|\s*Facebook\s*$/i, "").trim() || "Facebook");
      setSubmitted(d ?? "");
    } catch {}
    history.replaceState(null, "", window.location.pathname);
  }, []);

  const videos = useMemo(() => (submitted ? extractFacebookVideos(submitted) : []), [submitted]);
  const title = useMemo(() => (fromBookmark && fromBookmark !== "Facebook" ? fromBookmark : submitted ? extractTitle(submitted) : null), [submitted, fromBookmark]);
  // Meilleure qualité en premier : résolution réelle si elle est connue, sinon celle annoncée par Facebook.
  const sizeOf = (v: FoundVideo) => (dims[v.url] ? Math.min(dims[v.url].w, dims[v.url].h) : (v.height ?? 0));
  const byQuality = (a: FoundVideo, b: FoundVideo) => sizeOf(b) - sizeOf(a);
  const complete = videos.filter((v) => v.kind === "complete").sort(byQuality);
  const dash = videos.filter((v) => v.kind !== "complete").sort((a, b) => Number(a.kind === "audio_only") - Number(b.kind === "audio_only") || byQuality(a, b));
  // Meilleure qualité possible : la meilleure piste image DASH + le son, réunis dans le navigateur,
  // dès qu'elle dépasse le meilleur fichier « image + son » fourni tel quel par Facebook.
  const bestVideo = dash.find((v) => v.kind === "video_only");
  const bestAudio = dash.find((v) => v.kind === "audio_only");
  const hd = bestVideo && bestAudio && sizeOf(bestVideo) > (complete[0] ? sizeOf(complete[0]) : 0) ? { video: bestVideo, audio: bestAudio } : null;
  const qualityOf = (v: FoundVideo) => (dims[v.url] ? resolutionLabel(dims[v.url]) : v.kind === "audio_only" ? "Son" : /^\d+p$/.test(v.quality) ? v.quality : "Qualité en lecture…");
  const baseName = safeFileName(title ?? `video-facebook-${new Date().toISOString().slice(0, 10)}`);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    setSource(txt);
    setSubmitted(txt);
  }

  function fileName(v: FoundVideo, i: number) {
    const q = qualityOf(v).replace("Qualité en lecture…", v.quality);
    const suffix = v.kind === "complete" ? q : `${q}-${v.kind === "audio_only" ? "son" : "image"}`;
    return `${baseName}-${suffix}${i ? `-${i + 1}` : ""}.${v.kind === "audio_only" ? "m4a" : "mp4"}`;
  }

  async function download(v: FoundVideo, i: number) {
    setDl((d) => ({ ...d, [v.url]: { status: "running", loaded: 0, total: null } }));
    const result = await directDownload(v.url, fileName(v, i), (loaded, total) =>
      setDl((d) => ({ ...d, [v.url]: { status: "running", loaded, total } })),
    );
    setDl((d) => {
      const next = { ...d };
      if (result === "cancelled") delete next[v.url];
      else next[v.url] = { ...(d[v.url] ?? { loaded: 0, total: null }), status: result };
      return next;
    });
  }

  async function downloadHd(video: FoundVideo, audio: FoundVideo) {
    const key = `hd:${video.url}`;
    const sink = await openSink(`${baseName}-${qualityOf(video).replace("Qualité en lecture…", "HD")}.mp4`);
    if (sink === "cancelled") return;
    setDl((d) => ({ ...d, [key]: { status: "running", loaded: 0, total: null } }));
    try {
      await mergeDash(video.url, audio.url, sink, (loaded, total) => setDl((d) => ({ ...d, [key]: { status: "running", loaded, total } })));
      setDl((d) => ({ ...d, [key]: { ...d[key], status: "saved" } }));
    } catch (e) {
      setDl((d) => ({ ...d, [key]: { ...d[key], status: "error", message: (e as Error)?.message } }));
    }
  }

  function renderHd(video: FoundVideo, audio: FoundVideo) {
    const st = dl[`hd:${video.url}`];
    return (
      <div className="card space-y-3 ring-2 ring-gold-400">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="font-semibold">{qualityOf(video)}</span>
            <span className="text-sm text-slate-500"> · Image + son</span>
            <span className="ml-2 badge bg-green-100 text-green-800">Meilleure qualité</span>
          </div>
          <button className="btn" onClick={() => downloadHd(video, audio)} disabled={st?.status === "running"}>
            {st?.status === "running" ? "En cours…" : "Télécharger"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Facebook garde l&apos;image HD et le son dans deux fichiers : ils sont réunis ici, dans votre navigateur, en un seul MP4.
        </p>
        {st && (
          <div className="text-sm">
            {st.status === "running" && (
              <div className="space-y-1">
                <div className="h-2 rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-gold-500 transition-all" style={{ width: st.total ? `${Math.round((st.loaded / st.total) * 100)}%` : "30%" }} />
                </div>
                <p className="text-slate-500">
                  {mb(st.loaded)}
                  {st.total ? ` / ${mb(st.total)}` : ""} — gardez la page ouverte.
                </p>
              </div>
            )}
            {st.status === "saved" && <p className="text-green-700">Vidéo HD enregistrée ({mb(st.loaded)}).</p>}
            {st.status === "error" && (
              <p className="text-red-700">
                L&apos;assemblage a échoué{st.message ? ` (${st.message})` : ""}. Prenez le fichier « image + son » ci-dessous, ou réessayez avec un lien
                récent (les liens Facebook expirent après quelques heures).
              </p>
            )}
          </div>
        )}
        <video
          src={video.url}
          controls
          muted
          preload="metadata"
          playsInline
          className="w-full max-h-72 rounded-md bg-black"
          onLoadedMetadata={(e) => {
            const { videoWidth: w, videoHeight: h } = e.currentTarget;
            if (w && h) setDims((d) => (d[video.url]?.w === w && d[video.url]?.h === h ? d : { ...d, [video.url]: { w, h } }));
          }}
        />
      </div>
    );
  }

  // Fonction de rendu (et non composant) : le lecteur vidéo n'est pas recréé à chaque mise à jour de la progression.
  function renderRow(v: FoundVideo, i: number, best = false) {
    return (
      <div key={v.url} className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="font-semibold">{qualityOf(v)}</span>
            <span className="text-sm text-slate-500"> · {KIND_LABEL[v.kind]}</span>
            {best && <span className="ml-2 badge bg-green-100 text-green-800">Meilleure qualité</span>}
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => download(v, i)} disabled={dl[v.url]?.status === "running"}>
              {dl[v.url]?.status === "running" ? "En cours…" : "Télécharger"}
            </button>
            <a className="btn-secondary" href={v.url} target="_blank" rel="noreferrer noopener" referrerPolicy="no-referrer">
              Ouvrir
            </a>
          </div>
        </div>
        {dl[v.url] && (
          <div className="text-sm">
            {dl[v.url].status === "running" && (
              <div className="space-y-1">
                <div className="h-2 rounded bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-gold-500 transition-all"
                    style={{ width: dl[v.url].total ? `${Math.round((dl[v.url].loaded / dl[v.url].total!) * 100)}%` : "30%" }}
                  />
                </div>
                <p className="text-slate-500">
                  {mb(dl[v.url].loaded)}
                  {dl[v.url].total ? ` / ${mb(dl[v.url].total!)}` : ""} — gardez la page ouverte.
                </p>
              </div>
            )}
            {dl[v.url].status === "saved" && <p className="text-green-700">Vidéo enregistrée ({mb(dl[v.url].loaded)}).</p>}
            {dl[v.url].status === "fallback" && (
              <p className="text-slate-600">
                La vidéo a été ouverte dans un nouvel onglet. Si elle joue au lieu de se télécharger : clic droit › « Enregistrer la vidéo sous… » (ordinateur)
                ou bouton Partager › « Enregistrer la vidéo » (iPhone).
              </p>
            )}
          </div>
        )}
        {v.kind !== "audio_only" ? (
          <video
            src={v.url}
            controls
            preload="metadata"
            playsInline
            className="w-full max-h-72 rounded-md bg-black"
            onLoadedMetadata={(e) => {
              const { videoWidth: w, videoHeight: h } = e.currentTarget;
              if (w && h) setDims((d) => (d[v.url]?.w === w && d[v.url]?.h === h ? d : { ...d, [v.url]: { w, h } }));
            }}
          />
        ) : (
          <audio src={v.url} controls preload="none" className="w-full" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Vidéo Facebook</h1>
        <p className="text-slate-500 text-sm">Télécharger une vidéo d&apos;un groupe Facebook privé dont vous êtes membre. Gratuit, sans limite.</p>
      </div>

      {!submitted && (
        <>
            <>
              <div className="card text-sm">
                <ol className="list-decimal pl-5 space-y-1 text-slate-600">
                  <li>Sur ordinateur, connecté à Facebook, ouvrez la vidéo du groupe (cliquez sur la date de la publication).</li>
                  <li>
                    Affichez le code source : <b>Ctrl + U</b> (Windows) ou <b>⌥ ⌘ U</b> (Mac). Sur Safari Mac, activez d&apos;abord « Afficher les fonctionnalités
                    pour les développeurs web » dans Réglages › Avancées.
                  </li>
                  <li>
                    Tout sélectionner (<b>Ctrl/⌘ + A</b>), copier (<b>Ctrl/⌘ + C</b>), coller ci-dessous et cliquer « Trouver la vidéo ».
                  </li>
                </ol>
              </div>

              <div className="card space-y-3">
                <label className="label">Code source de la page</label>
                <textarea
                  className="input font-mono text-xs h-48"
                  placeholder="Collez ici le code source de la page Facebook…"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
                <button className="btn" onClick={() => setSubmitted(source)} disabled={!source.trim()}>
                  Trouver la vidéo
                </button>
                <p className="text-xs text-slate-500 pt-2 border-t">
                  Le collage est trop lent ? Enregistrez plutôt la page Facebook (Ctrl/⌘ + S) et{" "}
                  <label className="underline cursor-pointer">
                    importez le fichier enregistré
                    <input type="file" accept=".html,.htm,.txt,text/html,text/plain" className="hidden" onChange={onFile} />
                  </label>
                  .
                </p>
              </div>
            </>
        </>
      )}

      {submitted && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
          <p className="text-slate-500">
            La vidéo va directement de Facebook à votre appareil. Les liens expirent après quelques heures.
          </p>
          <button
            className="btn-secondary"
            onClick={() => {
              setSource("");
              setSubmitted("");
              setFromBookmark(null);
              setDl({});
            }}
          >
            Nouvelle vidéo
          </button>
        </div>
      )}

      {submitted && videos.length === 0 && (
        <div className="card text-sm text-red-700">
          Aucune vidéo trouvée.{" "}
          {fromBookmark
            ? "Ouvrez la vidéo seule (cliquez sur la date de la publication), rechargez la page Facebook, puis cliquez de nouveau sur le favori."
            : "Vérifiez que vous avez copié tout le code source (Ctrl/⌘ + U, pas « Inspecter ») de la page de la vidéo, en étant connecté au compte membre du groupe."}
        </div>
      )}

      {(complete.length > 0 || hd) && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            {title ? `« ${title} »` : "Vidéo trouvée"}
            {complete.length > 2 && <span className="text-sm font-normal text-slate-500"> · {complete.length} fichiers (plusieurs vidéos sur la page)</span>}
          </h2>
          {hd && renderHd(hd.video, hd.audio)}
          {complete.map((v, i) => renderRow(v, i, !hd && i === 0 && complete.length > 1))}
        </div>
      )}

      {dash.length > 0 && (
        <div className="space-y-3">
          {complete.length > 0 ? (
            <button className="text-sm underline text-slate-600" onClick={() => setShowDash((s) => !s)}>
              {showDash ? "Masquer" : "Afficher"} les pistes séparées ({dash.length})
            </button>
          ) : (
            <p className="text-sm text-slate-600">
              Seules des pistes séparées ont été trouvées : l&apos;image et le son sont dans deux fichiers distincts.
            </p>
          )}
          {(showDash || complete.length === 0) && dash.map((v, i) => renderRow(v, i))}
        </div>
      )}
    </div>
  );
}
