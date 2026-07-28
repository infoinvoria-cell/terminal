// Central role/permission system for Capitalife Terminal users.
// The gate currently identifies users by id ("joris" | "jeroen" | "janluca").
// This module maps IDs to roles and roles to permissions, so nav filtering
// and route guards have ONE place to look — never scattered string checks.

export type UserRole = "admin" | "analyst" | "partner_manager";

export type UserPermission =
  | "view:technical_charts"   // Analytics, Monitoring (intraday charts)
  | "view:analytics"          // Analytics dashboard section
  | "view:monitoring"         // /monitoring page
  | "view:komponenten"        // /komponenten + seasonality
  | "view:brain"              // /brain-graph
  | "view:globe"              // /globe
  | "view:sentinel"           // Sentinel AI chat
  | "view:partner_program";   // /partner — Partnerprogramm

const ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  admin: [
    "view:technical_charts",
    "view:analytics",
    "view:monitoring",
    "view:komponenten",
    "view:brain",
    "view:globe",
    "view:sentinel",
    "view:partner_program",
  ],
  analyst: [
    "view:technical_charts",
    "view:analytics",
    "view:monitoring",
    "view:komponenten",
    "view:brain",
    "view:globe",
    "view:sentinel",
  ],
  partner_manager: [
    "view:sentinel",
    "view:partner_program",
  ],
};

export const USER_ROLES: Record<"joris" | "jeroen" | "janluca", UserRole> = {
  joris:   "admin",
  jeroen:  "admin",
  janluca: "partner_manager",
};

export function getRoleForUserId(id: string): UserRole {
  return USER_ROLES[id as keyof typeof USER_ROLES] ?? "analyst";
}

export function hasPermission(userId: string, permission: UserPermission): boolean {
  const role = getRoleForUserId(userId);
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Convenience: list of routes a partner_manager cannot access.
export const PARTNER_RESTRICTED_ROUTES = [
  "/monitoring",
  "/analytics",
  "/komponenten",
  "/brain",
  "/brain-graph",
  "/globe",
];
