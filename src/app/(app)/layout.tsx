import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/session";
import { userHasPlatformAdmin } from "@/lib/authz";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }

  return (
    <AppShell user={user} isPlatformAdmin={await userHasPlatformAdmin(user)}>
      {children}
    </AppShell>
  );
}
