import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Landing und Sign-in sind oeffentlich, alles andere (inkl. APIs) erfordert Login.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
  },
  // Eigene In-App-Sign-in-Seite statt Clerk Account Portal
  { signInUrl: "/sign-in" },
);

export const config = {
  matcher: [
    // Next.js-Interna und statische Dateien ueberspringen
    "/((?!_next|cesium|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|glb|b3dm|json)).*)",
    "/(api|trpc)(.*)",
  ],
};
