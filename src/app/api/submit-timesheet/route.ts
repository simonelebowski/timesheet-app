// app/api/submit-timesheet/route.ts
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs'; // ensure Node.js runtime

type DayEntry = {
  day: number;
  am: number;
  pm: number;
  social: number;
  admin: number;
  status?: "" | "S" | "H"; // optional, since the server doesn’t use it
};

type TimesheetPayload = {
  teacherName: string;
  teacherEmail: string;
  month: string; // "YYYY-MM"
  notes?: string;
  totalHours?: number; // ignore client value, recompute
  days: DayEntry[];
};

function getDaysInMonth(monthStr: string): number {
  const [yearStr, monthStrOnly] = monthStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStrOnly);

  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function formatMonthLabel(monthStr: string): string {
  const [yearStr, monthStrOnly] = monthStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStrOnly);
  if (!year || !month) return monthStr;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * SINGLE Outlook transporter, reused for all requests.
 * Make sure these exist in .env.local:
 * - OUTLOOK_EMAIL
 * - OUTLOOK_PASSWORD
 */
const OUTLOOK_EMAIL = process.env.OUTLOOK_EMAIL;
const OUTLOOK_PASSWORD = process.env.OUTLOOK_PASSWORD;
const TIMESHEET_RECIPIENT = process.env.TIMESHEET_RECIPIENT;
const FROM_EMAIL = process.env.FROM_EMAIL || OUTLOOK_EMAIL;

// Log if something is missing when the module loads (server console)
if (!OUTLOOK_EMAIL || !OUTLOOK_PASSWORD) {
  console.error("[submit-timesheet] Missing OUTLOOK_EMAIL or OUTLOOK_PASSWORD env vars");
}
if (!TIMESHEET_RECIPIENT) {
  console.error("[submit-timesheet] Missing TIMESHEET_RECIPIENT env var");
}

const transporter = nodemailer.createTransport({
  host: "smtp-mail.outlook.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: OUTLOOK_EMAIL,
    pass: OUTLOOK_PASSWORD,
  },
});

export async function POST(req: NextRequest) {
  let body: TimesheetPayload;

  try {
    body = (await req.json()) as TimesheetPayload;
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  // ---- Validation ----
  if (!body.teacherName || typeof body.teacherName !== "string") {
    return NextResponse.json(
      { message: "teacherName is required." },
      { status: 400 }
    );
  }

  if (!body.teacherEmail || typeof body.teacherEmail !== "string") {
    return NextResponse.json(
      { message: "teacherEmail is required." },
      { status: 400 }
    );
  }

  if (!body.month || typeof body.month !== "string") {
    return NextResponse.json(
      { message: "month is required." },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.days) || body.days.length === 0) {
    return NextResponse.json(
      { message: "days array is required." },
      { status: 400 }
    );
  }

  const expectedDays = getDaysInMonth(body.month);
  if (body.days.length !== expectedDays) {
    return NextResponse.json(
      {
        message: `days array length (${body.days.length}) does not match the selected month (${expectedDays} days).`,
      },
      { status: 400 }
    );
  }

  let totalHours = 0;
  for (const day of body.days) {
    if (
      typeof day.day !== "number" ||
      day.day < 1 ||
      day.day > expectedDays
    ) {
      return NextResponse.json(
        { message: "Each day entry must have a valid day number." },
        { status: 400 }
      );
    }

    const fields: (keyof Omit<DayEntry, "day" | "status">)[] = [
      "am",
      "pm",
      "social",
      "admin",
    ];

    for (const field of fields) {
      const value = day[field];
      if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
        return NextResponse.json(
          {
            message: `Invalid value for ${field} on day ${day.day}. Must be a non-negative number.`,
          },
          { status: 400 }
        );
      }
    }

    totalHours += day.am + day.pm + day.social + day.admin;
  }

  const canonicalPayload = {
    teacherName: body.teacherName.trim(),
    teacherEmail: body.teacherEmail.trim(),
    month: body.month,
    notes: body.notes ?? "",
    totalHours,
    days: body.days,
  };

  if (!OUTLOOK_EMAIL || !OUTLOOK_PASSWORD || !TIMESHEET_RECIPIENT || !FROM_EMAIL) {
    console.error("[submit-timesheet] Email configuration incomplete", {
      OUTLOOK_EMAIL: !!OUTLOOK_EMAIL,
      OUTLOOK_PASSWORD: !!OUTLOOK_PASSWORD,
      TIMESHEET_RECIPIENT: !!TIMESHEET_RECIPIENT,
      FROM_EMAIL: !!FROM_EMAIL,
    });

    return NextResponse.json(
      {
        message:
          "Server email configuration is incomplete. Please contact the administrator.",
      },
      { status: 500 }
    );
  }

  const monthLabel = formatMonthLabel(body.month);

  const mailOptions = {
    from: FROM_EMAIL,
    to: TIMESHEET_RECIPIENT,
    subject: `Timesheet submission - ${canonicalPayload.teacherName} - ${monthLabel}`,
    text: JSON.stringify(canonicalPayload, null, 2),
    replyTo: canonicalPayload.teacherEmail,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("[submit-timesheet] Email sent:", info.messageId);
  } catch (error: any) {
    console.error(
      "[submit-timesheet] Error sending timesheet email:",
      error?.message || error
    );
    return NextResponse.json(
      {
        message: "Failed to send timesheet email.",
        // error: error?.message || String(error), // uncomment for debugging if needed
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}