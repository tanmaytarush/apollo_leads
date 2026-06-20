import type { Contact } from "./csv";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

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

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  organization?: { name?: string };
  has_email?: boolean;
}

interface ApolloSearchResponse {
  people?: ApolloPerson[];
  total_entries?: number;
}

interface ApolloMatchResponse {
  person?: ApolloPerson;
}

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error("APOLLO_API_KEY is not set in environment variables");
  }
  return key;
}

async function apolloFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${APOLLO_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": getApiKey(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apollo API error (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
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

async function searchPeopleAtCompanyPage(
  companyName: string,
  page: number,
  perPage: number
): Promise<ApolloSearchResponse> {
  const params = new URLSearchParams();
  TARGET_TITLES.forEach((title) => params.append("person_titles[]", title));
  params.append("q_organization_name", companyName);
  params.append("include_similar_titles", "true");
  params.append("per_page", String(perPage));
  params.append("page", String(page));

  return apolloFetch<ApolloSearchResponse>(
    `/mixed_people/api_search?${params.toString()}`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

async function searchPeopleAtCompany(companyName: string): Promise<ApolloPerson[]> {
  const perPage = 25;
  const maxPages = 20;
  const allPeople: ApolloPerson[] = [];
  let page = 1;
  let totalEntries = Infinity;

  while (page <= maxPages) {
    const data = await searchPeopleAtCompanyPage(companyName, page, perPage);
    const people = data.people ?? [];
    allPeople.push(...people);

    if (typeof data.total_entries === "number") {
      totalEntries = data.total_entries;
    }

    if (people.length < perPage) break;
    if (page * perPage >= totalEntries) break;

    page += 1;
    await delay(200);
  }

  return allPeople;
}

async function enrichPerson(personId: string): Promise<ApolloPerson | null> {
  try {
    const data = await apolloFetch<ApolloMatchResponse>("/people/match", {
      method: "POST",
      body: JSON.stringify({
        id: personId,
        reveal_personal_emails: true,
      }),
    });
    return data.person ?? null;
  } catch {
    return null;
  }
}

function toContact(
  person: ApolloPerson,
  companyName: string,
  email: string
): Contact | null {
  const name = buildPersonName(person);
  const title = person.title ?? "";
  const linkedin = person.linkedin_url ?? "";

  if (!name && !linkedin) return null;

  return {
    company_name: companyName,
    person_name: name,
    designation: title,
    linkedin_url: linkedin,
    email,
    contact_type: inferContactType(title),
    send_email: "NO",
    special_mail: "NO",
    status: "PENDING",
    notes: "",
  };
}

export interface DiscoveryProgress {
  company: string;
  found: number;
  withEmail: number;
  saved: number;
}

export interface DiscoveryResult {
  contacts: Contact[];
  progress: DiscoveryProgress[];
  errors: string[];
  warnings: string[];
}

export async function discoverRecruiters(
  companies: string[],
  onProgress?: (progress: DiscoveryProgress) => void
): Promise<DiscoveryResult> {
  const allContacts: Contact[] = [];
  const progress: DiscoveryProgress[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const company of companies) {
    const companyProgress: DiscoveryProgress = {
      company,
      found: 0,
      withEmail: 0,
      saved: 0,
    };

    try {
      const people = await searchPeopleAtCompany(company);
      companyProgress.found = people.length;

      for (const person of people) {
        if (!person.id || seenIds.has(person.id)) continue;
        seenIds.add(person.id);

        let email = (person.email ?? "").trim();

        if (!email && person.has_email !== false) {
          const match = await enrichPerson(person.id);
          if (match?.email) {
            email = match.email.trim();
            companyProgress.withEmail += 1;
          }
          await delay(200);
        } else if (email) {
          companyProgress.withEmail += 1;
        }

        const contact = toContact(person, company, email);
        if (contact) {
          allContacts.push(contact);
          companyProgress.saved += 1;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${company}: ${msg}`);
    }

    progress.push(companyProgress);
    onProgress?.(companyProgress);
    await delay(300);
  }

  if (allContacts.length === 0 && companies.length > 0) {
    warnings.push(
      "No contacts found. Check company names in companies.csv and your Apollo API key."
    );
  }

  const withoutEmail = allContacts.filter((c) => !c.email).length;
  if (withoutEmail > 0) {
    warnings.push(
      `${withoutEmail} contact(s) have no email from Apollo. Add emails manually on the Review page.`
    );
  }

  return { contacts: allContacts, progress, errors, warnings };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testApolloConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    getApiKey();
    const params = new URLSearchParams();
    params.append("person_titles[]", "Recruiter");
    params.append("per_page", "1");
    params.append("page", "1");

    await apolloFetch(`/mixed_people/api_search?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { ok: false, error: message };
  }
}

export { TARGET_TITLES };
