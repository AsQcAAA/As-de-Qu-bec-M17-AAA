"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractFacebookVideos, extractTitle, safeFileName, type FoundVideo } from "@/lib/facebookVideo";
import { directDownload } from "@/lib/directDownload";
import { buildBookmarklet } from "@/lib/bookmarklet";

type DlState = { status: "running" | "saved" | "fallback"; loaded: number; total: number | null };

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
  const [fromBookmark, setFromBookmark] = useState<string | null>(null); // titre de la page Facebook
  const [bookmarklet, setBookmarklet] = useState("");
  const [copied, setCopied] = useState(false);
  const [method, setMethod] = useState<"favori" | "source">("favori");
  const bookmarkLink = useRef<HTMLAnchorElement>(null);

  // Le lien « javascript: » est posé hors de React (qui bloque ce type de lien).
  useEffect(() => {
    const code = buildBookmarklet(window.location.origin);
    setBookmarklet(code);
    bookmarkLink.current?.setAttribute("href", code);
  }, []);

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

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  }

  const videos = useMemo(() => (submitted ? extractFacebookVideos(submitted) : []), [submitted]);
  const title = useMemo(() => (fromBookmark && fromBookmark !== "Facebook" ? fromBookmark : submitted ? extractTitle(submitted) : null), [submitted, fromBookmark]);
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

  function fileName(v: FoundVideo, i: number) {
    const suffix = v.kind === "complete" ? v.quality : `${v.quality}-${v.kind === "audio_only" ? "son" : "image"}`;
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

  // Fonction de rendu (et non composant) : le lecteur vidéo n'est pas recréé à chaque mise à jour de la progression.
  function renderRow(v: FoundVideo, i: number) {
    return (
      <div key={v.url} className="card space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="font-semibold">{v.quality}</span>
            <span className="text-sm text-slate-500"> · {KIND_LABEL[v.kind]}</span>
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
        <p className="text-slate-500 text-sm">Télécharger une vidéo d&apos;un groupe Facebook privé dont vous êtes membre. Gratuit, sans limite.</p>
      </div>

      {!submitted && (
        <>
          <div className="flex gap-2">
            <button className={method === "favori" ? "btn" : "btn-secondary"} onClick={() => setMethod("favori")}>
              Avec le favori (iPhone ou ordinateur)
            </button>
            <button className={method === "source" ? "btn" : "btn-secondary"} onClick={() => setMethod("source")}>
              Avec le code source (ordinateur)
            </button>
          </div>

          {method === "favori" ? (
            <div className="card text-sm space-y-4">
              <div>
                <h2 className="font-semibold text-base">1. Installer le favori (une seule fois)</h2>
                <p className="text-slate-600 mt-1">
                  <b>Ordinateur :</b> glissez ce bouton dans votre barre de favoris →{" "}
                  <a ref={bookmarkLink} className="btn-dark cursor-grab" onClick={(e) => e.preventDefault()} title="Glissez-moi dans la barre de favoris">
                    Vidéo M17
                  </a>
                </p>
                <div className="text-slate-600 mt-3">
                  <b>iPhone (Safari) :</b>
                  <ol className="list-decimal pl-5 mt-1 space-y-1">
                    <li>
                      <button className="btn-secondary !py-1" onClick={copyBookmarklet} disabled={!bookmarklet}>
                        {copied ? "Code copié ✓" : "Copier le code du favori"}
                      </button>
                    </li>
                    <li>Sur cette page, touchez Partager › « Ajouter un signet ». Nommez-le « Vidéo M17 » et enregistrez.</li>
                    <li>Ouvrez les signets (icône livre), touchez « Modifier », puis le signet « Vidéo M17 ».</li>
                    <li>Effacez l&apos;adresse et collez le code copié. Touchez « OK ».</li>
                  </ol>
                </div>
              </div>
              <div>
                <h2 className="font-semibold text-base">2. Télécharger une vidéo</h2>
                <ol className="list-decimal pl-5 mt-1 space-y-1 text-slate-600">
                  <li>
                    Dans le <b>navigateur</b> (Safari, Chrome… pas l&apos;app Facebook), connecté à Facebook, ouvrez la vidéo du groupe : touchez la date de la
                    publication pour l&apos;avoir seule à l&apos;écran.
                  </li>
                  <li>Touchez le favori « Vidéo M17 ». Cet outil s&apos;ouvre avec la vidéo trouvée, prête à télécharger.</li>
                </ol>
              </div>
            </div>
          ) : (
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
          )}
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
            ? "Ouvrez la vidéo seule (touchez la date de la publication), rechargez la page Facebook, puis touchez de nouveau le favori."
            : "Vérifiez que vous avez copié tout le code source (Ctrl/⌘ + U, pas « Inspecter ») de la page de la vidéo, en étant connecté au compte membre du groupe."}
        </div>
      )}

      {complete.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">
            {title ? `« ${title} »` : "Vidéo trouvée"}
            {complete.length > 2 && <span className="text-sm font-normal text-slate-500"> · {complete.length} fichiers (plusieurs vidéos sur la page)</span>}
          </h2>
          {complete.map((v, i) => renderRow(v, i))}
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
