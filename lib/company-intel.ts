import fs from "fs/promises";
import path from "path";
import Papa from "papaparse";
import { apolloFetch } from "./apollo-client";
import type { Company } from "./csv";
import { computeHiringScore, matchJobPostings } from "./scoring";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const INTEL_PATH = path.join(DATA_DIR, "company_intel.csv");

export interface CompanyIntel {
  company_name: string;
  domain: string;
  org_id: string;
  industry: string;
  employee_count: string;
  relevant_roles_found: string;
  matched_job_titles: string;
  sde_roles_open: string;
  backend_roles_open: string;
  mle_roles_open: string;
  hiring_score: string;
  intel_updated: string;
  outreach_status: string;
  notes: string;
}

export const COMPANY_INTEL_COLUMNS: (keyof CompanyIntel)[] = [
  "company_name",
  "domain",
  "org_id",
  "industry",
  "employee_count",
  "relevant_roles_found",
  "matched_job_titles",
  "sde_roles_open",
  "backend_roles_open",
  "mle_roles_open",
  "hiring_score",
  "intel_updated",
  "outreach_status",
  "notes",
];

interface ApolloOrganization {
  id?: string;
  name?: string;
  primary_domain?: string;
  website_url?: string;
  industry?: string;
  estimated_num_employees?: number;
}

export interface CompanyIntelProgress {
  company: string;
  domain: string;
  orgId: string;
  jobCount: number;
  relevantRoles: number;
  hiringScore: number;
  error?: string;
}

export interface CompanyIntelResult {
  intel: CompanyIntel[];
  progress: CompanyIntelProgress[];
  errors: string[];
  warnings: string[];
}

function normalizeIntel(row: Partial<CompanyIntel>): CompanyIntel {
  return {
    company_name: (row.company_name ?? "").trim(),
    domain: (row.domain ?? "").trim(),
    org_id: (row.org_id ?? "").trim(),
    industry: (row.industry ?? "").trim(),
    employee_count: (row.employee_count ?? "").trim(),
    relevant_roles_found: (row.relevant_roles_found ?? "NO").trim().toUpperCase() === "YES" ? "YES" : "NO",
    matched_job_titles: (row.matched_job_titles ?? "").trim(),
    sde_roles_open: (row.sde_roles_open ?? "NO").trim().toUpperCase() === "YES" ? "YES" : "NO",
    backend_roles_open: (row.backend_roles_open ?? "NO").trim().toUpperCase() === "YES" ? "YES" : "NO",
    mle_roles_open: (row.mle_roles_open ?? "NO").trim().toUpperCase() === "YES" ? "YES" : "NO",
    hiring_score: (row.hiring_score ?? "0").trim(),
    intel_updated: (row.intel_updated ?? "").trim(),
    outreach_status: (row.outreach_status ?? "ACTIVE").trim().toUpperCase(),
    notes: (row.notes ?? "").trim(),
  };
}

