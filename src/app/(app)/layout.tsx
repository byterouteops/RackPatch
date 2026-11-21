import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { listVisibleProjects } from "@/lib/authz";
import { getAppAuth } from "@/lib/session";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authz = await getAppAuth();
  if (!authz) {
    redirect("/sign-in");
  }
  const projects = (await listVisibleProjects(authz.user)).map((p) => ({
    id: p.id,
    name: p.name,
    workspaceId: p.workspaceId,
  }));

  return (
    <AppShell user={authz.user} isPlatformAdmin={authz.isPlatformAdmin} projects={projects}>
      {children}
    </AppShell>
  );
}
