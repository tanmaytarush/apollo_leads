import type { Company, Contact } from "./csv";
import { apolloFetch } from "./apollo-client";
import { applyScoring, matchJobPostings, type JobMatchContext } from "./scoring";

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

// Title priority for people/match — recruiter-first, engineer as last resort
const MATCH_TITLE_PRIORITY = [
  "talent acquisition",
  "recruiter",
  "technical recruiter",
  "hr",
  "engineering manager",
  "tech lead",
  "senior software engineer",
];

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  contact_emails?: Array<{ email: string; email_status?: string; email_true_status?: string }>;
  organization?: { name?: string };
  has_email?: boolean;
}

interface RawCandidate {
  person: ApolloPerson;
  source: string;
}

interface ApolloOrganization {
  id?: string;
  name?: string;
  primary_domain?: string;
  website_url?: string;
}

interface OrgInfo {
  id: string;
  name: string;
  domain: string;
}

function inferContactType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("technical recruiter")) return "Recruiter";
  if (t.includes("talent acquisition")) return "Recruiter";
  if (t.includes("recruiter")) return "Recruiter";
  if (t.includes("director") && t.includes("eng")) return "Director";
  if (t.includes("hiring manager")) return "Manager";
  if (t.includes("engineering manager")) return "Manager";
  if (t.includes("team lead")) return "Manager";
  return "Manager";
}

function buildPersonName(person: ApolloPerson): string {
  const first = person.first_name ?? "";
  let last = person.last_name ?? "";

  if (!last && person.last_name_obfuscated) {
    last = person.last_name_obfuscated.replace(/\*/g, "").trim();
  }

  return `${first} ${last}`.trim();
}

function matchesTargetTitle(title: string): boolean {
  const t = title.toLowerCase();
  if (
    /recruiter|talent acquisition|engineering manager|hiring manager|team lead|director.*eng|software engineering manager|backend engineering manager/.test(
      t
    )
  ) {
    return true;
  }
  return TARGET_TITLES.some((target) => t.includes(target.toLowerCase()));
}

function extractDomain(org: ApolloOrganization): string {
  if (org.primary_domain) return org.primary_domain.trim();
  if (org.website_url) {
    try {
      const url = org.website_url.startsWith("http")
        ? org.website_url
        : `https://${org.website_url}`;
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return org.website_url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ?? "";
    }
  }
  return "";
}

function personDedupeKey(person: ApolloPerson, companyName: string): string {
  if (person.id) return person.id;
  const name = buildPersonName(person).toLowerCase();
  const linkedin = (person.linkedin_url ?? "").toLowerCase();
  return `${companyName.toLowerCase()}|${name}|${linkedin}`;
}

async function enrichOrganizationByDomain(domain: string): Promise<OrgInfo | null> {
  try {
    const data = await apolloFetch<{ organization?: ApolloOrganization }>(
      `/organizations/enrich?domain=${encodeURIComponent(domain)}`,
      { method: "GET" }
    );
    const org = data.organization;
    if (!org) return null;
    return {
      id: org.id ?? "",
      name: org.name ?? "",
      domain: extractDomain(org) || domain,
    };
  } catch {
    return null;
  }
}

async function searchOrganization(companyName: string): Promise<OrgInfo | null> {
  try {
    const params = new URLSearchParams();
    params.set("q_organization_name", companyName);
    params.set("per_page", "5");
    params.set("page", "1");

    const data = await apolloFetch<{ organizations?: ApolloOrganization[] }>(
      `/mixed_companies/search?${params.toString()}`,
      { method: "POST", body: JSON.stringify({}) }
    );

    const orgs = data.organizations ?? [];
    if (orgs.length === 0) return null;

    const normalized = companyName.toLowerCase();
    const exact =
      orgs.find((org) => (org.name ?? "").toLowerCase() === normalized) ?? orgs[0];

    const domain = extractDomain(exact);
    if (!exact.id && !domain) return null;

    return {
      id: exact.id ?? "",
      name: exact.name ?? companyName,
      domain,
    };
  } catch {
    return null;
  }
}

async function resolveOrganization(company: Company): Promise<OrgInfo | null> {
  const domain = company.domain.trim();
  if (domain) {
    const fromEnrich = await enrichOrganizationByDomain(domain);
    if (fromEnrich) return fromEnrich;
  }
  return searchOrganization(company.company_name);
}

interface ApolloSearchResponse {
  people?: ApolloPerson[];
  total_entries?: number;
}

