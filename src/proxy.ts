import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Private-tool gate. When BASIC_AUTH is set ("user:password"), every request
// must carry matching HTTP Basic credentials. Unset (local dev) means open.
// The data behind this board (ICE BofA spreads via FRED, Yahoo quotes) is
// licensed for internal use only, so the public URL stays locked.
export function proxy(req: NextRequest) {
  const expected = process.env.BASIC_AUTH;
  if (!expected) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const given = Buffer.from(header.slice(6), "base64").toString("utf8");
    if (given === expected) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="News Command Center", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
