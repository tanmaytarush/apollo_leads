import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function getGmailConfig() {
  const email = process.env.GMAIL_EMAIL;
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Gmail credentials missing. Set GMAIL_EMAIL and GMAIL_APP_PASSWORD in .env"
    );
  }

  return { email, password };
}

export function createTransporter() {
  const { email, password } = getGmailConfig();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: password,
    },
  });
}

export async function sendEmail(
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    const transporter = createTransporter();
    const { email } = getGmailConfig();

    const info = await transporter.sendMail({
      from: `"Tanmay Dikshit" <${email}>`,
      to: options.to,
      subject: options.subject,
      text: options.body,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send error";
    return { success: false, error: message };
  }
}

export async function verifyGmailConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return { ok: false, error: message };
  }
}
