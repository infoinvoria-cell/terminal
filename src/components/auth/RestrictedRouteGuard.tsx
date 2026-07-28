"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/user-context";
import { hasPermission, type UserPermission } from "@/lib/auth/userPermissions";

interface Props {
  requiredPermission: UserPermission;
  children: React.ReactNode;
}

export function RestrictedRouteGuard({ requiredPermission, children }: Props) {
  const { user } = useUser();
  const router   = useRouter();

  useEffect(() => {
    if (user && !hasPermission(user.id, requiredPermission)) {
      router.replace("/");
    }
  }, [user, requiredPermission, router]);

  if (!user) return null;
  if (!hasPermission(user.id, requiredPermission)) return null;
  return <>{children}</>;
}
