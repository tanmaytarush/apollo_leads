import { NextResponse } from "next/server";
import Papa from "papaparse";
import { COMPANY_COLUMNS, readCompanies } from "@/lib/csv";

export async function GET() {
  const companies = await readCompanies();
  const csv = Papa.unparse(companies, { columns: COMPANY_COLUMNS });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="companies.csv"',
    },
  });
}
