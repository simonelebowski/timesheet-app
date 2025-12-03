import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { findUserByEmail } from "@/app/lib/users";

export const runtime = "nodejs";

type DayEntry = {
  day: number;
  am: number;
  pm: number;
  social: number;
  admin: number;
  status?: "" | "S" | "H";
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
  const [yearStr, monthStrOnly] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStrOnly);

  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function formatMonthLabel(monthStr: string): string {
  const [yearStr, monthStrOnly] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStrOnly);
  if (!year || !month) return monthStr;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

// ---- SMTP / email config ----

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true"; // false for Gmail+587
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const TIMESHEET_RECIPIENT = process.env.TIMESHEET_RECIPIENT;
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
  // Parse JSON
  let body: TimesheetPayload;
  try {
    body = (await req.json()) as TimesheetPayload;
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  // Basic validation
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

  // Check user is allowed (from in-code users list)
  const userEmail = body.teacherEmail.trim().toLowerCase();
  const user = findUserByEmail(userEmail);

  if (!user || !user.active || !user.canSubmitTimesheet) {
    return NextResponse.json(
      { message: "This user is not allowed to submit timesheets." },
      { status: 403 }
    );
  }

  // Validate days and recompute total hours
  let totalHours = 0;

  for (const day of body.days) {
    if (typeof day.day !== "number" || day.day < 1 || day.day > expectedDays) {
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
    teacherEmail: userEmail,
    month: body.month,
    notes: body.notes ?? "",
    totalHours,
    days: body.days,
    hourlyRate: user.hourlyRate, // optional, but nice to have
  };

  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !TIMESHEET_RECIPIENT ||
    !FROM_EMAIL
  ) {
    console.error("[submit-timesheet] Email configuration incomplete", {
      SMTP_HOST: !!SMTP_HOST,
      SMTP_USER: !!SMTP_USER,
      SMTP_PASS: !!SMTP_PASS,
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
  const jsonBlock = JSON.stringify(canonicalPayload, null, 2);

  const mailOptions = {
    from: FROM_EMAIL,
    to: TIMESHEET_RECIPIENT,
    subject: `Timesheet submission - ${canonicalPayload.teacherName} - ${monthLabel}`,
    text:
      `A new timesheet has been submitted.\n\n` +
      `Name: ${canonicalPayload.teacherName}\n` +
      `Email: ${canonicalPayload.teacherEmail}\n` +
      `Month: ${monthLabel}\n` +
      `Total hours: ${canonicalPayload.totalHours}\n` +
      (user.hourlyRate ? `Hourly rate: ${user.hourlyRate}\n` : "") +
      `\nFull JSON payload:\n` +
      jsonBlock,
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
      { message: "Failed to send timesheet email." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
