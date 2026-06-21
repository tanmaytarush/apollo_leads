import type { Company, Contact } from "./csv";
import { apolloFetch } from "./apollo-client";
import { hunterDomainSearch } from "./hunter";
import { applyScoring, matchJobPostings, type JobMatchContext } from "./scoring";

// Titles for api_search filter — SDE hiring managers only
const TARGET_TITLES = [
  "Technical Recruiter",
  "Engineering Recruiter",
  "Talent Acquisition",
  "Engineering Manager",
  "Software Engineering Manager",
  "Hiring Manager",
  "Backend Engineering Manager",
];

// Title priority for people/match — SDE hiring manager focused, no generic HR or engineers
const MATCH_TITLE_PRIORITY = [
  "technical recruiter",
  "engineering recruiter",
  "talent acquisition",
  "engineering manager",
  "software engineering manager",
  "hiring manager",
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
  const all: RawCandidate[] = [];

  // Build params exactly as Apollo docs show — no body, all filters in query string
  const params = new URLSearchParams();
  TARGET_TITLES.forEach((title) => params.append("person_titles[]", title));
  // organization_names[] is the correct filter for company name in api_search
  params.append("organization_names[]", companyName);
  if (domain) params.append("organization_domains[]", domain);
  params.append("per_page", "10");
  params.append("page", "1");

  // No body — matches the Apollo docs cURL example exactly
  const data = await apolloFetch<ApolloSearchResponse>(
    `/mixed_people/api_search?${params.toString()}`,
    { method: "POST" }
  );

  for (const person of data.people ?? []) {
    if (!matchesTargetTitle(person.title ?? "")) continue;
    all.push({ person, source: "api_search" });
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
// Costs 1 credit only when email is returned. Falls back to best no-email candidate.
async function matchPersonByTitle(
  orgId: string,
  domain?: string,
  titlePriority: string[] = MATCH_TITLE_PRIORITY
): Promise<{ person: ApolloPerson; creditsUsed: number } | null> {
  let creditsUsed = 0;
  let bestNoEmail: ApolloPerson | null = null;

  // Pass 1: try every title with organization_id
  // Pass 2: try every title with domain (only if pass 1 found nothing)
  const matchKeys: Array<Record<string, string>> = [{ organization_id: orgId }];
  if (domain) matchKeys.push({ domain });

  for (const matchKey of matchKeys) {
    for (const title of titlePriority) {
      try {
        const data = await apolloFetch<{ person?: ApolloPerson }>(
          "/people/match",
          {
            method: "POST",
            body: JSON.stringify({
              ...matchKey,
              title,
              reveal_personal_emails: false,
              reveal_phone_number: false,
              run_waterfall_phone: false,
            }),
          }
        );

        const person = data.person;
        if (person?.email) {
          creditsUsed++;
          return { person, creditsUsed };
        }
        if (person && !bestNoEmail) {
          bestNoEmail = person;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // 403 = endpoint blocked for this plan/key — stop all attempts
        if (msg.includes("(403)")) return bestNoEmail ? { person: bestNoEmail, creditsUsed: 0 } : null;
      }
      await delay(150);
    }
    // Found a no-email candidate in pass 1 — no need for pass 2
    if (bestNoEmail) break;
  }

  return bestNoEmail ? { person: bestNoEmail, creditsUsed: 0 } : null;
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
            reveal_phone_number: false,
            run_waterfall_phone: false,
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
    params.set("reveal_personal_emails", "false");
    params.set("run_waterfall_email", "true");
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
  options: {
    maxPerCompany?: number;
    onProgress?: (progress: DiscoveryProgress) => void;
  } = {}
): Promise<DiscoveryResult> {
  const allContacts: Contact[] = [];
  const progress: DiscoveryProgress[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const globalSeen = new Set<string>();
  let sawFreePlanBlock = false;
  let totalCreditsUsed = 0;
  const CREDIT_LIMIT = parseInt(process.env.APOLLO_CREDIT_LIMIT ?? "75", 10);
  // Cap contacts per company — UI value takes priority over env var
  const MAX_PER_COMPANY =
    options.maxPerCompany ?? parseInt(process.env.APOLLO_MAX_PER_COMPANY ?? "1", 10);

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
      options.onProgress?.(companyProgress);
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
          const matchResult = await matchPersonByTitle(
            org.id,
            org.domain || company.domain || undefined
          );
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

      // FALLBACK 1: api_search — free (no credits), org-filtered by name + domain
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
          const msg = err instanceof Error ? err.message : "";
          // 403 means this key doesn't have api_search scope — not an error, just limited plan
          if (!msg.includes("(403)")) {
            sourceErrors.push(`api_search: ${msg.slice(0, 100)}`);
          }
        }
      }

      // FALLBACK 2: contacts/search (CRM) — free, 0 credits, but only returns CRM contacts
      if (candidates.length === 0) {
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

      // FALLBACK 2: Hunter.io domain search — free tier, 25 searches/month
      if (candidates.length === 0 && (org?.domain || company.domain)) {
        try {
          const hunterDomain = org?.domain || company.domain;
          const hunterResults = await hunterDomainSearch(hunterDomain);
          for (const h of hunterResults) {
            if (!h.email) continue;
            candidates.push({
              person: {
                first_name: h.firstName || h.name.split(" ")[0],
                last_name: h.lastName || h.name.split(" ").slice(1).join(" "),
                email: h.email,
                title: h.title,
                linkedin_url: h.linkedin || undefined,
                has_email: true,
              },
              source: "hunter",
            });
          }
          if (hunterResults.length > 0) {
            companyProgress.fromContactsSearch += hunterResults.length;
          }
          await delay(200);
        } catch {
          // Hunter.io is optional — silent failure
        }
      }

      if (candidates.length === 0) {
        sawFreePlanBlock = true;
      }

      const merged = mergeCandidates(candidates);
      companyProgress.found = merged.length;

      // Sort: prefer candidates that already have an email (no enrichment credit needed)
      merged.sort((a, b) => {
        const aHas = a.person.email ? 1 : 0;
        const bHas = b.person.email ? 1 : 0;
        return bHas - aHas;
      });

      const toProcess = merged.slice(0, MAX_PER_COMPANY);

      for (const candidate of toProcess) {
        const dedupeKey = personDedupeKey(candidate.person, companyName);
        if (globalSeen.has(dedupeKey)) continue;
        globalSeen.add(dedupeKey);

        let email = (candidate.person.email ?? "").trim();

        // Try to reveal email for any candidate that doesn't have one yet
        if (
          !email &&
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
    options.onProgress?.(companyProgress);
    await delay(300);
  }

  if (sawFreePlanBlock) {
    const hasHunter = !!process.env.HUNTER_API_KEY;
    warnings.push(
      hasHunter
        ? "Apollo returned no contacts for one or more companies — Hunter.io fallback was used where available."
        : "Apollo returned no contacts for one or more companies. " +
          "Add HUNTER_API_KEY to .env to enable Hunter.io fallback (free, 25 searches/month at hunter.io), " +
          "or add contacts manually on the Review page."
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
      `Apollo credits used this run: ${totalCreditsUsed}. App cap remaining: ~${Math.max(0, CREDIT_LIMIT - totalCreditsUsed)} of ${CREDIT_LIMIT} (APOLLO_CREDIT_LIMIT). Free tier: up to ~10,000 email reveals/mo for corporate domains.`
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
  // contactsSearch works on free plan — sufficient for the fallback discovery path
  const ok = caps.orgEnrich || caps.peopleSearch || caps.peopleMatch || caps.contactsSearch;
  return { ok, error: ok ? undefined : caps.summary };
}

export { TARGET_TITLES, MATCH_TITLE_PRIORITY };
