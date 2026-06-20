import { NextResponse } from "next/server";
import {
  getFileStats,
  parseCompaniesCsv,
  parseContactsCsv,
  writeCompanies,
  writeContacts,
} from "@/lib/csv";

export async function GET() {
  const stats = await getFileStats();
  return NextResponse.json(stats);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file || !type) {
      return NextResponse.json(
        { error: "File and type are required" },
        { status: 400 }
      );
    }

    const content = await file.text();

    if (type === "companies") {
      const companies = parseCompaniesCsv(content);
      if (companies.length === 0) {
        return NextResponse.json(
          { error: "No valid companies found in CSV" },
          { status: 400 }
        );
      }
      await writeCompanies(companies);
      return NextResponse.json({
        success: true,
        count: companies.length,
        message: `Imported ${companies.length} companies`,
      });
    }

    if (type === "contacts") {
      const contacts = parseContactsCsv(content);
      if (contacts.length === 0) {
        return NextResponse.json(
          { error: "No valid contacts found in CSV" },
          { status: 400 }
        );
      }
      await writeContacts(contacts);
      return NextResponse.json({
        success: true,
        count: contacts.length,
        message: `Imported ${contacts.length} contacts`,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
