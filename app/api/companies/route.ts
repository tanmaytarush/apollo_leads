import { NextResponse } from "next/server";
import { readCompanies, writeCompanies } from "@/lib/csv";

export async function GET() {
  const companies = await readCompanies();
  return NextResponse.json({ companies, count: companies.length });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const companies = body.companies;

    if (!Array.isArray(companies)) {
      return NextResponse.json(
        { error: "companies array is required" },
        { status: 400 }
      );
    }

    await writeCompanies(companies);
    const saved = await readCompanies();
    return NextResponse.json({ success: true, count: saved.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
