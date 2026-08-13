"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HomeDashboardProvider } from "@/context/home-dashboard-context";
import { useHeaderState } from "@/context/header-state-context";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { HeaderDivider } from "@/components/dashboard/header-divider";

// ── design tokens ──────────────────────────────────────────────────────────────
const BG       = "#0c0d10";
const PANEL_BG = "linear-gradient(to bottom, #26262d, #111114)";
const PANEL    = "#111214";
const CBORD    = "rgba(255,255,255,0.055)";
const MUTED    = "rgba(180,192,210,0.6)";
const GOLD     = "#D6B24A";
const PRIMARY  = "#F0F2F6";
const FONT     = "var(--font-montserrat, 'Montserrat', sans-serif)";

// ── types ──────────────────────────────────────────────────────────────────────
interface Entry { name: string; isDir: boolean; ext: string | null }
interface DirCache { [path: string]: Entry[] }

const EXT_ICONS: Record<string, string> = {
  ".md": "📄", ".json": "📋", ".csv": "📊", ".txt": "📝",
  ".png": "🖼", ".jpg": "🖼", ".pdf": "📕", ".xlsx": "📊",
};
function entryIcon(e: Entry) {
  if (e.isDir) return "📁";
  return EXT_ICONS[e.ext ?? ""] ?? "📄";
}

// ── Markdown renderer (no external lib) ───────────────────────────────────────
function renderMd(raw: string): string {
  return raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) => `<pre style="background:#1a1b1e;padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:11px;font-family:monospace;color:#D6B24A;border:1px solid rgba(255,255,255,0.055);margin:10px 0">${c}</pre>`)
    // inline code
    .replace(/`([^`]+)`/g, `<code style="background:#1a1b1e;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;color:#D6B24A">$1</code>`)
    // headers
    .replace(/^#{4} (.+)$/gm, `<h4 style="font-size:13px;font-weight:700;color:#F0F2F6;margin:18px 0 6px;letter-spacing:-.01em;font-family:var(--font-montserrat,'Montserrat',sans-serif)">$1</h4>`)
    .replace(/^#{3} (.+)$/gm, `<h3 style="font-size:14px;font-weight:700;color:#F0F2F6;margin:20px 0 7px;letter-spacing:-.01em;font-family:var(--font-montserrat,'Montserrat',sans-serif)">$1</h3>`)
    .replace(/^#{2} (.+)$/gm, `<h2 style="font-size:16px;font-weight:700;color:#F0F2F6;margin:24px 0 8px;letter-spacing:-.02em;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.055);font-family:var(--font-montserrat,'Montserrat',sans-serif)">$1</h2>`)
    .replace(/^#{1} (.+)$/gm, `<h1 style="font-size:20px;font-weight:800;color:#F0F2F6;margin:0 0 12px;letter-spacing:-.03em;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);font-family:var(--font-montserrat,'Montserrat',sans-serif)">$1</h1>`)
    // bold / italic
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:#F0F2F6;font-weight:700">$1</strong>`)
    .replace(/\*([^*]+)\*/g, `<em style="color:rgba(240,242,246,0.75)">$1</em>`)
    // horizontal rule
    .replace(/^---+$/gm, `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.055);margin:20px 0"/>`)
    // blockquote
    .replace(/^&gt; (.+)$/gm, `<blockquote style="border-left:3px solid #D6B24A;margin:8px 0;padding:6px 14px;color:rgba(180,192,210,0.6);font-style:italic">$1</blockquote>`)
    // checkboxes
    .replace(/^- \[x\] (.+)$/gm, `<div style="display:flex;gap:8px;align-items:flex-start;margin:3px 0"><span style="color:#6ee7b7;margin-top:2px">✓</span><span style="color:rgba(180,192,210,0.6);text-decoration:line-through">$1</span></div>`)
    .replace(/^- \[ \] (.+)$/gm, `<div style="display:flex;gap:8px;align-items:flex-start;margin:3px 0"><span style="color:rgba(255,255,255,0.2);margin-top:2px">☐</span><span style="color:rgba(240,242,246,0.75)">$1</span></div>`)
    // bullet lists
    .replace(/^[-*] (.+)$/gm, `<div style="display:flex;gap:8px;align-items:flex-start;margin:3px 0"><span style="color:#D6B24A;margin-top:5px;font-size:5px;flex-shrink:0">●</span><span>$1</span></div>`)
    // numbered lists
    .replace(/^(\d+)\. (.+)$/gm, `<div style="display:flex;gap:8px;align-items:flex-start;margin:3px 0"><span style="color:#D6B24A;font-size:11px;font-weight:600;min-width:16px;text-align:right;flex-shrink:0">$1.</span><span>$2</span></div>`)
    // Obsidian [[wikilinks]]
    .replace(/\[\[([^\]]+)\]\]/g, `<span style="color:#D6B24A;border-bottom:1px dashed rgba(214,178,74,0.4);cursor:default" title="$1">$1</span>`)
    // [text](url) links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="color:#D6B24A" target="_blank" rel="noopener">$1</a>`)
    // newlines → breaks (but not inside pre)
    .replace(/\n/g, "<br/>");
}