function intelToCsv(rows: CompanyIntel[]): string {
  return Papa.unparse(rows, { columns: COMPANY_INTEL_COLUMNS });
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function extractDomain(org: ApolloOrganization, fallback = ""): string {
  if (org.primary_domain) return org.primary_domain.trim();
  if (org.website_url) {
    try {
      const url = org.website_url.startsWith("http")
        ? org.website_url
        : `https://${org.website_url}`;
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return org.website_url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ?? fallback;
    }
  }
  return fallback;
}

async function enrichOrganization(domain: string): Promise<ApolloOrganization | null> {
  try {
    const data = await apolloFetch<{ organization?: ApolloOrganization }>(
      `/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { method: "GET" }
    );
    return data.organization ?? null;
  } catch {
    return null;
  }
}

async function fetchJobPostingTitles(orgId: string): Promise<string[]> {
  if (!orgId) return [];
  try {
    const data = await apolloFetch<{
      organization_job_postings?: Array<{ title?: string }>;
      job_postings?: Array<{ title?: string }>;
    }>(`/organizations/${orgId}/job_postings`, { method: "GET" });

    const postings = data.organization_job_postings ?? data.job_postings ?? [];
    return postings.map((job) => (job.title ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mergeIntel(existing: CompanyIntel, incoming: CompanyIntel): CompanyIntel {
  return {
    ...incoming,
    outreach_status: existing.outreach_status || incoming.outreach_status,
    notes: existing.notes || incoming.notes,
  };
}

export async function readCompanyIntel(): Promise<CompanyIntel[]> {
  await ensureDataDir();
  try {
    await fs.access(INTEL_PATH);
  } catch {
    return [];
  }

  const content = await fs.readFile(INTEL_PATH, "utf-8");
  if (!content.trim()) return [];

  const rows = Papa.parse<Partial<CompanyIntel>>(content, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
    transformHeader: (h) => h.trim(),
  }).data;

  return rows.map(normalizeIntel).filter((r) => r.company_name);
}

export async function writeCompanyIntel(rows: CompanyIntel[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(INTEL_PATH, intelToCsv(rows.map(normalizeIntel)), "utf-8");
}

export async function mergeCompanyIntel(incoming: CompanyIntel[]): Promise<CompanyIntel[]> {
  const existing = await readCompanyIntel();
  const map = new Map<string, CompanyIntel>();

  for (const row of existing) {
    map.set(row.company_name.toLowerCase(), row);
  }
  for (const row of incoming.map(normalizeIntel)) {
    const prev = map.get(row.company_name.toLowerCase());
    map.set(row.company_name.toLowerCase(), prev ? mergeIntel(prev, row) : row);
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => Number(b.hiring_score || 0) - Number(a.hiring_score || 0)
  );
  await writeCompanyIntel(merged);
  return merged;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function discoverCompanyIntel(
  companies: Company[]
): Promise<CompanyIntelResult> {
  const intelRows: CompanyIntel[] = [];
  const progress: CompanyIntelProgress[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const company of companies) {
    const domain = company.domain.trim();
    const entry: CompanyIntelProgress = {
      company: company.company_name,
      domain,
      orgId: "",
      jobCount: 0,
      relevantRoles: 0,
      hiringScore: 0,
    };

    if (!domain) {
      entry.error = "Missing domain — add domain column to companies.csv (e.g. coindcx.com)";
      errors.push(`${company.company_name}: ${entry.error}`);
      progress.push(entry);
      continue;
    }

    try {
      const org = await enrichOrganization(domain);
      if (!org?.id) {
        entry.error = "organizations/enrich returned no org id";
        errors.push(`${company.company_name}: ${entry.error}`);
        progress.push(entry);
        await delay(200);
        continue;
      }

      entry.orgId = org.id;
      entry.domain = extractDomain(org, domain);

      const jobTitles = await fetchJobPostingTitles(org.id);
      entry.jobCount = jobTitles.length;

      const jobContext = matchJobPostings(jobTitles);
      entry.relevantRoles = jobContext.matchedJobTitles.length;
      entry.hiringScore = computeHiringScore(jobContext);

      intelRows.push({
        company_name: company.company_name,
        domain: entry.domain,
        org_id: org.id,
        industry: org.industry ?? "",
        employee_count:
          typeof org.estimated_num_employees === "number"
            ? String(org.estimated_num_employees)
            : "",
        relevant_roles_found: jobContext.matchingRoleFound ? "YES" : "NO",
        matched_job_titles: jobContext.matchedJobTitles.join(" | "),
        sde_roles_open: jobContext.sdeRoleOpen ? "YES" : "NO",
        backend_roles_open: jobContext.backendRoleOpen ? "YES" : "NO",
        mle_roles_open: jobContext.mleRoleOpen ? "YES" : "NO",
        hiring_score: String(entry.hiringScore),
        intel_updated: new Date().toISOString(),
        outreach_status: "ACTIVE",
        notes: "",
      });
    } catch (err) {
      entry.error = err instanceof Error ? err.message.slice(0, 120) : "Failed";
      errors.push(`${company.company_name}: ${entry.error}`);
    }

    progress.push(entry);
    await delay(250);
  }

  if (intelRows.length === 0 && companies.length > 0) {
    warnings.push(
      "No company intel saved. Ensure companies.csv has domain column (company_name,domain)."
    );
  }

  warnings.push(
    "Next: find recruiters in Apollo UI → paste name + email on Review page → send with role-specific template."
  );

  return { intel: intelRows, progress, errors, warnings };
}
