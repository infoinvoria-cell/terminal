import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/server/api-authorization";

export function proxy(request: NextRequest): NextResponse {
  const decision = authorizeApiRequest(request);
  if (decision.allowed) return NextResponse.next();

  return NextResponse.json(
    { error: "API authorization required", code: decision.reason },
    { status: decision.status, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