async function searchPeopleApiSearch(
  companyName: string,
  domain?: string
): Promise<RawCandidate[]> {
  const perPage = 25;
  const maxPages = 20;
  const all: RawCandidate[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams();
    TARGET_TITLES.forEach((title) => params.append("person_titles[]", title));
    params.append("include_similar_titles", "true");
    params.append("q_organization_name", companyName);
    if (domain) params.append("q_organization_domains_list[]", domain);
    params.append("per_page", String(perPage));
    params.append("page", String(page));

    const data = await apolloFetch<ApolloSearchResponse>(
      `/mixed_people/api_search?${params.toString()}`,
      { method: "POST", body: JSON.stringify({}) }
    );

    const people = data.people ?? [];
    for (const person of people) {
      if (!matchesTargetTitle(person.title ?? "")) continue;
      all.push({ person, source: "api_search" });
    }

    if (people.length < perPage) break;
    if (typeof data.total_entries === "number" && page * perPage >= data.total_entries) {
      break;
    }
    await delay(200);
  }

  return all;
}

async function fetchContactsSearch(
  companyName: string,
  _orgId?: string
): Promise<RawCandidate[]> {
  const perPage = 25;
  const maxPages = 3;
  const all: RawCandidate[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await apolloFetch<{ contacts?: ApolloPerson[] }>(
      "/contacts/search",
      {
        method: "POST",
        body: JSON.stringify({
          q_keywords: companyName,
          per_page: perPage,
          page,
        }),
      }
    );

    const batch = data.contacts ?? [];
    for (const person of batch) {
      // contacts/search returns the user's own CRM — include all, no title filter
      // Backfill email from contact_emails array when top-level email is absent
      const emailFromList = person.contact_emails?.find(
        (e) => e.email && (e.email_true_status === "Verified" || e.email_status === "verified")
      )?.email ?? person.contact_emails?.[0]?.email;
      if (!person.email && emailFromList) {
        (person as ApolloPerson).email = emailFromList;
      }
      all.push({ person, source: "contacts_search" });
    }

    if (batch.length < perPage) break;
    await delay(200);
  }

  return all;
}

