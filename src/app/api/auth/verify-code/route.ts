import { NextRequest, NextResponse } from "next/server";
import { verifyLoginCode } from "@/app/lib/loginCodes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const email = body.email?.trim();
  const code = body.code?.trim();

  if (!email || !code) {
    return NextResponse.json(
      { message: "Email and code are required." },
      { status: 400 }
    );
  }

  const result = verifyLoginCode(email, code);

  if (result === "expired") {
    return NextResponse.json(
      { message: "This code has expired. Please request a new one." },
      { status: 400 }
    );
  }

  if (result === "invalid") {
    return NextResponse.json(
      { message: "Invalid code. Please try again." },
      { status: 400 }
    );
  }

  // result === "ok"
  return NextResponse.json({ success: true });
}
