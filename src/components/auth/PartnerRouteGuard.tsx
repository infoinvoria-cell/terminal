"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/user-context";
import { hasPermission } from "@/lib/auth/userPermissions";

interface Props {
  permission: "view:partner_program";
  children: React.ReactNode;
}

export function PartnerRouteGuard({ permission, children }: Props) {
  const { user } = useUser();
  const router   = useRouter();

  useEffect(() => {
    if (user && !hasPermission(user.id, permission)) {
      router.replace("/");
    }
  }, [user, permission, router]);

  if (!user) return null;
  if (!hasPermission(user.id, permission)) return null;
  return <>{children}</>;
}
