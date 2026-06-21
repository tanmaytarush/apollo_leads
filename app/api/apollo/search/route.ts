import { NextResponse } from "next/server";
import { probeApolloCapabilities } from "@/lib/apollo-capabilities";
import { discoverRecruiters, testApolloConnection } from "@/lib/apollo";
import { buildCompanyRollups, buildDiscoverySummary } from "@/lib/discovery-summary";
import { appendContacts, dedupeContacts, readCompanies } from "@/lib/csv";
import { sortContactsByScore } from "@/lib/scoring";

export async function GET() {
  const [apollo, capabilities] = await Promise.all([
    testApolloConnection(),
    probeApolloCapabilities(),
  ]);
  return NextResponse.json({ ok: apollo.ok, error: apollo.error, apollo, capabilities });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const replace = body.replace === true;

    const companies = await readCompanies();
    if (companies.length === 0) {
      return NextResponse.json(
        { error: "No companies found. Upload companies.csv first." },
        { status: 400 }
      );
    }

    const result = await discoverRecruiters(companies);

    let contacts = result.contacts;
    if (!replace) {
      contacts = await appendContacts(result.contacts);
    } else {
      contacts = dedupeContacts(result.contacts);
      const { writeContacts } = await import("@/lib/csv");
      await writeContacts(contacts);
    }

    const companyNames = companies.map((c) => c.company_name);
    const sorted = sortContactsByScore(contacts);
    const summary = buildDiscoverySummary(sorted, companyNames.length);
    const companyRollups = buildCompanyRollups(sorted);

    return NextResponse.json({
      success: true,
      discovered: result.contacts.length,
      total: contacts.length,
      progress: result.progress,
      summary,
      companyRollups,
      errors: result.errors,
      warnings: result.warnings,
      apolloCreditsUsed: result.apolloCreditsUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
