import { NextResponse } from "next/server";
import {
  dedupeContacts,
  readContacts,
  writeContacts,
  type Contact,
} from "@/lib/csv";

export async function GET() {
  const contacts = await readContacts();
  return NextResponse.json({ contacts, count: contacts.length });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const contacts = body.contacts as Contact[];

    if (!Array.isArray(contacts)) {
      return NextResponse.json(
        { error: "contacts array is required" },
        { status: 400 }
      );
    }

    const deduped = dedupeContacts(contacts);
    await writeContacts(deduped);
    return NextResponse.json({ success: true, count: deduped.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const contact = body.contact as Contact;

    if (!contact) {
      return NextResponse.json({ error: "contact is required" }, { status: 400 });
    }

    const existing = await readContacts();
    existing.push(contact);
    const deduped = dedupeContacts(existing);
    await writeContacts(deduped);
    return NextResponse.json({ success: true, count: deduped.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Add failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
