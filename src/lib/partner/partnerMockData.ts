// MOCK DATA — clearly labelled, used until real backend is connected.
// Replace with a Supabase query or API call when the schema is ready.
// Never hard-code these values directly in UI components.

import type { PartnerTierId } from "./partnerProgramConfig";

export interface PartnerProfile {
  userId: string;
  userName: string;
  partnerTier: PartnerTierId;
  founderStatus: boolean;
  /** Own directly-managed investor capital (€). */
  ownActiveVolume: number;
  /** Direct team partners' combined active volume (€). */
  teamActiveVolume: number;
  /** ownActiveVolume + teamActiveVolume */
  totalActiveVolume: number;
}

// ── MOCK: Jan Luca M. ─────────────────────────────────────────────────────────
// Replace with a real fetch:
//   const profile = await supabase.from("partner_profiles").select("*").eq("user_id", userId).single()
const MOCK_JAN_LUCA: PartnerProfile = {
  userId:            "janluca",
  userName:          "Jan Luca M.",
  partnerTier:       "gold",
  founderStatus:     true,
  ownActiveVolume:   650_000,
  teamActiveVolume:  480_000,
  totalActiveVolume: 1_130_000,
};

export function getPartnerProfile(userId: string): PartnerProfile {
  // When real data is available, swap this switch with a DB/API call.
  switch (userId) {
    case "janluca": return MOCK_JAN_LUCA;
    default:
      return {
        userId,
        userName:          userId,
        partnerTier:       "bronze",
        founderStatus:     false,
        ownActiveVolume:   0,
        teamActiveVolume:  0,
        totalActiveVolume: 0,
      };
  }
}
