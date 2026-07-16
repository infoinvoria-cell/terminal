import { DATA_SOURCE_PATHS } from "@/config/data-sources";

export type CapitalifeBrainDescriptor = {
  rootPath: string;
  role: "source-of-truth";
  readOnly: true;
  approvedUseCases: string[];
};

export function getCapitalifeBrainDescriptor(): CapitalifeBrainDescriptor {
  return {
    rootPath: DATA_SOURCE_PATHS.capitalifeBrain ?? "Set CAPITALIFE_BRAIN_PATH in .env.local",
    role: "source-of-truth",
    readOnly: true,
    approvedUseCases: [
      "documentation lookup",
      "source register alignment",
      "manual reference checks",
      "report generation support",
    ],
  };
}
