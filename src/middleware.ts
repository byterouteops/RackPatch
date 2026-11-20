import { NextResponse } from "next/server";
/** Session enforcement lives in `src/app/(app)/layout.tsx`; middleware stays light. */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};