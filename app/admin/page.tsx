import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminClient } from "@/components/admin/admin-client";

export default async function AdminPage() {
  const adminId = await requireAdmin();
  if (!adminId) redirect("/");
  return <AdminClient selfId={adminId} />;
}
