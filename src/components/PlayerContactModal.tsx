"use client";

import Modal from "@/components/Modal";
import type { Player, PlayerContact } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 border-b border-slate-100 last:border-0 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

/** Toutes les coordonnées d'un joueur, dans une fenêtre (pas une nouvelle page). */
export default function PlayerContactModal({
  player,
  contact,
  canEmail = false,
  onWriteEmail,
  onClose,
}: {
  player: Player;
  contact: PlayerContact | null;
  /** L'entraîneur-chef écrit depuis l'app ; les autres gardent un lien « mailto ». */
  canEmail?: boolean;
  onWriteEmail?: (email: string) => void;
  onClose: () => void;
}) {
  const address = [contact?.address, contact?.city, contact?.postal_code].filter(Boolean).join(", ");
  return (
    <Modal onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Coordonnées — {player.full_name}</h2>
            <p className="text-sm text-slate-400">
              {player.jersey_number ? `#${player.jersey_number} · ` : ""}
              {player.is_call_up ? "Remplaçant" : "Effectif régulier"}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            ✕ Fermer
          </button>
        </div>

        {!contact ? (
          <div className="card text-sm text-slate-500">Aucune coordonnée enregistrée pour ce joueur.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <section className="card space-y-1">
              <h3 className="font-semibold mb-1">Courriels</h3>
              {contact.emails.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun courriel.</p>
              ) : (
                <ul className="space-y-1">
                  {contact.emails.map((e) => (
                    <li key={e}>
                      {canEmail && onWriteEmail ? (
                        <button
                          type="button"
                          onClick={() => onWriteEmail(e)}
                          title="Écrire à cette adresse depuis l'application"
                          className="text-left text-sm font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded px-1.5 py-0.5 break-all"
                        >
                          {e}
                        </button>
                      ) : (
                        <a
                          href={`mailto:${e}`}
                          className="text-sm font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded px-1.5 py-0.5 break-all"
                        >
                          {e}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card space-y-1">
              <h3 className="font-semibold mb-1">Téléphones</h3>
              {contact.phones.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun numéro.</p>
              ) : (
                <ul className="space-y-1.5">
                  {contact.phones.map((p, i) => (
                    <li key={`${p.number}-${i}`} className="text-sm">
                      <a href={`tel:${p.number.replace(/[^\d+]/g, "")}`} className="font-bold text-ink-800 hover:underline">
                        {p.number}
                      </a>
                      <span className="text-slate-500">
                        {" "}
                        — {p.label}
                        {p.name ? ` · ${p.name}${p.relation ? ` (${p.relation})` : ""}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card md:col-span-2">
              <h3 className="font-semibold mb-1">Dossier</h3>
              <dl>
                <Row label="Adresse">{address || "—"}</Row>
                <Row label="Date de naissance">{contact.birth_date ?? "—"}</Row>
                <Row label="Numéro HCR">{contact.registration_id ?? "—"}</Row>
              </dl>
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}
