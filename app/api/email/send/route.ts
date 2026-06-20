import { NextResponse } from "next/server";
import { readContacts, writeContacts } from "@/lib/csv";
import { sendEmail, verifyGmailConnection } from "@/lib/gmail";
import {
  buildEmailFromContact,
  getProfileLinks,
  isEligibleForSending,
  readEmailTemplate,
} from "@/lib/template";

export async function GET() {
  const gmail = await verifyGmailConnection();
  return NextResponse.json({ gmail });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const indices: number[] | undefined = body.indices;

    const contacts = await readContacts();
    const template = await readEmailTemplate();
    const profileLinks = getProfileLinks();

    let toSend = contacts
      .map((contact, index) => ({ contact, index }))
      .filter(({ contact }) => isEligibleForSending(contact));

    if (indices && indices.length > 0) {
      const indexSet = new Set(indices);
      toSend = toSend.filter(({ index }) => indexSet.has(index));
    }

    if (toSend.length === 0) {
      return NextResponse.json(
        { error: "No eligible contacts to send (need send_email=YES, special_mail=NO, status=PENDING, valid email)" },
        { status: 400 }
      );
    }

    const results: {
      index: number;
      name: string;
      email: string;
      success: boolean;
      error?: string;
    }[] = [];

    for (const { contact, index } of toSend) {
      const emailContent = buildEmailFromContact(
        contact,
        template,
        profileLinks
      );
      const result = await sendEmail(emailContent);

      contacts[index].status = result.success ? "SENT" : "FAILED";
      results.push({
        index,
        name: contact.person_name,
        email: contact.email,
        success: result.success,
        error: result.error,
      });

      await writeContacts(contacts);
      await new Promise((r) => setTimeout(r, 1500));
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      sent,
      failed,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
