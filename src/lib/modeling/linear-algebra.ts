/**
 * Minimal linear algebra utilities for quant model cards.
 * Covers covariance, correlation, eigendecomposition (Jacobi), and portfolio math.
 */

// ─── Covariance / correlation ──────────────────────────────────────────────────

/** Build (k × k) covariance matrix from (n × k) returns matrix. */
export function covarianceMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length;
  const k = returnsMatrix[0]?.length ?? 0;
  if (n < 2 || k === 0) return [];

  const means = Array.from({ length: k }, (_, j) =>
    returnsMatrix.reduce((s, row) => s + (row[j] ?? 0), 0) / n,
  );

  const cov: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let sum = 0;
      for (let t = 0; t < n; t++) {
        sum += ((returnsMatrix[t]?.[i] ?? 0) - means[i]!) *
               ((returnsMatrix[t]?.[j] ?? 0) - means[j]!);
      }
      const val = sum / (n - 1);
      cov[i]![j] = val;
      cov[j]![i] = val;
    }
  }
  return cov;
}

/** Correlation matrix from covariance matrix. */
export function correlationFromCovariance(cov: number[][]): number[][] {
  const k = cov.length;
  const stds = cov.map((row, i) => Math.sqrt(row[i] ?? 0));
  return cov.map((row, i) =>
    row.map((v, j) => {
      const denom = (stds[i] ?? 0) * (stds[j] ?? 0);
      return denom > 1e-12 ? v / denom : i === j ? 1 : 0;
    }),
  );
}

// ─── Jacobi eigendecomposition ─────────────────────────────────────────────────

/** Symmetric eigendecomposition via Jacobi iterations.
 * Returns eigenvalues (descending) and matching eigenvectors (columns). */
export function jacobiEigen(A: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = A.length;
  // Clone A
  const a: number[][] = A.map((row) => [...row]);
  // Start with identity as eigenvector matrix
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)),
  );

  const MAX_ITER = 100 * n * n;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0, p = 0, q = 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[i]![j]!) > maxVal) {
          maxVal = Math.abs(a[i]![j]!);
          p = i; q = j;
        }
      }
    }
    if (maxVal < 1e-12) break;

    const app = a[p]![p]!;
    const aqq = a[q]![q]!;
    const apq = a[p]![q]!;
    const theta = (aqq - app) / (2 * apq);
    const t = theta >= 0
      ? 1 / (theta + Math.sqrt(1 + theta * theta))
      : 1 / (theta - Math.sqrt(1 + theta * theta));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    // Apply rotation
    a[p]![p] = app - t * apq;
    a[q]![q] = aqq + t * apq;
    a[p]![q] = 0;
    a[q]![p] = 0;

    for (let r = 0; r < n; r++) {
      if (r !== p && r !== q) {
        const arp = a[r]![p]!;
        const arq = a[r]![q]!;
        a[r]![p] = c * arp - s * arq;
        a[p]![r] = a[r]![p]!;
        a[r]![q] = s * arp + c * arq;
        a[q]![r] = a[r]![q]!;
      }
    }

    for (let r = 0; r < n; r++) {
      const vrp = v[r]![p]!;
      const vrq = v[r]![q]!;
      v[r]![p] = c * vrp - s * vrq;
      v[r]![q] = s * vrp + c * vrq;
    }
  }

  // Extract eigenvalues and sort descending
  const pairs = Array.from({ length: n }, (_, i) => ({
    eigenvalue: a[i]![i]!,
    vector: v.map((row) => row[i]!),
  })).sort((a, b) => b.eigenvalue - a.eigenvalue);

  return {
    eigenvalues: pairs.map((p) => p.eigenvalue),
    eigenvectors: pairs.map((p) => p.vector),
  };
}

// ─── Portfolio math ────────────────────────────────────────────────────────────

/** Portfolio variance: w' Σ w */
export function portfolioVariance(weights: number[], cov: number[][]): number {
  const k = weights.length;
  let pvar = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      pvar += weights[i]! * weights[j]! * (cov[i]?.[j] ?? 0);
    }
  }
  return pvar;
}

/** Generate a random weight vector that sums to 1 (all non-negative). */
export function randomWeights(k: number, seed: number): number[] {
  // Dirichlet-like: draw k exponentials then normalise
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0xffffffff);
  };
  const exps = Array.from({ length: k }, () => -Math.log(Math.max(rng(), 1e-9)));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// ─── Linear system solver ──────────────────────────────────────────────────────