// ── Tree node ─────────────────────────────────────────────────────────────────
function TreeNode({
  name, relPath, isDir, ext, depth, onSelect, selectedPath, openDirs, onToggle,
}: {
  name: string; relPath: string; isDir: boolean; ext: string | null; depth: number;
  onSelect: (p: string, isDir: boolean) => void;
  selectedPath: string; openDirs: Set<string>; onToggle: (p: string) => void;
}) {
  const isOpen     = openDirs.has(relPath);
  const isSelected = selectedPath === relPath;
  return (
    <div>
      <div
        onClick={() => { onSelect(relPath, isDir); if (isDir) onToggle(relPath); }}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: `3px 8px 3px ${8 + depth * 14}px`,
          cursor: "pointer", borderRadius: 5, userSelect: "none",
          background: isSelected ? "linear-gradient(to bottom, #26262d, #111114)" : "transparent",
          border: isSelected ? "1px solid rgba(255,255,255,0.28)" : "1px solid transparent",
          color: isSelected ? "#F3F3F4" : "#6a6e7a",
          fontSize: 12, fontFamily: FONT, fontWeight: isDir ? 600 : 400,
          transition: "background .1s",
        }}
      >
        {isDir && (
          <span style={{ fontSize: 8, color: MUTED, marginRight: 1, transform: isOpen ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
        )}
        <span style={{ fontSize: 13 }}>{entryIcon({ name, isDir, ext })}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{name}</span>
      </div>
    </div>
  );
}

