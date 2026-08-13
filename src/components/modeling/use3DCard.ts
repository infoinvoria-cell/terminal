"use client";

import { useState } from "react";

export function use3DCard() {
  const [is3D, setIs3D] = useState(false);
  const toggle = () => setIs3D((v) => !v);
  const reset2D = () => setIs3D(false);
  return { is3D, toggle, reset2D };
}
