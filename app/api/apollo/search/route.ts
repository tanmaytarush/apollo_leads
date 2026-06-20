import { NextResponse } from "next/server";
import { discoverRecruiters, testApolloConnection } from "@/lib/apollo";
import { appendContacts, dedupeContacts, readCompanies } from "@/lib/csv";

export async function GET() {
  const apollo = await testApolloConnection();
  return NextResponse.json({ ok: apollo.ok, error: apollo.error, apollo });
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

    const companyNames = companies.map((c) => c.company_name);
    const result = await discoverRecruiters(companyNames);

    let contacts = result.contacts;
    if (!replace) {
      contacts = await appendContacts(result.contacts);
    } else {
      contacts = dedupeContacts(result.contacts);
      const { writeContacts } = await import("@/lib/csv");
      await writeContacts(contacts);
    }

    return NextResponse.json({
      success: true,
      discovered: result.contacts.length,
      total: contacts.length,
      progress: result.progress,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
