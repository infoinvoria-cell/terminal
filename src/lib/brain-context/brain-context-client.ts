export type BrainContextPackRequest = {
  query: string;
};

export type BrainContextPackResponse = {
  files: Array<{ file: string; reason: string; priority: number }>;
  preview: string;
};

export type BrainGraphChangesResponse = {
  changelogExists: boolean;
  agentUpdatesExists: boolean;
  entries: Array<{
    title: string;
    source: string;
    status: "ok" | "partial" | "missing";
    updatedAt: string | null;
  }>;
};

export async function fetchBrainContextPack(input: BrainContextPackRequest): Promise<BrainContextPackResponse> {
  const response = await fetch("/api/brain-graph/context-pack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`context-pack request failed: ${response.status}`);
  }
  return response.json() as Promise<BrainContextPackResponse>;
}

export async function fetchBrainGraphChanges(): Promise<BrainGraphChangesResponse> {
  const response = await fetch("/api/brain-graph/changes", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`brain-graph changes request failed: ${response.status}`);
  }
  return response.json() as Promise<BrainGraphChangesResponse>;
}
