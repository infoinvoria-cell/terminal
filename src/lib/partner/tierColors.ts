import type { PartnerTierId } from "./partnerProgramConfig";

export interface TierColor {
  /** Background for cards/boxes */
  bg: string;
  /** Dark fill for SVG shapes */
  fill: string;
  /** Border/stroke color */
  stroke: string;
  /** Main text color */
  text: string;
  /** Badge background */
  badgeBg: string;
  /** Human-readable label */
  label: string;
  /** Optional box-shadow glow */
  glow?: string;
}

export const TIER_COLORS: Record<PartnerTierId, TierColor> = {
  bronze: {
    bg: "rgba(60,25,5,0.4)",
    fill: "#3d1803",
    stroke: "#c07840",
    text: "#e09050",
    badgeBg: "rgba(60,25,5,0.75)",
    label: "Bronze",
  },
  silver: {
    bg: "rgba(32,32,40,0.5)",
    fill: "#1e1e28",
    stroke: "#8a8a9e",
    text: "#c4c4d4",
    badgeBg: "rgba(32,32,40,0.75)",
    label: "Silber",
  },
  gold: {
    bg: "rgba(60,40,5,0.4)",
    fill: "#3b2804",
    stroke: "#c99e3e",
    text: "#e2ca7a",
    badgeBg: "rgba(60,40,5,0.75)",
    label: "Gold",
    glow: "0 0 14px rgba(226,202,122,0.28)",
  },
  platin: {
    bg: "rgba(5,20,50,0.5)",
    fill: "#061232",
    stroke: "#4b8ef0",
    text: "#90c0fc",
    badgeBg: "rgba(5,20,50,0.75)",
    label: "Platin",
  },
  black: {
    bg: "rgba(4,4,8,0.75)",
    fill: "#04040a",
    stroke: "#c8c8c8",
    text: "#f0f0f0",
    badgeBg: "rgba(4,4,8,0.9)",
    label: "Black",
    glow: "0 0 18px rgba(255,255,255,0.1)",
  },
};
