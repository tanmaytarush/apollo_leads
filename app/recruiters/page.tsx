"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import type { ApolloCapabilities } from "@/lib/apollo-capabilities";
import type { CompanyIntel } from "@/lib/company-intel";
import type { Contact } from "@/lib/csv";
import { buildCompanyRollups, buildDiscoverySummary, type DiscoverySummary } from "@/lib/discovery-summary";
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

      if (!companiesRes.ok) {
        setMessage({ type: "error", text: companiesData.error || "Failed to load companies" });
      }
      if (!contactsRes.ok) {
        setMessage({ type: "error", text: contactsData.error || "Failed to load contacts" });
      }

      setCompanies(companiesRes.ok ? companiesData.companies ?? [] : []);
      setContacts(
        contactsRes.ok ? sortContactsByScore(contactsData.contacts ?? []) : []
      );
      if (contactsRes.ok && (contactsData.contacts ?? []).length > 0) {
        setSummary(
          buildDiscoverySummary(
            contactsData.contacts ?? [],
            companiesRes.ok ? (companiesData.companies ?? []).length : 0
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
        body: JSON.stringify({ replace: replaceExisting }),
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
        text: `Company intel saved for ${data.saved} companies (SDE/backend/MLE roles scored).`,
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
      setSummary(data.summary ?? null);
      setApolloCreditsUsed(data.apolloCreditsUsed ?? null);
      setMessage({
        type: "success",
        text: `Discovered ${data.discovered} contacts. Total in contacts.csv: ${data.total}${data.apolloCreditsUsed ? ` · ${data.apolloCreditsUsed} Apollo credits used` : ""}`,
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
        title="Discover & Intel"
        description="Free plan: automate company enrich + job postings. Add recruiters manually from Apollo UI, then review and send."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={handleCompanyIntel}
              loading={runningIntel}
              disabled={companies.length === 0}
            >
              {runningIntel ? "Running…" : "Run Company Intel"}
            </Button>
            <Button
              onClick={handleDiscover}
              loading={discovering}
              disabled={companies.length === 0 || capabilities?.peopleSearch === false}
              title={
                capabilities?.peopleSearch === false
                  ? "People search blocked on free Apollo plan"
                  : undefined
              }
            >
              {discovering ? "Discovering…" : "Run People Discovery"}
            </Button>
          </>
        }
      />

      {capabilities?.freePlan && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm">
          <p className="font-medium text-amber-400">Free Apollo plan detected</p>
          <p className="mt-1">{capabilities.summary}</p>
          <ol className="mt-2 list-decimal list-inside space-y-1 text-amber-100/90">
            <li>Upload companies.csv with <code className="text-xs">company_name,domain</code></li>
            <li>Run <strong>Company Intel</strong> (automated — works on free plan)</li>
            <li>Find recruiter in Apollo UI → add on <a href="/review" className="underline">Review</a></li>
            <li>Send role-specific email via <a href="/send" className="underline">Send</a></li>
          </ol>
        </div>
      )}

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Companies from CSV</p>
          <p className="text-3xl font-semibold text-white mt-1">{companies.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Contacts stored</p>
          <p className="text-3xl font-semibold text-white mt-1">{contacts.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Credits used (run)</p>
          <p className="text-3xl font-semibold text-amber-400 mt-1">
            {apolloCreditsUsed !== null ? apolloCreditsUsed : "—"}
          </p>
          <p className="text-xs text-gray-600 mt-1">of 75/mo free tier</p>
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

      {companyIntel.length > 0 && (
        <Card title="Company Intel Queue (automated)" className="mb-8">
          <p className="px-6 pt-4 text-xs text-gray-500">
            Prioritize companies hiring SDE / backend / MLE roles. Paste recruiter contacts from Apollo UI into Review.
          </p>
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Company</th>
                  <th>Domain</th>
                  <th>Industry</th>
                  <th>Employees</th>
                  <th>SDE</th>
                  <th>Backend</th>
                  <th>MLE</th>
                  <th>Open Roles</th>
                </tr>
              </thead>
              <tbody>
                {companyIntel.map((row) => (
                  <tr key={row.company_name}>
                    <td className="font-semibold text-emerald-400">{row.hiring_score}</td>
                    <td className="font-medium">{row.company_name}</td>
                    <td className="text-xs text-gray-400">{row.domain}</td>
                    <td className="text-xs text-gray-400">{row.industry || "—"}</td>
                    <td>{row.employee_count || "—"}</td>
                    <td>{row.sde_roles_open}</td>
                    <td>{row.backend_roles_open}</td>
                    <td>{row.mle_roles_open}</td>
                    <td className="text-xs text-gray-400 max-w-xs">{row.matched_job_titles || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {intelProgress.length > 0 && (
        <Card title="Company Intel Progress" className="mb-8">
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Relevant roles</th>
                  <th>Hiring score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {intelProgress.map((p) => (
                  <tr key={p.company}>
                    <td className="font-medium">{p.company}</td>
                    <td>{p.relevantRoles}</td>
                    <td className="text-emerald-400 font-medium">{p.hiringScore}</td>
                    <td className="text-xs text-red-400">{p.error ?? "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {summary && contacts.length > 0 && (
        <Card title="Discovery Summary" className="mb-8">
          <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-500">Companies Processed</p>
              <p className="text-2xl font-semibold text-white">{summary.companiesProcessed}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Contacts Found</p>
              <p className="text-2xl font-semibold text-white">{summary.contactsFound}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Recruiters</p>
              <p className="text-2xl font-semibold text-white">{summary.recruiters}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Managers</p>
              <p className="text-2xl font-semibold text-white">{summary.managers}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Team Leads</p>
              <p className="text-2xl font-semibold text-white">{summary.leads}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Directors</p>
              <p className="text-2xl font-semibold text-white">{summary.directors}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Emails Available</p>
              <p className="text-2xl font-semibold text-emerald-400">{summary.emailsAvailable}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Hiring Backend</p>
              <p className="text-2xl font-semibold text-amber-400">{summary.companiesHiringBackend}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Hiring SDE</p>
              <p className="text-2xl font-semibold text-amber-400">{summary.companiesHiringSde}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Generic Emails</p>
              <p className="text-2xl font-semibold text-red-400">{summary.genericEmails}</p>
            </div>
          </div>
        </Card>
      )}

      {contacts.length > 0 && (
        <Card title="Company Overview" className="mb-8">
          <div className="overflow-x-auto scrollbar-thin">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contacts</th>
                  <th>Recruiters</th>
                  <th>Managers</th>
                  <th>Directors</th>
                  <th>Emails</th>
                  <th>Hiring</th>
                  <th>Matched Role</th>
                </tr>
              </thead>
              <tbody>
                {buildCompanyRollups(contacts).map((rollup) => (
                  <tr key={rollup.company_name}>
                    <td className="font-medium">{rollup.company_name}</td>
                    <td>{rollup.contactCount}</td>
                    <td>{rollup.recruiters}</td>
                    <td>{rollup.managers}</td>
                    <td>{rollup.directors}</td>
                    <td>{rollup.emailsAvailable}</td>
                    <td>
                      {rollup.matchingRoleFound ? (
                        <Badge variant="success">YES</Badge>
                      ) : (
                        <Badge variant="neutral">NO</Badge>
                      )}
                    </td>
                    <td className="text-gray-400 text-xs">{rollup.matchedJobTitle || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
            <p className="text-xs text-gray-500 mb-2">Pipeline:</p>
            <p className="text-sm text-gray-400 mb-3">
              organizations/enrich (free) → job_postings (1 credit) → <span className="text-emerald-400">people/match primary</span> (1 credit/email) → fallback: People API Search + contacts/search → score
            </p>
            <p className="text-xs text-gray-500 mb-1">Credit budget: 75/month free. Set <code className="text-xs text-gray-300">APOLLO_CREDIT_LIMIT</code> in .env to adjust.</p>
            <p className="text-xs text-gray-500 mb-2">Target titles filtered:</p>
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
                {c.domain ? `${c.company_name} (${c.domain})` : c.company_name}
              </Badge>
            ))}
          </div>
          <p className="px-6 pb-4 text-xs text-gray-500">
            Format: company_name,domain — e.g. CoinDCX,coindcx.com
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
                  <th>Found</th>
                  <th title="people/match primary path">Match</th>
                  <th title="mixed_people/api_search fallback">Search</th>
                  <th title="contacts/search fallback">CRM</th>
                  <th>With email</th>
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
                    <td className="text-emerald-400 font-medium">{p.fromPeopleMatch || "—"}</td>
                    <td className="text-gray-400">{p.fromPeopleSearch || "—"}</td>
                    <td className="text-gray-400">{p.fromContactsSearch || "—"}</td>
                    <td>{p.withEmail}</td>
                    <td className="text-emerald-400 font-medium">{p.saved}</td>
                    <td className="text-amber-400">{p.apolloCreditsUsed || "—"}</td>
                    <td>
                      {p.hiringMatch ? (
                        <span className="text-emerald-400" title={p.matchedJobTitle}>
                          YES
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
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
                    <th>Score</th>
                    <th>Company</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Email</th>
                    <th>LinkedIn</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Hiring</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={`${c.email}-${c.person_name}-${i}`}>
                      <td className="font-semibold text-emerald-400">{c.contact_score || "0"}</td>
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
                      <td className="text-xs text-gray-500">{c.source || "—"}</td>
                      <td className="text-xs">
                        {c.matching_role_found === "YES" ? (
                          <span className="text-emerald-400">{c.matched_job_title || "YES"}</span>
                        ) : (
                          "—"
                        )}
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