// ── Main browser ──────────────────────────────────────────────────────────────
function BrainBrowserInner() {
  const [dirCache, setDirCache]     = useState<DirCache>({});
  const [openDirs, setOpenDirs]     = useState<Set<string>>(new Set([""]));
  const [selectedPath, setSelected] = useState<string>("");
  const [fileContent, setContent]   = useState<{ text: string; ext: string; mtime: string } | null>(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState("");
  const contentRef                  = useRef<HTMLDivElement>(null);

  const loadDir = useCallback(async (rel: string) => {
    if (dirCache[rel]) return;
    const r = await fetch(`/api/brain/ls?path=${encodeURIComponent(rel)}`);
    const d = await r.json();
    if (d.entries) setDirCache(c => ({ ...c, [rel]: d.entries as Entry[] }));
  }, [dirCache]);

  useEffect(() => { loadDir(""); }, []);// eslint-disable-line react-hooks/exhaustive-deps

  function toggleDir(rel: string) {
    setOpenDirs(s => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel); else { n.add(rel); loadDir(rel); }
      return n;
    });
  }

  async function selectPath(rel: string, isDir: boolean) {
    setSelected(rel);
    if (isDir) return;
    setLoading(true);
    setContent(null);
    try {
      const r = await fetch(`/api/brain/file?path=${encodeURIComponent(rel)}`);
      const d = await r.json();
      if (d.content != null) setContent({ text: d.content, ext: d.ext, mtime: d.mtime });
    } finally { setLoading(false); }
    setTimeout(() => contentRef.current?.scrollTo({ top: 0 }), 50);
  }

  // flat recursive tree renderer
  function renderTree(parentPath: string, depth: number): React.ReactNode[] {
    const entries = dirCache[parentPath] ?? [];
    const filtered = search
      ? entries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
      : entries;
    return filtered.flatMap(e => {
      const rel = parentPath ? `${parentPath}/${e.name}` : e.name;
      const nodes: React.ReactNode[] = [
        <TreeNode key={rel} name={e.name} relPath={rel} isDir={e.isDir} ext={e.ext}
          depth={depth} onSelect={selectPath} selectedPath={selectedPath}
          openDirs={openDirs} onToggle={toggleDir} />
      ];
      if (e.isDir && openDirs.has(rel) && dirCache[rel]) {
        nodes.push(...renderTree(rel, depth + 1));
      }
      return nodes;
    });
  }

  // breadcrumb from selectedPath
  const crumbs = selectedPath ? selectedPath.split("/") : [];

  const isJson = fileContent?.ext === ".json";
  let jsonFormatted: string | null = null;
  if (isJson) {
    try { jsonFormatted = JSON.stringify(JSON.parse(fileContent!.text), null, 2); } catch { jsonFormatted = fileContent!.text; }
  }

  const fmtSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0, background: BG, overflow: "hidden" }}>
      {/* ── Sidebar tree ─────────────────────────────────────────────────── */}
      <div style={{
        width: 260, flexShrink: 0, borderRight: `1px solid ${CBORD}`,
        display: "flex", flexDirection: "column", background: PANEL_BG, overflow: "hidden",
      }}>
        {/* search */}
        <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${CBORD}` }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Suchen…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${CBORD}`,
              borderRadius: 7, padding: "6px 10px", fontSize: 11, fontFamily: FONT,
              color: "#fff", outline: "none",
            }}
          />
        </div>
        {/* tree */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 4px" }}>
          {renderTree("", 0)}
        </div>
      </div>

      {/* ── Content panel ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* breadcrumb bar */}
        <div style={{
          padding: "0 20px", height: 38, display: "flex", alignItems: "center", gap: 6,
          borderBottom: `1px solid ${CBORD}`, background: PANEL_BG, flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: MUTED, fontFamily: FONT, cursor: "pointer", letterSpacing: "0.04em", fontWeight: 700, textTransform: "uppercase" as const }} onClick={() => { setSelected(""); setContent(null); }}>
            Brain
          </span>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: MUTED, fontSize: 10 }}>›</span>
              <span style={{ fontSize: 11, fontFamily: FONT, color: i === crumbs.length - 1 ? PRIMARY : MUTED, fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>{c}</span>
            </span>
          ))}
          {fileContent && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED, fontFamily: FONT }}>
              {fmtDate(fileContent.mtime)}
            </span>
          )}
        </div>

        {/* content area */}
        <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
          {loading && (
            <div style={{ color: MUTED, fontSize: 12, fontFamily: FONT }}>Lade…</div>
          )}

          {!loading && !selectedPath && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: PRIMARY, fontFamily: FONT, letterSpacing: "-.03em" }}>Capitalife Brain</div>
              <div style={{ fontSize: 13, color: MUTED, fontFamily: FONT }}>Wähle eine Datei im Baum links aus.</div>
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(dirCache[""] ?? []).filter(e => e.isDir).map(e => (
                  <div key={e.name} onClick={() => { toggleDir(e.name); setSelected(e.name); }}
                    style={{
                      background: PANEL_BG, border: `1px solid ${CBORD}`,
                      borderRadius: 10, padding: "10px 16px", cursor: "pointer",
                      fontFamily: FONT, fontSize: 12, color: PRIMARY,
                      fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
                    }}>
                    📁 {e.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && fileContent && (
            <div>
              {isJson ? (
                <pre style={{ fontFamily: "monospace", fontSize: 11, color: GOLD, background: PANEL_BG, padding: 20, borderRadius: 10, overflow: "auto", border: `1px solid ${CBORD}`, lineHeight: 1.6 }}>
                  {jsonFormatted}
                </pre>
              ) : fileContent.ext === ".md" ? (
                <div
                  style={{ fontFamily: FONT, fontSize: 13, lineHeight: 1.75, color: PRIMARY, maxWidth: 760 }}
                  dangerouslySetInnerHTML={{ __html: renderMd(fileContent.text) }}
                />
              ) : (
                <pre style={{ fontFamily: "monospace", fontSize: 11, color: MUTED, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {fileContent.text}
                </pre>
              )}
            </div>
          )}

          {!loading && selectedPath && !fileContent && !loading && (
            <div>
              {/* Directory listing */}
              <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, fontFamily: FONT, marginBottom: 16, letterSpacing: "-.02em" }}>
                📁 {selectedPath.split("/").pop()}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(dirCache[selectedPath] ?? []).map(e => {
                  const rel = `${selectedPath}/${e.name}`;
                  return (
                    <div key={e.name}
                      onClick={() => { selectPath(rel, e.isDir); if (e.isDir) toggleDir(rel); }}
                      style={{
                        background: PANEL_BG, border: `1px solid ${CBORD}`,
                        borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                        fontFamily: FONT, fontSize: 12, color: e.isDir ? PRIMARY : MUTED,
                        fontWeight: e.isDir ? 600 : 400, display: "flex", alignItems: "center", gap: 7,
                      }}>
                      {entryIcon(e)} {e.name}
                    </div>
                  );
                })}
                {!dirCache[selectedPath] && (
                  <div style={{ fontSize: 12, color: MUTED, fontFamily: FONT }}>Lade Ordner…</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BrainFileBrowser() {
  const { headerHidden } = useHeaderState();
  const [headerHover, setHeaderHover] = useState(false);
  const headerFixedVisible = !headerHidden;
  const headerOverlayVisible = headerHidden && headerHover;

  return (
    <HomeDashboardProvider initialReportTrades={[]} initialBalanceRows={[]}>
      <div style={{ position: "relative", display: "flex", height: "100vh", minWidth: 0, background: "#0c0d10", overflow: "hidden" }}>
        <Sidebar />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, paddingLeft: 72 }}>
          {headerHidden && (
            <div
              style={{
                position: "absolute", top: 0, right: 0, zIndex: 20, width: 120, height: 10,
              }}
              onMouseEnter={() => setHeaderHover(true)}
              onMouseLeave={() => setHeaderHover(false)}
            />
          )}
          {headerFixedVisible && (
            <div
              style={{
                overflow: "hidden",
                width: "100%",
                background: "#0c0d10",
                boxShadow: "none",
              }}
            >
              <Topbar sectionLabel="Brain Vault" visible={true} />
              <HeaderDivider visible={true} />
            </div>
          )}
          {headerHidden && (
            <div
              style={{ position: "absolute", top: 0, left: 72, right: 0, zIndex: 30, pointerEvents: "none" }}
            >
              <div
                onMouseEnter={() => setHeaderHover(true)}
                onMouseLeave={() => setHeaderHover(false)}
                style={{
                  pointerEvents: "auto",
                  overflow: "hidden",
                  width: "100%",
                  background: headerOverlayVisible ? "linear-gradient(180deg, rgba(10,10,12,0.28) 0%, rgba(10,10,12,0.14) 100%)" : "transparent",
                  backdropFilter: headerOverlayVisible ? "blur(38px) saturate(182%) brightness(1.05)" : "none",
                  boxShadow: headerOverlayVisible ? "0 24px 48px rgba(0,0,0,0.44)" : "none",
                  transition: "background 220ms ease, backdrop-filter 220ms ease, box-shadow 220ms ease",
                }}
              >
                <Topbar sectionLabel="Brain Vault" visible={headerOverlayVisible} />
                <HeaderDivider visible={headerOverlayVisible} />
              </div>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", paddingLeft: 10 }}>
            <BrainBrowserInner />
          </div>
        </div>
      </div>
    </HomeDashboardProvider>
  );
}
