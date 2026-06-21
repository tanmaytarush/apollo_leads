import { NextResponse } from "next/server";
import { probeApolloCapabilities } from "@/lib/apollo-capabilities";
import {
  discoverCompanyIntel,
  mergeCompanyIntel,
  readCompanyIntel,
  writeCompanyIntel,
} from "@/lib/company-intel";
import { readCompanies } from "@/lib/csv";

export async function GET() {
  const [intel, capabilities] = await Promise.all([
    readCompanyIntel(),
    probeApolloCapabilities(),
  ]);
  return NextResponse.json({ intel, capabilities });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const replace = body.replace === true;

    const companies = await readCompanies();
    if (companies.length === 0) {
      return NextResponse.json(
        { error: "No companies found. Upload companies.csv with company_name,domain first." },
        { status: 400 }
      );
    }

    const missingDomain = companies.filter((c) => !c.domain.trim());
    if (missingDomain.length > 0) {
      return NextResponse.json(
        {
          error: `Missing domain for: ${missingDomain.map((c) => c.company_name).join(", ")}. Use company_name,domain in companies.csv.`,
        },
        { status: 400 }
      );
    }

    const result = await discoverCompanyIntel(companies);
    let intel = result.intel;

    if (replace) {
      await writeCompanyIntel(intel);
    } else {
      intel = await mergeCompanyIntel(intel);
    }

    intel.sort((a, b) => Number(b.hiring_score || 0) - Number(a.hiring_score || 0));

    return NextResponse.json({
      success: true,
      processed: result.progress.length,
      saved: intel.length,
      intel,
      progress: result.progress,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Company intel failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
