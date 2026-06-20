"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import type { Contact } from "@/lib/csv";

interface Company {
  company_name: string;
}

interface DiscoveryProgress {
  company: string;
  found: number;
  withEmail: number;
  saved: number;
}

const TARGET_TITLES = [
  "Technical Recruiter",
  "Recruiter",
  "Talent Acquisition",
  "Engineering Manager",
  "Software Engineering Manager",
  "Hiring Manager",
  "Backend Engineering Manager",
  "Team Lead",
  "Director Engineering",
];

export default function RecruitersPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [apolloOk, setApolloOk] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<DiscoveryProgress[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [companiesRes, contactsRes, apolloRes] = await Promise.all([
        fetch("/api/companies"),
        fetch("/api/contacts"),
        fetch("/api/apollo/search"),
      ]);

      const companiesData = await companiesRes.json();
      const contactsData = await contactsRes.json();
      const apolloData = await apolloRes.json();

      if (!companiesRes.ok) {
        setMessage({ type: "error", text: companiesData.error || "Failed to load companies" });
      }
      if (!contactsRes.ok) {
        setMessage({ type: "error", text: contactsData.error || "Failed to load contacts" });
      }

      setCompanies(companiesRes.ok ? companiesData.companies ?? [] : []);
      setContacts(contactsRes.ok ? contactsData.contacts ?? [] : []);
      setApolloOk(apolloData.apollo?.ok ?? apolloData.ok ?? false);
    } catch {
      setMessage({ type: "error", text: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleDiscover() {
    setDiscovering(true);
    setMessage(null);
    setProgress([]);
    setErrors([]);
    setWarnings([]);

    try {
      const companiesRes = await fetch("/api/companies");
      const companiesData = await companiesRes.json();
      if (!companiesRes.ok) {
        setMessage({ type: "error", text: companiesData.error || "Failed to load companies.csv" });
        return;
      }

      const latestCompanies = companiesData.companies ?? [];
      setCompanies(latestCompanies);

      if (latestCompanies.length === 0) {
        setMessage({ type: "error", text: "Upload companies.csv on the Dashboard first." });
        return;
      }

      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: replaceExisting }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Discovery failed" });
        return;
      }

      setProgress(data.progress ?? []);
      setErrors(data.errors ?? []);
      setWarnings(data.warnings ?? []);
      setMessage({
        type: "success",
        text: `Discovered ${data.discovered} contacts. Total in contacts.csv: ${data.total}`,
      });
      await fetchData();
    } catch {
      setMessage({ type: "error", text: "Discovery request failed" });
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Discover Contacts"
        description="Loads companies.csv in real time, searches Apollo for recruiters and hiring managers. Stores email when Apollo provides it — otherwise leaves blank for manual review."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
              Refresh
            </Button>
            <Button
              onClick={handleDiscover}
              loading={discovering}
              disabled={companies.length === 0}
            >
              {discovering ? "Discovering…" : "Run Discovery"}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Companies from CSV</p>
          <p className="text-3xl font-semibold text-white mt-1">{companies.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Contacts stored</p>
          <p className="text-3xl font-semibold text-white mt-1">{contacts.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Apollo API</p>
          <div className="mt-2">
            {apolloOk === null ? (
              <Badge variant="neutral">Checking…</Badge>
            ) : apolloOk ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="error">Not configured</Badge>
            )}
          </div>
        </Card>
      </div>

      <Card title="Discovery Settings" className="mb-8">
        <div className="p-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="w-4 h-4 rounded accent-emerald-500"
            />
            <div>
              <p className="text-sm text-gray-200">Replace existing contacts</p>
              <p className="text-xs text-gray-500">
                When unchecked, new discoveries are merged with existing contacts.csv
              </p>
            </div>
          </label>

          <div className="mt-4 pt-4 border-t border-surface-border">
            <p className="text-xs text-gray-500 mb-2">Target titles searched:</p>
            <div className="flex flex-wrap gap-2">
              {TARGET_TITLES.map((title) => (
                <Badge key={title} variant="info">
                  {title}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {companies.length > 0 && (
        <Card title={`Companies from CSV (${companies.length})`} className="mb-8">
          <div className="p-6 flex flex-wrap gap-2">
            {companies.map((c) => (
              <Badge key={c.company_name} variant="neutral">
                {c.company_name}
              </Badge>
            ))}
          </div>
          <p className="px-6 pb-4 text-xs text-gray-500">
            Loaded from data/companies.csv — re-read on each Run Discovery.
          </p>
        </Card>
      )}

      {progress.length > 0 && (
        <Card title="Discovery Progress" className="mb-8">
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>People found</th>
                  <th>With email</th>
                  <th>Saved</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.company}>
                    <td className="font-medium">{p.company}</td>
                    <td>{p.found}</td>
                    <td>{p.withEmail}</td>
                    <td className="text-emerald-400 font-medium">{p.saved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card title="Warnings" className="mb-8">
          <div className="p-6 space-y-2">
            {warnings.map((warn, i) => (
              <p key={i} className="text-sm text-amber-400">
                {warn}
              </p>
            ))}
          </div>
        </Card>
      )}

      {errors.length > 0 && (
        <Card title="Errors" className="mb-8">
          <div className="p-6 space-y-2">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-red-400">
                {err}
              </p>
            ))}
          </div>
        </Card>
      )}

      <Card
        title={`Contacts (${contacts.length})`}
        description="Exported to contacts.csv — review and add missing emails before sending"
      >
        {contacts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {companies.length === 0
              ? "Upload companies.csv on the Dashboard first."
              : "Run discovery to find recruiters at your target companies."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin max-h-[500px]">
              <table>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>Company</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Email</th>
                    <th>LinkedIn</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={`${c.email}-${c.person_name}-${i}`}>
                      <td>{c.company_name}</td>
                      <td className="font-medium">{c.person_name}</td>
                      <td className="text-gray-400">{c.designation}</td>
                      <td className="font-mono text-xs">{c.email || "—"}</td>
                      <td>
                        {c.linkedin_url ? (
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline text-xs"
                          >
                            Profile
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Badge variant="info">{c.contact_type}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-surface-border flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/contacts/export";
                }}
              >
                Export CSV
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
