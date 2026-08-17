export function isPublicPreview(): boolean {
  return process.env.NEXT_PUBLIC_APP_MODE === "public-preview";
}

export function isLocalPrivate(): boolean {
  return !isPublicPreview();
}

export function supportsNodeRuntime(): boolean {
  return isLocalPrivate();
}

export type PreviewUnavailableBody = {
  available: false;
  mode: "public-preview";
  reason: "local-runtime-required";
};

export function previewUnavailableBody(): PreviewUnavailableBody {
  return { available: false, mode: "public-preview", reason: "local-runtime-required" };
}
