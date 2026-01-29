import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

import AppMiddleware from "@/lib/middleware/app";
import DomainMiddleware from "@/lib/middleware/domain";

import { BLOCKED_PATHNAMES } from "./lib/constants";
import IncomingWebhookMiddleware, {
  isWebhookPath,
} from "./lib/middleware/incoming-webhooks";
import PostHogMiddleware from "./lib/middleware/posthog";

function isAnalyticsPath(path: string) {
  const pattern = /^\/ingest\/.*/;
  return pattern.test(path);
}

function normalizeHost(host: string) {
  // remove port if present and lowercase
  return (host || "").split(":")[0].toLowerCase();
}

function isCustomDomain(host: string) {
  const normalizedHost = normalizeHost(host);
  const appHost = normalizeHost(process.env.NEXT_PUBLIC_APP_BASE_HOST || "");

  // ✅ IMPORTANT: Treat the app's own host as NOT a custom domain.
  if (appHost && normalizedHost === appHost) return false;

  return (
    (process.env.NODE_ENV === "development" &&
      (normalizedHost.includes(".local") ||
        normalizedHost.includes("papermark.dev"))) ||
    (process.env.NODE_ENV !== "development" &&
      !(
        normalizedHost.includes("localhost") ||
        normalizedHost.includes("papermark.io") ||
        normalizedHost.includes("papermark.com") ||
        normalizedHost.endsWith(".vercel.app")
      ))
  );
}

export const config = {
  matcher: [
    "/((?!api/|_next/|_static|vendor|_icons|_vercel|favicon.ico|sitemap.xml).*)",
  ],
};

export default async function middleware(req: NextRequest, ev: NextFetchEvent) {
  const path = req.nextUrl.pathname;

  // ✅ Use Next's parsed hostname (already stripped of port)
  const hostname = req.nextUrl.hostname; // e.g. do088...simplytools.co

  if (isAnalyticsPath(path)) {
    return PostHogMiddleware(req);
  }

  // Handle incoming webhooks
  if (isWebhookPath(hostname)) {
    return IncomingWebhookMiddleware(req);
  }

  // For custom domains, we need to handle them differently
  if (isCustomDomain(hostname)) {
    return DomainMiddleware(req);
  }

  // Handle standard app paths
  if (
    !path.startsWith("/view/") &&
    !path.startsWith("/verify") &&
    !path.startsWith("/unsubscribe") &&
    !path.startsWith("/auth/email")
  ) {
    return AppMiddleware(req);
  }

  // Check for blocked pathnames in view routes
  if (
    path.startsWith("/view/") &&
    (BLOCKED_PATHNAMES.some((blockedPath) => path.includes(blockedPath)) ||
      path.includes("."))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }

  return NextResponse.next();
}
