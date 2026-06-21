import { getApiKey, probeEndpoint } from "./apollo-client";

let _cache: { result: ApolloCapabilities; expires: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export interface ApolloCapabilities {
  orgEnrich: boolean;
  jobPostings: boolean;
  peopleSearch: boolean;
  peopleMatch: boolean;
  orgSearch: boolean;
  contactsSearch: boolean;
  /** True when people/match or people search responds — show free-tier credit guidance */
  freePlan: boolean;
  discoveryAvailable: boolean;
  summary: string;
}

export async function probeApolloCapabilities(force = false): Promise<ApolloCapabilities> {
  if (!force && _cache && Date.now() < _cache.expires) {
    return _cache.result;
  }

  try {
    getApiKey();
  } catch {
    return {
      orgEnrich: false,
      jobPostings: false,
      peopleSearch: false,
      peopleMatch: false,
      orgSearch: false,
      contactsSearch: false,
      freePlan: false,
      discoveryAvailable: false,
      summary: "APOLLO_API_KEY not configured",
    };
  }

  const orgEnrich = await probeEndpoint(
    `/organizations/enrich?domain=${encodeURIComponent("apollo.io")}`,
    { method: "GET" }
  );

  let jobPostings = false;
  if (orgEnrich.ok && orgEnrich.data) {
    const orgId =
      (orgEnrich.data as { organization?: { id?: string } }).organization?.id ?? "";
    if (orgId) {
      const jobs = await probeEndpoint(`/organizations/${orgId}/job_postings`, {
        method: "GET",
      });
      jobPostings = jobs.ok;
    }
  }

  const peopleSearch = await probeEndpoint(
    "/mixed_people/api_search?person_titles[]=Recruiter&per_page=1&page=1",
    { method: "POST" }
  );

  const peopleMatch = await probeEndpoint(
    "/people/match?organization_name=Apollo&domain=apollo.io&reveal_personal_emails=false&run_waterfall_email=false&run_waterfall_phone=false&reveal_phone_number=false",
    { method: "POST", body: "{}" }
  );

  const orgSearch = await probeEndpoint(
    "/mixed_companies/search?q_organization_name=Apollo&per_page=1&page=1",
    { method: "POST", body: "{}" }
  );

  const contactsSearch = await probeEndpoint("/contacts/search", {
    method: "POST",
    body: JSON.stringify({ q_keywords: "recruiter", per_page: 1, page: 1 }),
  });

  const discoveryAvailable = peopleSearch.ok || peopleMatch.ok;

  let summary = "People discovery available via API";
  if (!orgEnrich.ok) {
    summary = "Apollo key invalid or unreachable";
  } else if (!discoveryAvailable) {
    const hardBlocked = [peopleSearch, peopleMatch].some((r) => r.freePlanBlocked);
    summary = hardBlocked
      ? "People API returned 403 — verify master API key scope in Apollo settings."
      : "People discovery unavailable — check API key and network.";
  } else {
    summary =
      "Discovery available. Free plan: search + email reveal work with monthly credit caps (see banner).";
  }

  const result: ApolloCapabilities = {
    orgEnrich: orgEnrich.ok,
    jobPostings,
    peopleSearch: peopleSearch.ok,
    peopleMatch: peopleMatch.ok,
    orgSearch: orgSearch.ok,
    contactsSearch: contactsSearch.ok,
    freePlan: discoveryAvailable,
    discoveryAvailable,
    summary,
  };

  _cache = { result, expires: Date.now() + CACHE_TTL };
  return result;
}
