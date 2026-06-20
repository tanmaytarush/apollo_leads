import { NextResponse } from "next/server";
import type { Contact } from "@/lib/csv";
import {
  buildEmailFromContact,
  getProfileLinks,
  readEmailTemplate,
} from "@/lib/template";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const contact = body.contact as Contact;

    if (!contact) {
      return NextResponse.json({ error: "contact is required" }, { status: 400 });
    }

    const template = await readEmailTemplate();
    const profileLinks = getProfileLinks();
    const email = buildEmailFromContact(contact, template, profileLinks);

    return NextResponse.json({ preview: email });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
