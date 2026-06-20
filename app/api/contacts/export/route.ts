import { NextResponse } from "next/server";
import { contactsToDownloadCsv, readContacts } from "@/lib/csv";

export async function GET() {
  const contacts = await readContacts();
  const csv = contactsToDownloadCsv(contacts);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="contacts.csv"',
    },
  });
}
