import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AnlegenClient } from "@/components/wizard/anlegen-client";

export default async function AnlegenPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <AnlegenClient />;
}
