import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET() {
  const token = randomBytes(32).toString("hex");

  const res = NextResponse.json({ token });

  res.cookies.set("csrf", token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return res;
}
