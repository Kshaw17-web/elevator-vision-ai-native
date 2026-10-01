"""
FastAPI backend for Elevator Vision.

Wraps the existing detect_floor.run() inference function and exposes:
  GET  /health                  — liveness check
  POST /api/detect              — multipart: image file + target_floor string
  GET  /api/result/{filename}   — serve annotated output image
"""

import os
import sys
import traceback
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ---------------------------------------------------------------------------
# Make the project root importable so detect_floor / src.* can be imported.
# ---------------------------------------------------------------------------
_BACKEND_DIR = Path(__file__).resolve().parent
_ROOT = _BACKEND_DIR.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from detect_floor import run as _detect_run  # noqa: E402  (after sys.path patch)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Elevator Vision API",
    description="Detect and locate elevator floor buttons using YOLOv8 + EasyOCR.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Allowed image MIME types
_ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


@app.post("/api/detect", tags=["inference"])
async def detect(
    image: UploadFile = File(..., description="Elevator panel image (JPEG / PNG)."),
    target_floor: str = Form(..., description="Target floor label, e.g. '14' or 'B1'."),
):
    # ---- Validate inputs ------------------------------------------------
    if not target_floor or not target_floor.strip():
        raise HTTPException(status_code=422, detail="target_floor must not be empty.")

    content_type = (image.content_type or "").lower()
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{content_type}'. Allowed: jpeg, png, webp.",
        )

    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    if len(raw) > _MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(raw) // 1024} KB). Max 20 MB.",
        )

    # ---- Save to temp file (existing pipeline expects a file path) -------
    suffix = Path(image.filename or "upload.jpg").suffix or ".jpg"
    tmp_dir = _ROOT / "output" / "api_tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4().hex}{suffix}"

    try:
        tmp_path.write_bytes(raw)

        # ---- Run inference -----------------------------------------------
        ann_dir = tmp_dir / "annotated"
        ann_dir.mkdir(parents=True, exist_ok=True)

        target_found, buttons, target_button = _detect_run(
            str(tmp_path),
            target_floor=target_floor.strip(),
            save_dir=str(ann_dir),
        )

        # ---- Build response dict -----------------------------------------
        result: dict = {
            "target_floor": target_floor.strip(),
            "target_found": target_found,
            "total_buttons_detected": len(buttons),
        }

        if target_found and target_button:
            result["bbox"] = target_button["bbox"]
            result["center"] = target_button["center"]
            result["detection_confidence"] = round(target_button["yolo_confidence"], 4)
            result["ocr_confidence"] = round(target_button["ocr_confidence"], 4)
            result["ocr_text"] = target_button["floor"]

        # All detected buttons (always include for context)
        result["all_buttons"] = [
            {
                "floor": b["floor"],
                "bbox": b["bbox"],
                "center": b["center"],
                "yolo_confidence": round(b["yolo_confidence"], 4),
                "ocr_confidence": round(b["ocr_confidence"], 4),
            }
            for b in buttons
        ]

        # ---- Annotated image — return a URL, not base64 ------------------
        # Embedding ~145 KB as a base64 string inside JSON caused the browser
        # to stall while parsing, leaving the frontend stuck in loading state.
        stem = tmp_path.stem
        ann_filename = f"{stem}_annotated.jpg"
        ann_path = ann_dir / ann_filename
        if ann_path.exists():
            result["annotated_image_url"] = f"/api/result/{ann_filename}"

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Inference error: {str(exc)}",
        )
    finally:
        # Clean up temp input file (annotated output kept briefly for debugging)
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Serve annotated result images
# ---------------------------------------------------------------------------

_ANN_DIR = _ROOT / "output" / "api_tmp" / "annotated"


@app.get("/api/result/{filename}", tags=["inference"])
def get_result_image(filename: str):
    """
    Serve an annotated output image by filename.

    Only the basename is accepted — path traversal (../) is rejected.
    Files are stored in output/api_tmp/annotated/ and are not secret.
    """
    # Guard: reject any path components (e.g. ../../etc/passwd)
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name.endswith((".jpg", ".jpeg", ".png")):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = _ANN_DIR / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Result image not found.")

    return FileResponse(str(file_path), media_type="image/jpeg")

