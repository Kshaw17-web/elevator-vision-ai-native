"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedButton {
  floor: string;
  bbox: [number, number, number, number];
  center: [number, number];
  yolo_confidence: number;
  ocr_confidence: number;
}

interface DetectResult {
  target_floor: string;
  target_found: boolean;
  total_buttons_detected: number;
  bbox?: [number, number, number, number];
  center?: [number, number];
  detection_confidence?: number;
  ocr_confidence?: number;
  ocr_text?: string;
  all_buttons?: DetectedButton[];
  annotated_image_url?: string;  // relative path: /api/result/<filename>
}

type AppState = "idle" | "loading" | "done" | "error";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 90 ? "#10b981" : pct >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <span
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 13,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {pct}%
    </span>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${accent ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 10,
        padding: "14px 18px",
      }}
    >
      <div
        style={{ fontSize: 11, color: "#8b9cbf", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#f0f4ff" }}>{value}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [targetFloor, setTargetFloor] = useState<string>("");
  const [state, setState] = useState<AppState>("idle");
  const [result, setResult] = useState<DetectResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setErrorMsg("Please select a JPEG, PNG, or WebP image.");
      setState("error");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setErrorMsg("Image must be smaller than 20 MB.");
      setState("error");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setErrorMsg("");
    setState("idle");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  const clearImage = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setErrorMsg("");
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  // ── Inference ────────────────────────────────────────────────────────────

  const detect = async () => {
    if (!file) {
      setErrorMsg("Please select an image first.");
      setState("error");
      return;
    }
    if (!targetFloor.trim()) {
      setErrorMsg("Please enter a target floor (e.g. 14 or B1).");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMsg("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("image", file);
      form.append("target_floor", targetFloor.trim());

      const resp = await fetch(`${API_BASE}/api/detect`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail ?? `HTTP ${resp.status}`);
      }

      const data: DetectResult = await resp.json();
      setResult(data);
      setState("done");
    } catch (err: unknown) {
      const message =
        err instanceof TypeError && err.message.includes("fetch")
          ? "Cannot connect to backend (is it running on port 8000?)"
          : err instanceof Error
          ? err.message
          : "Unknown error";
      setErrorMsg(message);
      setState("error");
    } finally {
      // Safety net: if state is still "loading" after success or failure,
      // fall back to idle so the UI is never permanently stuck.
      setState((prev) => (prev === "loading" ? "idle" : prev));
    }
  };

  const reset = () => {
    clearImage();
    setTargetFloor("");
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 16px 80px",
      }}
    >
      {/* ── Header ── */}
      <header style={{ textAlign: "center", marginBottom: 48, maxWidth: 640 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: 100,
            padding: "6px 16px",
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 13, color: "#60a5fa", fontWeight: 500 }}>
            YOLOv8 · EasyOCR · Computer Vision
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3rem)",
            fontWeight: 800,
            margin: 0,
            background: "linear-gradient(135deg, #f0f4ff 0%, #93c5fd 60%, #60a5fa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.15,
          }}
        >
          Elevator Vision
        </h1>
        <p
          style={{
            color: "#8b9cbf",
            marginTop: 12,
            fontSize: 16,
            lineHeight: 1.6,
          }}
        >
          Detect and locate elevator buttons using computer vision and OCR.
        </p>
      </header>

      {/* ── Main Card ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ─ Upload + Input row ─ */}
        <div
          style={{
            background: "rgba(17, 24, 39, 0.8)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 28,
            backdropFilter: "blur(12px)",
          }}
        >
          <h2 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#f0f4ff" }}>
            Upload Panel Image
          </h2>

          {/* Drop zone */}
          <div
            id="drop-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !file && inputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#3b82f6" : preview ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: 12,
              padding: preview ? 0 : "40px 20px",
              textAlign: "center",
              cursor: preview ? "default" : "pointer",
              transition: "border-color 0.2s, background 0.2s",
              background: isDragging
                ? "rgba(59,130,246,0.07)"
                : preview
                ? "transparent"
                : "rgba(255,255,255,0.02)",
              position: "relative",
              overflow: "hidden",
              minHeight: preview ? 0 : 160,
            }}
          >
            {preview ? (
              <div style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Preview"
                  style={{
                    width: "100%",
                    maxHeight: 320,
                    objectFit: "contain",
                    borderRadius: 10,
                    display: "block",
                  }}
                />
                <button
                  id="clear-image-btn"
                  onClick={(e) => { e.stopPropagation(); clearImage(); }}
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    background: "rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#f0f4ff",
                    borderRadius: 8,
                    padding: "4px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ✕ Clear
                </button>
                {file && (
                  <div style={{ padding: "8px 12px", fontSize: 13, color: "#8b9cbf" }}>
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🖼️</div>
                <div style={{ color: "#8b9cbf", fontSize: 14 }}>
                  Drag & drop an image here, or{" "}
                  <span style={{ color: "#60a5fa", textDecoration: "underline" }}>browse</span>
                </div>
                <div style={{ color: "#4b5a72", fontSize: 12, marginTop: 6 }}>
                  JPEG · PNG · WebP · max 20 MB
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            id="image-file-input"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            style={{ display: "none" }}
          />

          {/* Target floor + Detect button */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 160px" }}>
              <label
                htmlFor="target-floor-input"
                style={{ display: "block", fontSize: 13, color: "#8b9cbf", marginBottom: 6 }}
              >
                Target Floor
              </label>
              <input
                id="target-floor-input"
                type="text"
                value={targetFloor}
                onChange={(e) => setTargetFloor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && detect()}
                placeholder="e.g. 14 or B1"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#f0f4ff",
                  fontSize: 15,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ flex: "2 1 200px", display: "flex", alignItems: "flex-end" }}>
              <button
                id="detect-btn"
                onClick={detect}
                disabled={state === "loading"}
                style={{
                  width: "100%",
                  padding: "11px 28px",
                  fontSize: 15,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "none",
                  cursor: state === "loading" ? "wait" : "pointer",
                  background:
                    state === "loading"
                      ? "rgba(59,130,246,0.4)"
                      : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#fff",
                  boxShadow:
                    state === "loading" ? "none" : "0 0 24px rgba(59,130,246,0.3)",
                  transition: "all 0.2s",
                }}
              >
                {state === "loading" ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                    Detecting…
                  </span>
                ) : (
                  "🔍 Detect"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ─ Error banner ─ */}
        {state === "error" && (
          <div
            id="error-banner"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 12,
              padding: "14px 20px",
              color: "#fca5a5",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 18 }}>⚠️</span>
            {errorMsg}
          </div>
        )}

        {/* ─ Results ─ */}
        {state === "done" && result && (
          <div
            id="results-section"
            style={{
              background: "rgba(17,24,39,0.8)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: 28,
              backdropFilter: "blur(12px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Detection Results</h2>

              {/* Found / Not Found badge */}
              <span
                id="target-found-badge"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 600,
                  background: result.target_found
                    ? "rgba(16,185,129,0.12)"
                    : "rgba(239,68,68,0.12)",
                  border: `1px solid ${result.target_found ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                  color: result.target_found ? "#34d399" : "#f87171",
                }}
              >
                {result.target_found ? "✓ Target Found" : "✗ Target Not Found"}
              </span>
            </div>

            {/* Stats grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12,
                marginBottom: 22,
              }}
            >
              <StatCard label="Target Floor" value={result.target_floor} accent />
              <StatCard label="Buttons Detected" value={result.total_buttons_detected} />
              {result.target_found && (
                <>
                  <StatCard
                    label="Detection Conf."
                    value={<ConfidenceBadge value={result.detection_confidence!} />}
                  />
                  <StatCard
                    label="OCR Conf."
                    value={<ConfidenceBadge value={result.ocr_confidence!} />}
                  />
                  <StatCard label="OCR Text" value={result.ocr_text ?? "—"} />
                </>
              )}
            </div>

            {/* Coordinates */}
            {result.target_found && result.bbox && (
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "14px 18px",
                  marginBottom: 22,
                  fontSize: 13,
                  color: "#8b9cbf",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                <span style={{ color: "#4b5a72" }}>bbox </span>
                <span id="result-bbox" style={{ color: "#93c5fd" }}>
                  [{result.bbox.join(", ")}]
                </span>
                {"  "}
                <span style={{ color: "#4b5a72" }}>center </span>
                <span id="result-center" style={{ color: "#93c5fd" }}>
                  [{result.center?.join(", ")}]
                </span>
              </div>
            )}

            {/* Not found message */}
            {!result.target_found && (
              <div
                style={{
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  borderRadius: 10,
                  padding: "14px 18px",
                  color: "#fcd34d",
                  fontSize: 14,
                  marginBottom: 22,
                }}
              >
                Floor <strong>{result.target_floor}</strong> was not found among the{" "}
                {result.total_buttons_detected} detected buttons. The floor label may not be
                readable or may not exist on this panel.
              </div>
            )}

            {/* Annotated image */}
            {result.annotated_image_url && (
              <div>
                <div style={{ fontSize: 13, color: "#8b9cbf", marginBottom: 10 }}>
                  Annotated Output
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  id="annotated-image"
                  src={`${API_BASE}${result.annotated_image_url}`}
                  alt="Annotated panel"
                  onError={(e) => {
                    // Hide the broken image placeholder gracefully
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
              </div>
            )}

            {/* All buttons table */}
            {result.all_buttons && result.all_buttons.length > 0 && (
              <details style={{ marginTop: 20 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#8b9cbf",
                    padding: "8px 0",
                    userSelect: "none",
                  }}
                >
                  All {result.total_buttons_detected} detected buttons ▸
                </summary>
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 12,
                      color: "#8b9cbf",
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["Floor", "BBox", "Center", "YOLO Conf", "OCR Conf"].map((h) => (
                          <th
                            key={h}
                            style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.all_buttons.map((b, i) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                            background:
                              b.floor === result.target_floor
                                ? "rgba(16,185,129,0.05)"
                                : "transparent",
                          }}
                        >
                          <td style={{ padding: "6px 10px", color: "#f0f4ff", fontWeight: 600 }}>
                            {b.floor}
                          </td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>
                            [{b.bbox.join(",")}]
                          </td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>
                            [{b.center.join(",")}]
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <ConfidenceBadge value={b.yolo_confidence} />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <ConfidenceBadge value={b.ocr_confidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {/* Reset button */}
            <button
              id="reset-btn"
              onClick={reset}
              style={{
                marginTop: 24,
                width: "100%",
                padding: "10px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "#8b9cbf",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ↺ Reset — try another image
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ marginTop: 60, color: "#4b5a72", fontSize: 12, textAlign: "center" }}>
        Elevator Vision · YOLOv8 + EasyOCR · Internship Prototype
      </footer>

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
