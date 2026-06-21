"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import type { ApolloCapabilities } from "@/lib/apollo-capabilities";
import type { CompanyIntel } from "@/lib/company-intel";
import type { Contact } from "@/lib/csv";
import { buildDiscoverySummary, type DiscoverySummary } from "@/lib/discovery-summary";
import { sortContactsByScore } from "@/lib/scoring";

interface Company {
  company_name: string;
  domain?: string;
}

interface DiscoveryProgress {
  company: string;
  found: number;
  withEmail: number;
  saved: number;
  fromPeopleSearch: number;
  fromContactsSearch: number;
  fromPeopleMatch: number;
  hiringMatch: boolean;
  matchedJobTitle: string;
  apolloCreditsUsed: number;
}

export default function RecruitersPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [apolloOk, setApolloOk] = useState<boolean | null>(null);
  const [capabilities, setCapabilities] = useState<ApolloCapabilities | null>(null);
  const [companyIntel, setCompanyIntel] = useState<CompanyIntel[]>([]);
  const [intelProgress, setIntelProgress] = useState<
    { company: string; hiringScore: number; relevantRoles: number; error?: string }[]
  >([]);
  const [runningIntel, setRunningIntel] = useState(false);
  const [progress, setProgress] = useState<DiscoveryProgress[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState<DiscoverySummary | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [apolloCreditsUsed, setApolloCreditsUsed] = useState<number | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [maxPerCompany, setMaxPerCompany] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [companiesRes, contactsRes, apolloRes, intelRes] = await Promise.all([
        fetch("/api/companies"),
        fetch("/api/contacts"),
        fetch("/api/apollo/search"),
        fetch("/api/apollo/company-intel"),
      ]);

      const companiesData = await companiesRes.json();
      const contactsData = await contactsRes.json();
      const apolloData = await apolloRes.json();
      const intelData = intelRes.ok ? await intelRes.json() : { intel: [] };

      const loaded: Company[] = companiesRes.ok ? companiesData.companies ?? [] : [];
      setCompanies(loaded);
      // Auto-select all on first load
      setSelectedCompanies((prev) =>
        prev.size === 0 ? new Set(loaded.map((c) => c.company_name)) : prev
      );

      const loadedContacts = contactsRes.ok ? sortContactsByScore(contactsData.contacts ?? []) : [];
      setContacts(loadedContacts);

      if (loadedContacts.length > 0) {
        setSummary(
          buildDiscoverySummary(
            loadedContacts,
            loaded.length
          )
        );
      }

      setApolloOk(apolloData.apollo?.ok ?? apolloData.ok ?? false);
      setCapabilities(apolloData.capabilities ?? null);
      setCompanyIntel(intelData.intel ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load data" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function toggleCompany(name: string) {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelectedCompanies(new Set(companies.map((c) => c.company_name)));
  }

  function selectNone() {
    setSelectedCompanies(new Set());
  }

  async function handleCompanyIntel() {
    setRunningIntel(true);
    setMessage(null);
    setIntelProgress([]);
    setErrors([]);
    setWarnings([]);

    try {
      const res = await fetch("/api/apollo/company-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replace: replaceExisting,
          selectedCompanies: Array.from(selectedCompanies),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Company intel failed" });
        return;
      }

      setCompanyIntel(data.intel ?? []);
      setIntelProgress(data.progress ?? []);
      setErrors(data.errors ?? []);
      setWarnings(data.warnings ?? []);
      setMessage({
        type: "success",
        text: `Intel saved for ${data.saved} of ${selectedCompanies.size} selected companies.`,
      });
      await fetchData();
    } catch {
      setMessage({ type: "error", text: "Company intel request failed" });
    } finally {
      setRunningIntel(false);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setMessage(null);
    setProgress([]);
    setErrors([]);
    setWarnings([]);
    setSummary(null);

    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replace: replaceExisting,
          selectedCompanies: Array.from(selectedCompanies),
          maxPerCompany,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Discovery failed" });
        return;
      }

      setProgress(data.progress ?? []);
      setErrors(data.errors ?? []);
      setWarnings(data.warnings ?? []);
      setSummary(data.summary ?? null);
      setApolloCreditsUsed(data.apolloCreditsUsed ?? null);
      setMessage({
        type: "success",
        text: `Found ${data.discovered} contacts across ${selectedCompanies.size} companies. Total: ${data.total}${data.apolloCreditsUsed ? ` · ${data.apolloCreditsUsed} credits used` : ""}`,
      });
      await fetchData();
    } catch {
      setMessage({ type: "error", text: "Discovery request failed" });
    } finally {
      setDiscovering(false);
    }
  }

  const emailsAvailable =
    summary?.emailsAvailable ?? contacts.filter((c) => c.email?.trim()).length;

  const hasRunLog = warnings.length > 0 || errors.length > 0;

  // Per-company lookups
  const intelMap = new Map(companyIntel.map((ci) => [ci.company_name.toLowerCase(), ci]));
  const contactsPerCompany = new Map<string, number>();
  for (const c of contacts) {
    const key = c.company_name.toLowerCase();
    contactsPerCompany.set(key, (contactsPerCompany.get(key) ?? 0) + 1);
  }

  const noneSelected = selectedCompanies.size === 0;
  const allSelected = selectedCompanies.size === companies.length && companies.length > 0;

  return (
    <div>
      <PageHeader
        title="Discover"
        description="Select companies, run Intel to score hiring activity, then run Discovery to find recruiters."
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none px-3 py-2 rounded-lg border border-surface-border hover:border-surface-overlay transition-colors">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-emerald-500"
              />
              Replace existing
            </label>
            <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCompanyIntel}
              loading={runningIntel}
              disabled={noneSelected}
            >
              {runningIntel ? "Running…" : `Run Intel${selectedCompanies.size > 0 ? ` (${selectedCompanies.size})` : ""}`}
            </Button>
            <Button
              size="sm"
              onClick={handleDiscover}
              loading={discovering}
              disabled={noneSelected}
            >
              {discovering ? "Discovering…" : `Run Discovery${selectedCompanies.size > 0 ? ` (${selectedCompanies.size})` : ""}`}
            </Button>
          </div>
        }
      />

      {/* Apollo warning */}
      {apolloOk === false && (
        <div className="mb-5 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium text-amber-400">Apollo API unreachable — discovery may be limited</p>
            <p className="text-amber-200/70 text-xs mt-1">
              Check <code className="text-amber-300">APOLLO_API_KEY</code> in .env ·
              Run <code className="text-amber-300">npm run test:apollo</code> to diagnose ·
              <span className="text-amber-300"> Try Run Discovery anyway</span> — fallback path (contacts/search) still runs
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl border text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Company selection table */}
      <Card className="mb-5">
        <div className="p-4 border-b border-surface-border/50 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white text-sm">Companies</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading ? "Loading…" : `${selectedCompanies.size} of ${companies.length} selected · ≤${selectedCompanies.size * (1 + maxPerCompany)} credits if run`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Max/company</span>
              <select
                value={maxPerCompany}
                onChange={(e) => setMaxPerCompany(Number(e.target.value))}
                className="py-1 px-2 text-xs w-14 bg-surface-overlay border border-surface-border rounded-lg text-white focus:outline-none focus:border-accent"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </div>
            <Button variant="ghost" size="sm" onClick={selectAll} disabled={allSelected || companies.length === 0}>
              All
            </Button>
            <Button variant="ghost" size="sm" onClick={selectNone} disabled={noneSelected}>
              None
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading companies…</div>
        ) : companies.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No companies loaded</p>
            <p className="text-xs text-gray-600 mt-1">
              Upload <Link href="/" className="text-accent hover:underline">companies.csv</Link> on the Dashboard first
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedCompanies.size > 0 && !allSelected;
                      }}
                      onChange={(e) => (e.target.checked ? selectAll() : selectNone())}
                      className="w-4 h-4 rounded accent-emerald-500"
                    />
                  </th>
                  <th>Company</th>
                  <th>Intel Score</th>
                  <th>Contacts</th>
                  <th>Open Roles</th>
                  <th>Employees</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const intel = intelMap.get(company.company_name.toLowerCase());
                  const contactCount = contactsPerCompany.get(company.company_name.toLowerCase()) ?? 0;
                  const checked = selectedCompanies.has(company.company_name);
                  const prog = intelProgress.find(
                    (p) => p.company.toLowerCase() === company.company_name.toLowerCase()
                  );

                  return (
                    <tr
                      key={company.company_name}
                      className={`cursor-pointer ${checked ? "" : "opacity-50"}`}
                      onClick={() => toggleCompany(company.company_name)}
                    >
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCompany(company.company_name)}
                          className="w-4 h-4 rounded accent-emerald-500"
                        />
                      </td>
                      <td>
                        <p className="font-medium">{company.company_name}</p>
                        <p className="text-[11px] text-gray-500">{company.domain || "no domain"}</p>
                      </td>
                      <td>
                        {intel ? (
                          <span className={`font-bold text-sm ${Number(intel.hiring_score) > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                            {intel.hiring_score}
                          </span>
                        ) : prog?.error ? (
                          <span className="text-xs text-red-400" title={prog.error}>failed</span>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td>
                        {contactCount > 0 ? (
                          <span className="text-sky-400 font-medium">{contactCount}</span>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td>
                        {intel ? (
                          <div className="flex flex-wrap gap-1">
                            {intel.sde_roles_open === "YES" && <Badge variant="success">SDE</Badge>}
                            {intel.backend_roles_open === "YES" && <Badge variant="success">Backend</Badge>}
                            {intel.mle_roles_open === "YES" && <Badge variant="success">MLE</Badge>}
                            {intel.sde_roles_open !== "YES" &&
                              intel.backend_roles_open !== "YES" &&
                              intel.mle_roles_open !== "YES" && (
                                <span className="text-xs text-gray-600">none matched</span>
                              )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">run intel</span>
                        )}
                      </td>
                      <td className="text-gray-400 text-sm">
                        {intel?.employee_count || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Selected"
          value={selectedCompanies.size}
          sub={`of ${companies.length} companies`}
          iconClass="bg-surface-overlay text-gray-400"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <StatCard
          label="Contacts Found"
          value={contacts.length}
          sub={contacts.length > 0 ? "in contacts.csv" : "run discovery"}
          iconClass="bg-sky-500/15 text-sky-400"
          valueClass={contacts.length > 0 ? "text-sky-400" : "text-white"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Emails Available"
          value={emailsAvailable}
          sub={emailsAvailable > 0 ? "ready to send" : "none yet"}
          iconClass="bg-accent/15 text-accent"
          valueClass={emailsAvailable > 0 ? "text-accent" : "text-white"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Credits Used"
          value={apolloCreditsUsed !== null ? apolloCreditsUsed : "—"}
          sub={apolloCreditsUsed !== null ? "this run" : `≤${selectedCompanies.size * (1 + maxPerCompany)} if run`}
          iconClass="bg-amber-500/15 text-amber-400"
          valueClass={apolloCreditsUsed !== null ? "text-amber-400" : "text-white"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* Discovery progress (after running) */}
      {progress.length > 0 && (
        <Card className="mb-5">
          <div className="p-4 border-b border-surface-border/50 flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Discovery Results</h3>
            <span className="text-xs text-gray-500">
              {progress.reduce((s, p) => s + p.saved, 0)} contacts saved · {apolloCreditsUsed ?? 0} credits
            </span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Found</th>
                  <th>With Email</th>
                  <th>Saved</th>
                  <th>Credits</th>
                  <th>Hiring</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.company}>
                    <td className="font-medium">{p.company}</td>
                    <td>{p.found}</td>
                    <td>{p.withEmail}</td>
                    <td className="text-emerald-400 font-medium">{p.saved}</td>
                    <td className="text-amber-400">{p.apolloCreditsUsed || "—"}</td>
                    <td>
                      {p.hiringMatch ? (
                        <span className="text-emerald-400 text-xs" title={p.matchedJobTitle}>
                          {p.matchedJobTitle || "YES"}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Combined run log */}
      {hasRunLog && (
        <Card className="mb-5">
          <div className="p-4 border-b border-surface-border/50">
            <h3 className="font-semibold text-white text-sm">Run Log</h3>
          </div>
          <div className="p-4 space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
            {warnings.map((w, i) => (
              <p key={`w-${i}`} className="text-xs text-amber-400 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⚠</span>
                {w}
              </p>
            ))}
            {errors.map((e, i) => (
              <p key={`e-${i}`} className="text-xs text-red-400 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">✕</span>
                {e}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* Contacts table */}
      <Card>
        <div className="p-4 border-b border-surface-border/50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white text-sm">
              Contacts {contacts.length > 0 && `(${contacts.length})`}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {contacts.length > 0
                ? "Saved to contacts.csv — go to Review to edit and approve"
                : companies.length === 0
                ? "Upload companies.csv on the Dashboard first"
                : "Select companies above and run Discovery"}
            </p>
          </div>
          {contacts.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { window.location.href = "/api/contacts/export"; }}
            >
              Export CSV
            </Button>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-surface-overlay border border-surface-border flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No contacts yet</p>
            <p className="text-xs text-gray-600 mt-1">
              {companies.length === 0
                ? "Upload companies.csv on the Dashboard first"
                : "Select companies above and click Run Discovery"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin max-h-[520px]">
            <table>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Score</th>
                  <th>Company</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Email</th>
                  <th>LinkedIn</th>
                  <th>Type</th>
                  <th>Hiring</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr key={`${c.email}-${c.person_name}-${i}`}>
                    <td className="font-bold text-emerald-400">{c.contact_score || "0"}</td>
                    <td className="font-medium">{c.company_name}</td>
                    <td className="font-medium">{c.person_name}</td>
                    <td className="text-gray-400 text-xs">{c.designation || "—"}</td>
                    <td className="font-mono text-xs">{c.email || <span className="text-gray-600">—</span>}</td>
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
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <Badge variant="info">{c.contact_type}</Badge>
                    </td>
                    <td className="text-xs">
                      {c.matching_role_found === "YES" ? (
                        <span className="text-emerald-400">{c.matched_job_title || "YES"}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
