"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isAdmin } from "@/domain/scope";
import { humanDate } from "@/lib/ui";
import type { DailyNote } from "@/domain/types";
import { todayISO } from "@/lib/schedule-view";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function inWindow(note: DailyNote, today: string): boolean {
  if (note.visibleFrom && today < note.visibleFrom) return false;
  if (note.visibleTo && today > note.visibleTo) return false;
  return true;
}

function windowLabel(note: DailyNote): string | null {
  if (note.visibleFrom && note.visibleTo) return `${humanDate(note.visibleFrom)} – ${humanDate(note.visibleTo)}`;
  if (note.visibleFrom) return `from ${humanDate(note.visibleFrom)}`;
  if (note.visibleTo) return `until ${humanDate(note.visibleTo)}`;
  return null;
}

/**
 * Rolling dashboard announcement feed. Staff see published notes within their
 * visibility window. Managers may compose notes and set a begin/end window;
 * admins publish, unpublish, and remove them. Reads like an embedded feed.
 */
export function DailyNotesFeed() {
  const { db, currentUser, upsertDailyNote, setDailyNotePublished, deleteDailyNote, now } = useStore();
  const today = todayISO();
  const manager = canManage(currentUser);
  const admin = isAdmin(currentUser);

  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const authorName = (id: string) =>
    db.employees.find((e) => e.id === id)?.preferredName ??
    db.employees.find((e) => e.id === id)?.legalName ??
    db.users.find((u) => u.id === id)?.displayName ??
    "Team";

  const feed = useMemo(() => {
    const notes = manager
      ? db.dailyNotes // managers see drafts + published for oversight
      : db.dailyNotes.filter((n) => n.published && inWindow(n, today));
    return [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [db.dailyNotes, manager, today]);

  function post() {
    if (!body.trim()) {
      setError("Write something before posting.");
      return;
    }
    if (from && to && to < from) {
      setError("End date must be on or after the start date.");
      return;
    }
    const ts = now();
    const note: DailyNote = {
      id: `dn-${Date.now()}`,
      body: body.trim(),
      authorId: currentUser.id,
      // Admins' posts publish immediately; other managers' posts await an admin.
      published: admin,
      pinned: false,
      visibleFrom: from || undefined,
      visibleTo: to || undefined,
      createdAt: ts,
      updatedAt: ts,
    };
    upsertDailyNote(note);
    setBody("");
    setFrom("");
    setTo("");
    setError("");
    setComposing(false);
  }

  return (
    <section className="card glass" aria-labelledby="daily-notes">
      <div className="spread" style={{ marginBottom: "0.5rem" }}>
        <h2 id="daily-notes" style={{ margin: 0 }}>Daily notes</h2>
        {manager && (
          <button className="button sm glass-button" onClick={() => setComposing((v) => !v)} aria-expanded={composing}>
            {composing ? "Cancel" : "＋ New note"}
          </button>
        )}
      </div>

      {manager && composing && (
        <div className="note-composer card glass-strong" style={{ marginBottom: "0.85rem" }}>
          {error && <div className="error-summary" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="note-body">Note</label>
            <textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share an update with the team…"
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: "1 1 140px" }}>
              <label htmlFor="note-from">Visible from</label>
              <input id="note-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 140px" }}>
              <label htmlFor="note-to">Visible until</label>
              <input id="note-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="row">
            <button className="button primary glass-button" onClick={post}>Post note</button>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              {admin ? "Publishes immediately." : "Saved as a draft for an admin to publish."}
            </span>
          </div>
        </div>
      )}

      {feed.length === 0 ? (
        <p className="muted">No notes to show right now.</p>
      ) : (
        <div className="feed">
          {feed.map((n) => {
            const hidden = manager && (!n.published || !inWindow(n, today));
            const wl = windowLabel(n);
            return (
              <article key={n.id} className={`note-card glass-strong${n.pinned ? " pinned" : ""}`}>
                <div className="note-head">
                  <span className="note-avatar" aria-hidden>{initials(authorName(n.authorId))}</span>
                  <span className="note-author">{authorName(n.authorId)}</span>
                  {n.pinned && <span className="badge">Pinned</span>}
                  {manager && (
                    <span className={`badge ${n.published ? "ok" : "warn"}`}>{n.published ? "Published" : "Draft"}</span>
                  )}
                  {hidden && n.published && <span className="badge">Outside window</span>}
                </div>
                <p className="note-body">{n.body}</p>
                <div className="note-meta" style={{ marginTop: "0.4rem" }}>
                  {wl ? `Visible ${wl}` : "Always visible while published"}
                </div>
                {manager && (
                  <div className="note-actions">
                    {admin && (
                      <button className="button sm glass-button" onClick={() => setDailyNotePublished(n.id, !n.published)}>
                        {n.published ? "Unpublish" : "Publish"}
                      </button>
                    )}
                    <button
                      className="button sm glass-button"
                      onClick={() => upsertDailyNote({ ...n, pinned: !n.pinned })}
                    >
                      {n.pinned ? "Unpin" : "Pin"}
                    </button>
                    {(admin || n.authorId === currentUser.id) && (
                      <button className="button sm danger" onClick={() => deleteDailyNote(n.id)}>Delete</button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
