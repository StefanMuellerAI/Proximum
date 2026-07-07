import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/auth";
import { PortfolioClient } from "@/components/portfolio/portfolio-client";

export default async function PortfolioPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const isAdmin = Boolean(await requireAdmin());
  return <PortfolioClient isAdmin={isAdmin} />;
}