async function fetchJobPostingTitles(orgId: string): Promise<string[]> {
  if (!orgId) return [];
  try {
    const data = await apolloFetch<{
      organization_job_postings?: Array<{ title?: string }>;
      job_postings?: Array<{ title?: string }>;
    }>(`/organizations/${orgId}/job_postings`, { method: "GET" });

    const postings =
      data.organization_job_postings ?? data.job_postings ?? [];
    return postings.map((job) => (job.title ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Primary contact discovery — POST /people/match with org_id + title priority loop.
// Costs 1 credit only when email is returned. Returns null if no email found.
async function matchPersonByTitle(
  orgId: string,
  titlePriority: string[] = MATCH_TITLE_PRIORITY
): Promise<{ person: ApolloPerson; creditsUsed: number } | null> {
  let creditsUsed = 0;

  for (const title of titlePriority) {
    try {
      const data = await apolloFetch<{ person?: ApolloPerson }>(
        "/people/match",
        {
          method: "POST",
          body: JSON.stringify({
            organization_id: orgId,
            title,
            reveal_personal_emails: false,
            reveal_phone_number: false,
          }),
        }
      );

      const person = data.person;
      if (person?.email) {
        creditsUsed++;
        return { person, creditsUsed };
      }
      // No email returned → no credit charged, try next title
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("(403)")) break;
      // 422 = unprocessable for this title → try next
    }
    await delay(200);
  }

  return null;
}

// Batch contact discovery — POST /people/bulk_match, up to 10 org_ids per call.
// Costs 1 credit per person returned with email.
export async function bulkMatchPeople(
  orgIds: string[],
  title = "recruiter"
): Promise<Array<{ orgId: string; person: ApolloPerson | null }>> {
  const results: Array<{ orgId: string; person: ApolloPerson | null }> = [];

  for (let i = 0; i < orgIds.length; i += 10) {
    const batch = orgIds.slice(i, i + 10);
    try {
      const data = await apolloFetch<{ matches?: Array<{ person?: ApolloPerson }> }>(
        "/people/bulk_match",
        {
          method: "POST",
          body: JSON.stringify({
            details: batch.map((orgId) => ({ organization_id: orgId, title })),
            reveal_personal_emails: false,
          }),
        }
      );

      const matches = data.matches ?? [];
      batch.forEach((orgId, j) => {
        results.push({ orgId, person: matches[j]?.person ?? null });
      });
    } catch {
      batch.forEach((orgId) => results.push({ orgId, person: null }));
    }

    if (i + 10 < orgIds.length) await delay(300);
  }

  return results;
}

async function enrichPersonEmail(
  personId: string,
  org?: OrgInfo | null
): Promise<{ person: ApolloPerson | null; error?: string; creditsUsed: number }> {
  try {
    const params = new URLSearchParams();
    params.set("id", personId);
    params.set("reveal_personal_emails", "true");
    params.set("run_waterfall_email", "false");
    params.set("run_waterfall_phone", "false");
    params.set("reveal_phone_number", "false");
    if (org?.domain) params.set("domain", org.domain);
    if (org?.name) params.set("organization_name", org.name);

    const data = await apolloFetch<{ person?: ApolloPerson }>(
      `/people/match?${params.toString()}`,
      { method: "POST", body: JSON.stringify({}) }
    );
    const person = data.person ?? null;
    return { person, creditsUsed: person?.email ? 1 : 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enrichment failed";
    return { person: null, error: message, creditsUsed: 0 };
  }
}

function mergeSourceLabels(a: string, b: string): string {
  const parts = new Set(
    `${a}+${b}`
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return Array.from(parts).join("+");
}

function mergeCandidates(candidates: RawCandidate[]): RawCandidate[] {
  const map = new Map<string, RawCandidate>();

  for (const candidate of candidates) {
    const key = personDedupeKey(candidate.person, "");
    const prev = map.get(key);
    if (!prev) {
      map.set(key, candidate);
      continue;
    }

    const mergedPerson: ApolloPerson = {
      ...prev.person,
      ...candidate.person,
      email: prev.person.email || candidate.person.email,
      linkedin_url: prev.person.linkedin_url || candidate.person.linkedin_url,
      title: prev.person.title || candidate.person.title,
    };

    map.set(key, {
      person: mergedPerson,
      source: mergeSourceLabels(prev.source, candidate.source),
    });
  }

  return Array.from(map.values());
}

function toContact(
  candidate: RawCandidate,
  companyName: string,
  email: string,
  jobContext: JobMatchContext
): Contact | null {
  const person = candidate.person;
  const name = buildPersonName(person);
  const title = person.title ?? "";
  const linkedin = person.linkedin_url ?? "";
  const source = candidate.source;

  if (!name && !linkedin) return null;

  const base: Contact = {
    company_name: companyName,
    person_name: name,
    designation: title,
    email,
    linkedin_url: linkedin,
    contact_type: inferContactType(title),
    source,
    contact_score: "0",
    matching_role_found: jobContext.matchingRoleFound ? "YES" : "NO",
    matched_job_title: jobContext.matchedJobTitle,
    email_quality: "missing",
    send_email: "NO",
    special_mail: "NO",
    status: "PENDING",
    notes: "",
  };

  return applyScoring(base, jobContext);
}

export interface DiscoveryProgress {
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

export interface DiscoveryResult {
  contacts: Contact[];
  progress: DiscoveryProgress[];
  errors: string[];
  warnings: string[];
  apolloCreditsUsed: number;
}

export async function discoverRecruiters(
  companies: Company[],
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<DiscoveryResult> {
  const allContacts: Contact[] = [];
  const progress: DiscoveryProgress[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const globalSeen = new Set<string>();
  let sawFreePlanBlock = false;
  let totalCreditsUsed = 0;
  const CREDIT_LIMIT = parseInt(process.env.APOLLO_CREDIT_LIMIT ?? "75", 10);

  for (const company of companies) {
    const companyName = company.company_name;
    const companyProgress: DiscoveryProgress = {
      company: companyName,
      found: 0,
      withEmail: 0,
      saved: 0,
      fromPeopleSearch: 0,
      fromContactsSearch: 0,
      fromPeopleMatch: 0,
      hiringMatch: false,
      matchedJobTitle: "",
      apolloCreditsUsed: 0,
    };

    if (totalCreditsUsed >= CREDIT_LIMIT) {
      warnings.push(
        `Apollo credit limit (${CREDIT_LIMIT}) reached — stopped before processing ${companyName}. Increase APOLLO_CREDIT_LIMIT in .env to continue.`
      );
      progress.push(companyProgress);
      onProgress?.(companyProgress);
      break;
    }

    try {
      const org = await resolveOrganization(company);

      let jobContext: JobMatchContext = {
        matchingRoleFound: false,
        matchedJobTitle: "",
        matchedJobTitles: [],
        backendRoleOpen: false,
        sdeRoleOpen: false,
        mleRoleOpen: false,
      };

      if (org?.id && totalCreditsUsed < CREDIT_LIMIT) {
        const jobTitles = await fetchJobPostingTitles(org.id);
        totalCreditsUsed++;
        companyProgress.apolloCreditsUsed++;
        jobContext = matchJobPostings(jobTitles);
        companyProgress.hiringMatch = jobContext.matchingRoleFound;
        companyProgress.matchedJobTitle = jobContext.matchedJobTitle;
        await delay(150);
      }

      const candidates: RawCandidate[] = [];
      const sourceErrors: string[] = [];

      // PRIMARY: people/match with title priority — works on free plan, 1 credit per email returned
      if (org?.id && totalCreditsUsed < CREDIT_LIMIT) {
        try {
          const matchResult = await matchPersonByTitle(org.id);
          if (matchResult) {
            totalCreditsUsed += matchResult.creditsUsed;
            companyProgress.apolloCreditsUsed += matchResult.creditsUsed;
            candidates.push({ person: matchResult.person, source: "apollo_match" });
            companyProgress.fromPeopleMatch++;
          }
        } catch (err) {
          sourceErrors.push(
            `apollo_match: ${err instanceof Error ? err.message.slice(0, 100) : "failed"}`
          );
        }
        await delay(200);
      }

      // FALLBACK: people API search + contacts search (runs only if match returned nothing)
      if (candidates.length === 0) {
        try {
          const people = await searchPeopleApiSearch(
            companyName,
            org?.domain || company.domain || undefined
          );
          candidates.push(...people);
          companyProgress.fromPeopleSearch = people.length;
          await delay(200);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "failed";
          if (msg.includes("free plan") || msg.includes("API_INACCESSIBLE")) {
            sawFreePlanBlock = true;
          }
          sourceErrors.push(`api_search: ${msg.slice(0, 100)}`);
        }

        try {
          const contactsSearch = await fetchContactsSearch(companyName);
          candidates.push(...contactsSearch);
          companyProgress.fromContactsSearch = contactsSearch.length;
          await delay(200);
        } catch (err) {
          sourceErrors.push(
            `contacts_search: ${err instanceof Error ? err.message.slice(0, 80) : "failed"}`
          );
        }
      }

      if (candidates.length === 0 && sourceErrors.length > 0) {
        errors.push(`${companyName}: ${sourceErrors.join("; ")}`);
      }

      const merged = mergeCandidates(candidates);
      companyProgress.found = merged.length;

      for (const candidate of merged) {
        const dedupeKey = personDedupeKey(candidate.person, companyName);
        if (globalSeen.has(dedupeKey)) continue;
        globalSeen.add(dedupeKey);

        let email = (candidate.person.email ?? "").trim();

        // Enrich email for people found via search (not needed for apollo_match — already has email)
        if (
          !email &&
          candidate.source !== "apollo_match" &&
          candidate.person.id &&
          candidate.person.has_email !== false &&
          totalCreditsUsed < CREDIT_LIMIT
        ) {
          const enriched = await enrichPersonEmail(candidate.person.id, org);
          if (enriched.creditsUsed) {
            totalCreditsUsed += enriched.creditsUsed;
            companyProgress.apolloCreditsUsed += enriched.creditsUsed;
          }
          if (enriched.person?.email) {
            email = enriched.person.email.trim();
          } else if (enriched.error && !warnings.includes(enriched.error)) {
            warnings.push(
              `Apollo enrichment blocked or failed: ${enriched.error.slice(0, 120)}`
            );
          }
          await delay(200);
        }

        if (email) companyProgress.withEmail += 1;

        const contact = toContact(candidate, companyName, email, jobContext);

        if (contact) {
          allContacts.push(contact);
          companyProgress.saved += 1;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${companyName}: ${msg}`);
    }

    progress.push(companyProgress);
    onProgress?.(companyProgress);
    await delay(300);
  }

  if (sawFreePlanBlock) {
    warnings.push(
      "Apollo free plan: People API Search is blocked. people/match (primary path) works — ensure companies.csv has domain column for org enrich."
    );
  }

  if (allContacts.length === 0 && companies.length > 0) {
    warnings.push(
      "No contacts found. Flow: organizations/enrich → people/match (primary, costs 1 credit/email) → People API Search (fallback, blocked on free plan)."
    );
  }

  const withoutEmail = allContacts.filter((c) => !c.email).length;
  if (withoutEmail > 0) {
    warnings.push(
      `${withoutEmail} contact(s) have no email from Apollo. Add emails manually on the Review page.`
    );
  }

  if (totalCreditsUsed > 0) {
    warnings.push(
      `Apollo credits used this run: ${totalCreditsUsed}. Remaining budget: ~${Math.max(0, CREDIT_LIMIT - totalCreditsUsed)} of ${CREDIT_LIMIT} monthly. Set APOLLO_CREDIT_LIMIT in .env to adjust.`
    );
  }

  return { contacts: allContacts, progress, errors, warnings, apolloCreditsUsed: totalCreditsUsed };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testApolloConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { probeApolloCapabilities } = await import("./apollo-capabilities");
  const caps = await probeApolloCapabilities();
  const ok = caps.orgEnrich || caps.peopleSearch || caps.peopleMatch;
  return { ok, error: ok ? undefined : caps.summary };
}

export { TARGET_TITLES, MATCH_TITLE_PRIORITY };
