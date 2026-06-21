import { getApiKey, probeEndpoint } from "./apollo-client";

export interface ApolloCapabilities {
  orgEnrich: boolean;
  jobPostings: boolean;
  peopleSearch: boolean;
  peopleMatch: boolean;
  orgSearch: boolean;
  contactsSearch: boolean;
  freePlan: boolean;
  summary: string;
}

export async function probeApolloCapabilities(): Promise<ApolloCapabilities> {
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
    { method: "POST", body: "{}" }
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

  const blocked = [peopleSearch, peopleMatch, orgSearch].some(
    (r) => r.freePlanBlocked
  );

  let summary = "Full API discovery available";
  if (blocked) {
    summary =
      "Free plan: company enrich + job postings work. People search/email blocked — add contacts manually from Apollo UI.";
  } else if (!orgEnrich.ok) {
    summary = "Apollo key invalid or unreachable";
  }

  return {
    orgEnrich: orgEnrich.ok,
    jobPostings,
    peopleSearch: peopleSearch.ok,
    peopleMatch: peopleMatch.ok,
    orgSearch: orgSearch.ok,
    contactsSearch: contactsSearch.ok,
    freePlan: blocked,
    summary,
  };
}