/** Gaussian elimination with partial pivoting. Returns null if singular (|pivot| < 1e-12). */
export function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // Augmented matrix [A | b]
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(M[col]![col]!);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(M[row]![col]!);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxVal < 1e-12) return null;
    [M[col], M[maxRow]] = [M[maxRow]!, M[col]!];

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const f = M[row]![col]! / M[col]![col]!;
      for (let c = col; c <= n; c++) {
        M[row]![c] = M[row]![c]! - f * M[col]![c]!;
      }
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i]![n]!;
    for (let j = i + 1; j < n; j++) sum -= M[i]![j]! * x[j]!;
    x[i] = sum / M[i]![i]!;
  }
  return x;
}

// ─── Long-only frontier (projected gradient descent) ─────────────────────────

/**
 * Minimum-variance portfolio for a given target return, LONG-ONLY constraint.
 * Method: projected gradient descent onto the standard simplex (wᵢ ≥ 0, Σwᵢ = 1).
 */
export function longOnlyFrontierPoint(
  cov: number[][],
  means: number[],
  targetReturn: number, // monthly
  maxIter = 3000,
): { weights: number[]; vol: number; ret: number; sharpe: number } | null {
  const k = cov.length;
  if (k === 0) return null;

  function matVec(M: number[][], v: number[]): number[] {
    return M.map(row => row.reduce((s, mij, j) => s + mij * (v[j] ?? 0), 0));
  }
  function dot(a: number[], b: number[]): number {
    return a.reduce((s, ai, i) => s + ai * (b[i] ?? 0), 0);
  }
  function projectSimplex(v: number[]): number[] {
    const n = v.length;
    const sorted = [...v].sort((a, b) => b - a);
    let cssv = 0;
    let rho = 0;
    for (let i = 0; i < n; i++) {
      cssv += sorted[i]!;
      if (sorted[i]! - (cssv - 1) / (i + 1) > 0) rho = i;
    }
    const theta = (sorted.slice(0, rho + 1).reduce((s, x) => s + x, 0) - 1) / (rho + 1);
    return v.map(vi => Math.max(0, vi - theta));
  }

  let w = new Array(k).fill(1 / k);
  let lambda = 0;
  const stepSize = 1e-3;
  const dualStep = 0.5;

  for (let iter = 0; iter < maxIter; iter++) {
    const Sw = matVec(cov, w);
    const grad = Sw.map((si, i) => 2 * si + lambda * (means[i] ?? 0));
    const wNew = projectSimplex(w.map((wi, i) => wi - stepSize * grad[i]!));
    const retErr = dot(wNew, means) - targetReturn;
    lambda -= dualStep * retErr * (1 / (iter + 1));
    w = wNew;
  }

  const achievedRet = dot(w, means);
  if (Math.abs(achievedRet - targetReturn) > 0.015) return null;

  const variance = dot(w, matVec(cov, w));
  if (variance < 0) return null;
  const vol = Math.sqrt(variance) * Math.sqrt(12);
  const ret = achievedRet * 12;
  const sharpe = vol > 0 ? ret / vol : 0;
  return { weights: w, vol, ret, sharpe };
}

// ─── Analytical mean-variance frontier ────────────────────────────────────────

/**
 * Minimum-variance portfolio for a given target return.
 * Method: UNCONSTRAINED (allows short positions).
 * KKT system: [2Σ  -1  -μ; 1ᵀ  0  0; μᵀ  0  0] · [w; λ₁; λ₂] = [0; 1; μ_target]
 */
export function analyticalFrontierPoint(
  cov: number[][],
  means: number[],
  targetReturn: number,
): { weights: number[]; vol: number; ret: number; sharpe: number } | null {
  const k = means.length;
  if (k < 2 || cov.length !== k) return null;

  const dim = k + 2;
  const A: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));
  const b: number[] = new Array(dim).fill(0);

  // Top-left block: 2Σ
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) A[i]![j] = 2 * (cov[i]?.[j] ?? 0);
  // Columns k and k+1: -1 and -μ
  for (let i = 0; i < k; i++) { A[i]![k] = -1; A[i]![k + 1] = -means[i]!; }
  // Row k: [1ᵀ | 0 | 0]
  for (let j = 0; j < k; j++) A[k]![j] = 1;
  // Row k+1: [μᵀ | 0 | 0]
  for (let j = 0; j < k; j++) A[k + 1]![j] = means[j]!;

  b[k] = 1;           // sum(w) = 1
  b[k + 1] = targetReturn; // μᵀw = μ_target (monthly)

  const sol = solveLinearSystem(A, b);
  if (!sol) return null;

  const weights = sol.slice(0, k);
  const ret = means.reduce((s, m, j) => s + m * weights[j]!, 0) * 12; // annualised
  const variance = portfolioVariance(weights, cov);
  const vol = Math.sqrt(Math.max(variance, 0)) * Math.sqrt(12);
  const sharpe = vol > 1e-9 ? ret / vol : 0;

  return { weights, vol, ret, sharpe };
}
