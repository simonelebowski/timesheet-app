import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createLoginCode } from "@/app/lib/loginCodes";

export const runtime = "nodejs";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function POST(req: NextRequest) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !FROM_EMAIL) {
    console.error("[request-code] SMTP config incomplete");
    return NextResponse.json(
      { message: "Email configuration error." },
      { status: 500 }
    );
  }

  let body: { email?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = body.email?.trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { message: "A valid email is required." },
      { status: 400 }
    );
  }

  const code = createLoginCode(email);

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: "Your login code",
      text: `Your login code is: ${code}\n\nIt will expire in 10 minutes.`,
    });
  } catch (err) {
    console.error("[request-code] Error sending email:", err);
    return NextResponse.json(
      { message: "Failed to send login code email." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
