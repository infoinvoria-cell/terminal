"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/user-context";
import { hasPermission, type UserPermission } from "@/lib/auth/userPermissions";

/**
 * Redirects to /investor-db if the current user lacks the required permission.
 * Place this as a wrapper inside any restricted page shell.
 */
export function PartnerGuard({
  children,
  permission = "view:execution",
  redirectTo = "/investor-db",
}: {
  children: React.ReactNode;
  permission?: UserPermission;
  redirectTo?: string;
}) {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user && !hasPermission(user.id, permission)) {
      router.replace(redirectTo);
    }
  }, [user, permission, redirectTo, router]);

  // If user lacks permission, render nothing while redirect fires.
  if (user && !hasPermission(user.id, permission)) return null;

  return <>{children}</>;
}
