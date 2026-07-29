import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, checkPassword } from "@/lib/admin/auth";

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const origin = new URL(req.url).origin;

  if (!checkPassword(password)) {
    return NextResponse.redirect(`${origin}/admin/login?error=1`, { status: 303 });
  }
  const res = NextResponse.redirect(`${origin}/admin`, { status: 303 });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
