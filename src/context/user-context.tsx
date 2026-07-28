"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { getRoleForUserId, hasPermission, type UserRole, type UserPermission } from "@/lib/auth/userPermissions";

export type AppUser = {
  id: "joris" | "jeroen" | "janluca";
  name: string;
  avatar: string | null;
  role: UserRole;
};

export const APP_USERS: AppUser[] = [
  { id: "joris",   name: "Joris G.",    avatar: "/profile.png",         role: getRoleForUserId("joris")   },
  { id: "jeroen",  name: "Jeroen G.",   avatar: "/profile_jeroen.png",  role: getRoleForUserId("jeroen")  },
  { id: "janluca", name: "Jan Luca M.", avatar: "/profile_jeroen.png",  role: getRoleForUserId("janluca") },
];

export { hasPermission, type UserPermission };

export const CL_USER_KEY = "cl_user";

type UserContextValue = {
  user: AppUser | null;
  setUser: (user: AppUser) => void;
  clearUser: () => void;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: AppUser | null;
}) {
  const [user, setUserState] = useState<AppUser | null>(initialUser);

  const setUser = useCallback((u: AppUser) => {
    try { localStorage.setItem(CL_USER_KEY, u.id); } catch { /* ignore */ }
    setUserState(u);
  }, []);

  const clearUser = useCallback(() => {
    try { localStorage.removeItem(CL_USER_KEY); } catch { /* ignore */ }
    setUserState(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, clearUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
