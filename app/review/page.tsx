"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import type { Contact } from "@/lib/csv";
import { emailQualityLabel, type EmailQuality } from "@/lib/email-quality";
import { sortContactsByScore } from "@/lib/scoring";

interface ContactRow extends Contact {
  rowId: string;
}

const EMPTY_CONTACT: Contact = {
  company_name: "",
  person_name: "",
  designation: "",
  linkedin_url: "",
  email: "",
  contact_type: "Manager",
  source: "",
  contact_score: "0",
  matching_role_found: "NO",
  matched_job_title: "",
  email_quality: "missing",
  send_email: "NO",
  special_mail: "NO",
  status: "PENDING",
  notes: "",
};

function toRows(contacts: Contact[], idRef: React.MutableRefObject<number>): ContactRow[] {
  return contacts.map((contact) => ({
    ...contact,
    rowId: `row-${++idRef.current}`,
  }));
}

function stripRow(row: ContactRow): Contact {
  const { rowId: _, ...contact } = row;
  return contact;
}

export default function ReviewPage() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const rowIdRef = useRef(0);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to load contacts" });
        return;
      }
      rowIdRef.current = 0;
      setRows(toRows(sortContactsByScore(data.contacts ?? []), rowIdRef));
      setDirty(false);
    } catch {
      setMessage({ type: "error", text: "Failed to load contacts" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updateRow(rowId: string, field: keyof Contact, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row))
    );
    setDirty(true);
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
    setDirty(true);
  }

  function addContact() {
    setRows((prev) => [
      ...prev,
      { ...EMPTY_CONTACT, rowId: `row-${++rowIdRef.current}` },
    ]);
    setDirty(true);
  }

  function dedupeContacts() {
    const seen = new Map<string, ContactRow>();
    for (const row of rows) {
      const email = row.email.toLowerCase().trim();
      const name = row.person_name.toLowerCase().trim();
      const company = row.company_name.toLowerCase().trim();
      const linkedin = row.linkedin_url.toLowerCase().trim();
      const key = email
        ? `${company}|${email}`
        : linkedin
          ? `${company}|${name}|${linkedin}`
          : `${company}|${name}`;
      if (!row.email && !row.person_name) continue;
      seen.set(key, row);
    }
    setRows(Array.from(seen.values()));
    setDirty(true);
  }

  function bulkSetSendEmail(value: "YES" | "NO") {
    setRows((prev) => prev.map((row) => ({ ...row, send_email: value })));
    setDirty(true);
  }

  function resetFailedStatus() {
    setRows((prev) =>
      prev.map((row) =>
        row.status.toUpperCase() === "FAILED"
          ? { ...row, status: "PENDING" }
          : row
      )
    );
    setDirty(true);
  }

  async function saveContacts() {
    setSaving(true);
    setMessage(null);
    try {
      const contacts = rows.map(stripRow);
      const res = await fetch("/api/contacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Save failed" });
        return;
      }
      setMessage({ type: "success", text: `Saved ${data.count} contacts to contacts.csv` });
      setDirty(false);
    } catch {
      setMessage({ type: "error", text: "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((row) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      row.company_name.toLowerCase().includes(q) ||
      row.person_name.toLowerCase().includes(q) ||
      row.email.toLowerCase().includes(q) ||
      row.designation.toLowerCase().includes(q)
    );
  });

  const readyToSend = rows.filter(
    (r) => r.send_email === "YES" && r.special_mail === "NO" && r.status === "PENDING" && r.email.trim().length > 0
  ).length;
  const missingEmail = rows.filter((r) => !r.email.trim()).length;
  const alreadySent = rows.filter((r) => r.status === "SENT").length;
  const failedCount = rows.filter((r) => r.status === "FAILED").length;

  return (
    <div>
      <PageHeader
        title="Review Contacts"
        description="Mandatory manual pass before any outreach. Remove incorrect contacts, add missing emails, and mark send preferences."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={fetchContacts} disabled={loading || dirty}>
              Refresh
            </Button>
            <Button onClick={saveContacts} loading={saving} disabled={!dirty}>
              Save CSV
            </Button>
          </>
        }
      />

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-xl border text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {dirty && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm flex items-center justify-between">
          <span>Unsaved changes — click Save CSV to persist.</span>
          <Button size="sm" onClick={saveContacts} loading={saving}>Save CSV</Button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total"
          value={rows.length}
          sub="contacts loaded"
          iconClass="bg-surface-overlay text-gray-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Ready to Send"
          value={readyToSend}
          sub="approved + has email"
          iconClass="bg-accent/15 text-accent"
          valueClass="text-accent"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Missing Email"
          value={missingEmail}
          sub="need email address"
          iconClass="bg-amber-500/15 text-amber-400"
          valueClass={missingEmail > 0 ? "text-amber-400" : "text-white"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          label="Sent"
          value={alreadySent}
          sub={failedCount > 0 ? `${failedCount} failed` : "all clean"}
          iconClass="bg-sky-500/15 text-sky-400"
          valueClass="text-sky-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      <Card className="mb-6">
        <div className="p-4 flex flex-wrap items-center gap-3 border-b border-surface-border">
          <input
            type="text"
            placeholder="Search contacts…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 min-w-[200px]"
          />
          <Button variant="secondary" size="sm" onClick={addContact}>
            Add Contact
          </Button>
          <Button variant="secondary" size="sm" onClick={dedupeContacts}>
            Remove Duplicates
          </Button>
          <Button variant="ghost" size="sm" onClick={() => bulkSetSendEmail("YES")}>
            Mark All Send
          </Button>
          <Button variant="ghost" size="sm" onClick={() => bulkSetSendEmail("NO")}>
            Unmark All
          </Button>
          {failedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFailedStatus}>
              Reset Failed → Pending
            </Button>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading contacts…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No contacts found. Run discovery or upload contacts.csv.
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Company</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Email</th>
                  <th>Quality</th>
                  <th>LinkedIn</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Hiring</th>
                  <th>Send</th>
                  <th>Special</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.rowId}>
                    <td className="font-semibold text-emerald-400">{row.contact_score || "0"}</td>
                    <td>
                      <input
                        value={row.company_name}
                        onChange={(e) => updateRow(row.rowId, "company_name", e.target.value)}
                        className="w-28 bg-transparent border-0 p-0 focus:ring-0"
                      />
                    </td>
                    <td>
                      <input
                        value={row.person_name}
                        onChange={(e) => updateRow(row.rowId, "person_name", e.target.value)}
                        className="w-32 bg-transparent border-0 p-0 focus:ring-0 font-medium"
                      />
                    </td>
                    <td>
                      <input
                        value={row.designation}
                        onChange={(e) => updateRow(row.rowId, "designation", e.target.value)}
                        className="w-36 bg-transparent border-0 p-0 focus:ring-0 text-gray-400"
                      />
                    </td>
                    <td>
                      <input
                        value={row.email}
                        onChange={(e) => updateRow(row.rowId, "email", e.target.value)}
                        className="w-44 bg-transparent border-0 p-0 focus:ring-0 font-mono text-xs"
                      />
                    </td>
                    <td className="text-xs text-gray-400">
                      {emailQualityLabel((row.email_quality || "missing") as EmailQuality)}
                    </td>
                    <td>
                      <input
                        value={row.linkedin_url}
                        onChange={(e) => updateRow(row.rowId, "linkedin_url", e.target.value)}
                        className="w-40 bg-transparent border-0 p-0 focus:ring-0 text-xs text-gray-400"
                      />
                    </td>
                    <td>
                      <input
                        value={row.contact_type}
                        onChange={(e) => updateRow(row.rowId, "contact_type", e.target.value)}
                        className="w-28 bg-transparent border-0 p-0 focus:ring-0"
                      />
                    </td>
                    <td className="text-xs text-gray-500">{row.source || "—"}</td>
                    <td className="text-xs">
                      {row.matching_role_found === "YES" ? (
                        <span className="text-emerald-400" title={row.matched_job_title}>
                          YES
                        </span>
                      ) : (
                        <span className="text-gray-500">NO</span>
                      )}
                    </td>
                    <td>
                      <select
                        value={row.send_email}
                        onChange={(e) => updateRow(row.rowId, "send_email", e.target.value)}
                        className="py-1 px-2 text-xs"
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.special_mail}
                        onChange={(e) => updateRow(row.rowId, "special_mail", e.target.value)}
                        className="py-1 px-2 text-xs"
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(row.rowId, "status", e.target.value)}
                        className="py-1 px-2 text-xs"
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="SENT">SENT</option>
                        <option value="FAILED">FAILED</option>
                        <option value="SKIPPED">SKIPPED</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.notes}
                        onChange={(e) => updateRow(row.rowId, "notes", e.target.value)}
                        className="w-36 bg-transparent border-0 p-0 focus:ring-0 text-xs text-gray-400"
                        placeholder="Add note…"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => removeRow(row.rowId)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Column Reference">
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
          <div>
            <p className="text-white font-medium mb-1">send_email</p>
            <p>YES = include in email batch. NO = skip.</p>
          </div>
          <div>
            <p className="text-white font-medium mb-1">special_mail</p>
            <p>YES = handle manually, system skips. NO = eligible for automation.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
