import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { consumeRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const handlers = toNextJsHandler(auth);

async function withAuthRateLimit(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const { allowed, retryAfterSec } = await consumeRateLimit(
    `auth:${ip}`,
    30,
    60_000,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many authentication requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const limited = await withAuthRateLimit(req);
  if (limited) return limited;
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  const limited = await withAuthRateLimit(req);
  if (limited) return limited;
  return handlers.POST(req);
}
