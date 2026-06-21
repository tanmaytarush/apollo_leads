#!/usr/bin/env node
/**
 * Apollo API probe — tests documented discovery endpoints.
 *
 * Usage:
 *   npm run test:apollo
 *   npm run test:apollo -- --company CoinDCX --domain coindcx.com
 */

import fs from "fs";
import path from "path";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { company: "CoinDCX", domain: "coindcx.com" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--company" && argv[i + 1]) args.company = argv[i + 1];
    if (argv[i] === "--domain" && argv[i + 1]) args.domain = argv[i + 1];
  }
  return args;
}

async function apolloFetch(apiKey, endpoint, options = {}) {
  const response = await fetch(`${APOLLO_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      accept: "application/json",
      "X-Api-Key": apiKey,
      ...options.headers,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function summarizePerson(person) {
  return {
    id: person?.id,
    name: [person?.first_name, person?.last_name ?? person?.last_name_obfuscated]
      .filter(Boolean)
      .join(" "),
    title: person?.title,
    email: person?.email ?? null,
    has_email: person?.has_email ?? null,
    linkedin_url: person?.linkedin_url ?? null,
  };
}

function printSection(title) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

async function probeStep(name, fn) {
  try {
    const result = await fn();
    console.log(`✓ ${name}`);
    return { ok: true, result };
  } catch (err) {
    const detail =
      err?.cause?.code ||
      err?.cause?.message ||
      err?.message ||
      String(err);
    console.log(`✗ ${name}: ${detail}`);
    return { ok: false, error: detail };
  }
}

async function main() {
  loadEnvFile();

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error("Missing APOLLO_API_KEY in .env");
    process.exit(1);
  }

  const { company, domain } = parseArgs(process.argv.slice(2));

  printSection("Apollo Discovery Probe (official endpoints)");
  console.log(`Company: ${company}`);
  console.log(`Domain : ${domain}`);

  const orgSearch = await probeStep("Organization Search (mixed_companies/search)", () => {
    const params = new URLSearchParams({
      q_organization_name: company,
      per_page: "1",
      page: "1",
    });
    return apolloFetch(
      apiKey,
      `/mixed_companies/search?${params.toString()}`,
      { method: "POST", body: JSON.stringify({}) }
    );
  });

  const orgEnrich = await probeStep("Organization Enrichment (organizations/enrich)", () =>
    apolloFetch(apiKey, `/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
      method: "GET",
    })
  );

  const org =
    orgSearch.ok ? orgSearch.result.organizations?.[0] : orgEnrich.ok ? orgEnrich.result.organization : null;
  const orgId = org?.id ?? "";

  console.log(
    "Org match:",
    org ? { id: orgId, name: org.name, domain: org.primary_domain ?? domain } : "none"
  );

  const peopleSearch = await probeStep("People API Search (mixed_people/api_search)", () => {
    const params = new URLSearchParams();
    params.append("person_titles[]", "Recruiter");
    params.append("person_titles[]", "Engineering Manager");
    params.append("q_organization_name", company);
    params.append("q_organization_domains_list[]", domain);
    params.append("per_page", "3");
    params.append("page", "1");
    return apolloFetch(
      apiKey,
      `/mixed_people/api_search?${params.toString()}`,
      { method: "POST", body: JSON.stringify({}) }
    );
  });

  let samplePerson = null;
  if (peopleSearch.ok) {
    const people = peopleSearch.result.people ?? [];
    console.log(`  Returned ${people.length} people`);
    people.slice(0, 3).forEach((p, i) => {
      console.log(`  [${i + 1}]`, JSON.stringify(summarizePerson(p)));
    });
    samplePerson = people[0] ?? null;
  }

  if (samplePerson?.id) {
    await probeStep("People Enrichment (people/match)", () => {
      const params = new URLSearchParams({
        id: samplePerson.id,
        reveal_personal_emails: "true",
        run_waterfall_email: "false",
        run_waterfall_phone: "false",
        reveal_phone_number: "false",
        organization_name: company,
        domain,
      });
      return apolloFetch(apiKey, `/people/match?${params.toString()}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    });
  } else {
    console.log("✗ People Enrichment (people/match): skipped — no person id from api_search");
  }

  await probeStep("contacts/search (saved CRM contacts only)", () =>
    apolloFetch(apiKey, "/contacts/search", {
      method: "POST",
      body: JSON.stringify({ q_keywords: company, per_page: 3, page: 1 }),
    })
  );

  if (orgId) {
    await probeStep("Organization Job Postings", () =>
      apolloFetch(apiKey, `/organizations/${orgId}/job_postings`, { method: "GET" })
    );
  }

  printSection("Verdict");
  const errors = [orgSearch, orgEnrich, peopleSearch].filter((r) => !r.ok).map((r) => r.error);
  const freePlan = errors.some((e) => String(e).includes("free plan") || String(e).includes("API_INACCESSIBLE"));

  if (peopleSearch.ok) {
    console.log("People API Search works → Run Discovery in the app.");
    console.log("Emails come from people/match (uses credits per Apollo docs).");
  } else if (freePlan) {
    console.log("Apollo FREE PLAN blocks API search endpoints (403 API_INACCESSIBLE).");
    console.log("UI credits ≠ API access. Upgrade plan or use Apollo UI manually, then import contacts.csv.");
    console.log("Docs: https://docs.apollo.io/reference/people-api-search");
  } else if (errors.some((e) => String(e).includes("CONNECT_TIMEOUT") || String(e).includes("fetch failed"))) {
    console.log("Network timeout reaching api.apollo.io — check VPN/firewall.");
  } else {
    console.log("Discovery endpoints failed. Paste errors above when debugging.");
  }

  console.log("\nNote: organization_top_people is NOT in official Apollo API docs and often returns 404.");
  console.log("Note: contacts/search only finds people already saved in your Apollo CRM.");
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
