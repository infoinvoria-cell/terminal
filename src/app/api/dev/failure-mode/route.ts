import { NextRequest, NextResponse } from "next/server";
import { failureModeCookieName } from "@/lib/server/capitalife-failure-injection";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const value = url.searchParams.get("set") ?? "";
  const clear = url.searchParams.get("clear") === "1";
  const response = NextResponse.json({
    ok: true,
    active: clear ? [] : value.split(",").map((item) => item.trim()).filter(Boolean),
  });

  response.cookies.set(failureModeCookieName(), clear ? "" : value, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: clear ? 0 : 60 * 30,
  });

  return response;
}
