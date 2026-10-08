import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "development-only-change-this-secret-32chars");
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/login" || path.startsWith("/api/auth/") || path.startsWith("/_next/") || path === "/favicon.ico") return NextResponse.next();
  const token = req.cookies.get("osint_session")?.value;
  try { if (token) { await jwtVerify(token, key()); return NextResponse.next(); } } catch {}
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
