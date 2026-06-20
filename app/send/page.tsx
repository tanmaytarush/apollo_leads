"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, statusBadge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import type { Contact } from "@/lib/csv";
import { isValidEmail } from "@/lib/validation";

interface EmailPreview {
  to: string;
  subject: string;
  body: string;
}

interface SendResult {
  index: number;
  name: string;
  email: string;
  success: boolean;
  error?: string;
}

export default function SendPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [gmailOk, setGmailOk] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [contactsRes, gmailRes] = await Promise.all([
        fetch("/api/contacts"),
        fetch("/api/email/send"),
      ]);
      const contactsData = await contactsRes.json();
      const gmailData = await gmailRes.json();

      if (!contactsRes.ok) {
        setMessage({ type: "error", text: contactsData.error || "Failed to load contacts" });
        setContacts([]);
      } else {
        setContacts(contactsData.contacts ?? []);
      }

      setGmailOk(gmailData.gmail?.ok ?? false);
    } catch {
      setMessage({ type: "error", text: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const eligible = contacts
    .map((contact, index) => ({ contact, index }))
    .filter(
      ({ contact }) =>
        contact.send_email === "YES" &&
        contact.special_mail === "NO" &&
        contact.status === "PENDING" &&
        isValidEmail(contact.email)
    );

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligible.map(({ index }) => index)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handlePreview(index: number) {
    setPreviewing(index);
    setPreview(null);
    try {
      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: contacts[index] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Preview failed" });
        return;
      }
      setPreview(data.preview);
    } catch {
      setMessage({ type: "error", text: "Preview failed" });
    } finally {
      setPreviewing(null);
    }
  }

  async function handleSend() {
    const indices = selected.size > 0
      ? Array.from(selected)
      : eligible.map(({ index }) => index);

    if (indices.length === 0) {
      setMessage({ type: "error", text: "No eligible contacts selected" });
      return;
    }

    if (!confirm(`Send ${indices.length} email(s)? This cannot be undone.`)) return;

    setSending(true);
    setMessage(null);
    setSendResults([]);

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indices }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Send failed" });
        return;
      }

      setSendResults(data.results ?? []);
      setMessage({
        type: "success",
        text: `Sent ${data.sent} email(s). ${data.failed} failed.`,
      });
      setSelected(new Set());
      await fetchData();
    } catch {
      setMessage({ type: "error", text: "Send request failed" });
    } finally {
      setSending(false);
    }
  }

  const sent = contacts.filter((c) => c.status === "SENT").length;
  const failed = contacts.filter((c) => c.status === "FAILED").length;
  const pending = contacts.filter((c) => c.status === "PENDING").length;

  return (
    <div>
      <PageHeader
        title="Send Emails"
        description="Preview and send outreach emails to marked contacts via Gmail SMTP. Only contacts with send_email=YES, special_mail=NO, and status=PENDING are eligible."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
              Refresh
            </Button>
            <Button
              onClick={handleSend}
              loading={sending}
              disabled={eligible.length === 0}
            >
              {selected.size > 0
                ? `Send Selected (${selected.size})`
                : `Send All Eligible (${eligible.length})`}
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-gray-500">Eligible to send</p>
          <p className="text-2xl font-semibold text-emerald-400">{eligible.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Pending</p>
          <p className="text-2xl font-semibold text-amber-400">{pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Sent</p>
          <p className="text-2xl font-semibold text-white">{sent}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Gmail</p>
          <div className="mt-2">
            {gmailOk === null ? (
              <Badge variant="neutral">Checking…</Badge>
            ) : gmailOk ? (
              <Badge variant="success">Ready</Badge>
            ) : (
              <Badge variant="error">Not configured</Badge>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title="Outreach Queue">
            <div className="p-4 flex gap-2 border-b border-surface-border">
              <Button variant="ghost" size="sm" onClick={selectAllEligible}>
                Select All Eligible
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-500">Loading…</div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No contacts. Review and mark contacts first.
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin max-h-[520px]">
                <table>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="w-10"></th>
                      <th>Company</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact, index) => {
                      const isEligible =
                        contact.send_email === "YES" &&
                        contact.special_mail === "NO" &&
                        contact.status === "PENDING" &&
                        isValidEmail(contact.email);

                      return (
                        <tr
                          key={index}
                          className={!isEligible ? "opacity-50" : ""}
                        >
                          <td>
                            {isEligible && (
                              <input
                                type="checkbox"
                                checked={selected.has(index)}
                                onChange={() => toggleSelect(index)}
                                className="w-4 h-4 rounded accent-emerald-500"
                              />
                            )}
                          </td>
                          <td>{contact.company_name}</td>
                          <td className="font-medium">{contact.person_name}</td>
                          <td className="font-mono text-xs">{contact.email || "—"}</td>
                          <td>{statusBadge(contact.status)}</td>
                          <td>
                            {contact.email && (
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={previewing === index}
                                onClick={() => handlePreview(index)}
                              >
                                Preview
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {sendResults.length > 0 && (
            <Card title="Send Results" className="mt-6">
              <div className="p-4 space-y-2">
                {sendResults.map((r) => (
                  <div
                    key={r.index}
                    className="flex items-center justify-between text-sm py-2 border-b border-surface-border/50 last:border-0"
                  >
                    <span>
                      {r.name} ({r.email})
                    </span>
                    {r.success ? (
                      <Badge variant="success">Sent</Badge>
                    ) : (
                      <Badge variant="error">{r.error ?? "Failed"}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div>
          <Card title="Email Preview" description="Generated from templates/default-email.txt">
            {preview ? (
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">To</p>
                  <p className="text-sm font-mono text-gray-300">{preview.to}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Subject</p>
                  <p className="text-sm text-white font-medium">{preview.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Body</p>
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-surface p-4 rounded-xl border border-surface-border max-h-80 overflow-y-auto scrollbar-thin">
                    {preview.body}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500 text-sm">
                Click Preview on a contact to see the generated email.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
