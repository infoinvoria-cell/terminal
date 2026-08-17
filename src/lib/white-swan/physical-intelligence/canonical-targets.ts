export const PHYSICAL_CANONICAL_TARGETS = {
  corn: { releaseComponentId: "zc_seasonal", registryComponentId: "zc1_sea", instrument: "MZC" },
  soy: { releaseComponentId: "zs_seasonal", registryComponentId: "zs1_sea", instrument: "MZS" },
  wheat: { releaseComponentId: "zw_mzw", registryComponentId: "zw1_sea", instrument: "MZW" },
  crude: { releaseComponentId: "cl1_seasonal", registryComponentId: "cl1_sea", instrument: "MCL" },
} as const;
