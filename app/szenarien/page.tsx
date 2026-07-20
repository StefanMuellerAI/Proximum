import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ScenariosClient } from "@/components/scenarios/scenarios-client";

export default async function SzenarienPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <ScenariosClient />;
}
