"use client";

import { useMemo, useState } from "react";
import { extractFacebookVideos, extractTitle, safeFileName, type FoundVideo } from "@/lib/facebookVideo";

const KIND_LABEL: Record<FoundVideo["kind"], string> = {
  complete: "Image + son",
  video_only: "Image seulement (sans son)",
  audio_only: "Son seulement",
};

export default function VideoFacebookPage() {
  const [source, setSource] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [showDash, setShowDash] = useState(false);

  const videos = useMemo(() => (submitted ? extractFacebookVideos(submitted) : []), [submitted]);
  const title = useMemo(() => (submitted ? extractTitle(submitted) : null), [submitted]);
  const complete = videos.filter((v) => v.kind === "complete");
  const dash = videos.filter((v) => v.kind !== "complete");
  const baseName = safeFileName(title ?? `video-facebook-${new Date().toISOString().slice(0, 10)}`);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    setSource(txt);
    setSubmitted(txt);
  }

  function downloadHref(v: FoundVideo, i: number) {
    const suffix = v.kind === "complete" ? v.quality : `${v.quality}-${v.kind === "audio_only" ? "son" : "image"}`;
    const nom = `${baseName}-${suffix}${i ? `-${i + 1}` : ""}`;
    return `/api/video-facebook/telecharger?url=${encodeURIComponent(v.url)}&nom=${encodeURIComponent(nom)}`;
  }

  function VideoRow({ v, i }: { v: FoundVideo; i: number }) {
    return (
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="font-semibold">{v.quality}</span>
            <span className="text-sm text-slate-500"> · {KIND_LABEL[v.kind]}</span>
          </div>
          <div className="flex gap-2">
            <a className="btn" href={downloadHref(v, i)}>
              Télécharger
            </a>
            <a className="btn-secondary" href={v.url} target="_blank" rel="noreferrer noopener" referrerPolicy="no-referrer">
              Ouvrir
            </a>
          </div>
        </div>
        {v.kind !== "audio_only" ? (
          <video src={v.url} controls preload="metadata" playsInline className="w-full max-h-72 rounded-md bg-black" />
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
        <p className="text-slate-500 text-sm">Télécharger une vidéo d&apos;un groupe Facebook privé à partir du code source de la page.</p>
      </div>

      <details className="card text-sm" open={!submitted}>
        <summary className="font-semibold cursor-pointer">Comment faire</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-slate-600">
          <li>Sur ordinateur, connecté à Facebook, ouvrez la vidéo du groupe (idéalement sa page à elle, en cliquant sur la date de la publication).</li>
          <li>
            Affichez le code source : <b>Ctrl + U</b> (Windows) ou <b>⌥ ⌘ U</b> (Mac). Sur Safari, activez d&apos;abord « Afficher les fonctionnalités pour les
            développeurs web » dans Réglages › Avancées.
          </li>
          <li>
            Tout sélectionner (<b>Ctrl/⌘ + A</b>), copier (<b>Ctrl/⌘ + C</b>) et coller ci-dessous. Ou bien enregistrez la page (Ctrl/⌘ + S) et choisissez le fichier
            .html.
          </li>
          <li>Cliquez « Trouver la vidéo », puis « Télécharger ». Les liens expirent après quelques heures : recopiez le code source au besoin.</li>
        </ol>
      </details>

      <div className="card space-y-3">
        <label className="label">Code source de la page</label>
        <textarea
          className="input font-mono text-xs h-48"
          placeholder="Collez ici le code source (view-source) de la page Facebook…"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn" onClick={() => setSubmitted(source)} disabled={!source.trim()}>
            Trouver la vidéo
          </button>
          <label className="btn-secondary cursor-pointer">
            Choisir un fichier .html
            <input type="file" accept=".html,.htm,.txt,text/html,text/plain" className="hidden" onChange={onFile} />
          </label>
          {source && (
            <button
              className="text-sm text-slate-500 underline"
              onClick={() => {
                setSource("");
                setSubmitted("");
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {submitted && videos.length === 0 && (
        <div className="card text-sm text-red-700">
          Aucune vidéo trouvée. Vérifiez que vous avez copié <b>tout</b> le code source (Ctrl/⌘ + U, pas « Inspecter ») de la page de la vidéo, en étant connecté au
          compte membre du groupe.
        </div>
      )}

      {complete.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            {title ? `« ${title} »` : "Vidéo trouvée"}
            {complete.length > 2 && <span className="text-sm font-normal text-slate-500"> · {complete.length} fichiers (plusieurs vidéos sur la page)</span>}
          </h2>
          {complete.map((v, i) => (
            <VideoRow key={v.url} v={v} i={i} />
          ))}
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
          {(showDash || complete.length === 0) && dash.map((v, i) => <VideoRow key={v.url} v={v} i={i} />)}
        </div>
      )}
    </div>
  );
}
