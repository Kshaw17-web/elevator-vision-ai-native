# Elevator Vision

> Detect and locate elevator floor buttons using YOLOv8 object detection and EasyOCR -- now with a web interface.

---

## Overview

**Elevator Vision** is a computer vision system that:

1. Detects individual buttons on elevator panels using a custom-trained YOLOv8n model
2. Runs OCR on each detected button crop to read the floor label
3. Locates a requested target floor and returns its position, confidence scores, and a visual annotation

This repository contains the original CLI pipeline **plus** a FastAPI backend and Next.js frontend built as a web prototype for an AI-Native Full Stack Developer internship application.

---

## Problem

In elevator automation, robotics, or accessibility applications, a system needs to:

- Identify all buttons on a panel from a camera image
- Find the button corresponding to a requested floor
- Return its location so a downstream actuator or UI can act on it

---

## Features

- Button detection -- YOLOv8n trained on a custom elevator panel dataset
- OCR floor reading -- EasyOCR with multi-pass contrast enhancement
- Floor locator -- given a target floor label, returns bbox, center, and confidence
- Annotated output image -- buttons highlighted, target button marked
- Web interface -- upload image in browser, see results instantly
- REST API -- POST /api/detect for programmatic access
- CLI -- original command-line interface still works unchanged

---

## Architecture

```
Browser (Next.js -- port 3000)
      |
      |  POST /api/detect  (multipart/form-data: image + target_floor)
      v
FastAPI backend (Uvicorn -- port 8000)
  backend/main.py
      |
      |  detect_floor.run(image_path, target_floor, save_dir)
      v
Existing inference pipeline (unchanged)
  detect_floor.py -> src/detector.py (YOLOv8n)
                  -> src/ocr.py (EasyOCR)
                  -> src/floor_selector.py
      |
      v
Structured result dict + annotated JPEG saved to disk
      |
      v
FastAPI returns JSON with annotated_image_url field
      |
      v  GET /api/result/{filename}
Frontend fetches and renders annotated image
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Object detection | YOLOv8n (ultralytics) |
| OCR | EasyOCR |
| Backend API | FastAPI + Uvicorn |
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Image processing | OpenCV |

---

## Project Structure

```
elevator-vision-ai-native/
|-- detect_floor.py          # CLI entry point (unchanged)
|-- inference.py             # Original all-buttons inference CLI
|-- train.py                 # Model training script
|-- data.yaml                # Dataset config
|-- requirements.txt         # Core Python deps
|
|-- src/
|   |-- detector.py          # YOLOv8 wrapper
|   |-- ocr.py               # EasyOCR pipeline
|   `-- floor_selector.py    # Floor label normaliser and voter
|
|-- models/
|   `-- best.pt              # Trained YOLOv8n weights (~6 MB)
|
|-- backend/
|   |-- main.py              # FastAPI application
|   |-- requirements.txt     # Backend-specific deps
|   `-- test_api.py          # API smoke test
|
|-- frontend/                # Next.js 15 app
|   |-- src/app/
|   |   |-- page.tsx         # Main UI page
|   |   |-- layout.tsx       # App shell
|   |   `-- globals.css      # Design tokens
|   `-- .env.local           # API URL config
|
|-- examples/
|   `-- input/               # Sample test images
|
|-- dataset_button/
|   `-- test/                # Test split (kept for reproducibility)
|
|-- BUILD_WITH_AI.md         # AI-assisted development write-up
|-- EVALUATION_REPORT.md     # Model evaluation metrics
`-- .gitignore
```

---

## How to Run Locally

### Prerequisites

- Python 3.9+ with the existing venv (or install from requirements.txt)
- Node.js 18+

---

### 1. Backend (FastAPI)

```powershell
# From project root, activate venv
.\venv\Scripts\Activate.ps1

# Install backend deps (one time only)
pip install fastapi "uvicorn[standard]" python-multipart

# Start the API server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The API will be available at http://localhost:8000.
Swagger docs at http://localhost:8000/docs.

---

### 2. Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

---

### 3. CLI (original, unchanged)

```powershell
.\venv\Scripts\Activate.ps1
python detect_floor.py --image ".\examples\input\10_mp4-0011_jpg.rf.9174fb0023d67002761a4a000016f6c9.jpg" --target-floor "14"
```

---

## API Documentation

### GET /health

```json
{ "status": "ok" }
```

---

### POST /api/detect

**Request:** multipart/form-data

| Field | Type | Description |
|-------|------|-------------|
| image | file | JPEG / PNG / WebP, max 20 MB |
| target_floor | string | Floor label, e.g. "14" or "B1" |

**Response (target found):**

```json
{
  "target_floor": "14",
  "target_found": true,
  "total_buttons_detected": 9,
  "bbox": [501, 0, 640, 114],
  "center": [570, 57],
  "detection_confidence": 0.9029,
  "ocr_confidence": 1.0,
  "ocr_text": "14",
  "annotated_image_url": "/api/result/abc123_annotated.jpg",
  "all_buttons": [...]
}
```

**Response (target not found):**

```json
{
  "target_floor": "99",
  "target_found": false,
  "total_buttons_detected": 9,
  "annotated_image_url": "/api/result/abc123_annotated.jpg",
  "all_buttons": [...]
}
```

---

### GET /api/result/{filename}

Serves the annotated output JPEG by filename. The filename comes from the
`annotated_image_url` field in the POST /api/detect response.

Only the basename is accepted -- path traversal attempts are rejected with HTTP 400.

---

## Example curl Request

```bash
curl -X POST http://localhost:8000/api/detect \
  -F "image=@examples/input/10_mp4-0011_jpg.rf.9174fb0023d67002761a4a000016f6c9.jpg" \
  -F "target_floor=14"
```

Smoke test (uses Python stdlib, no extra deps):

```powershell
.\venv\Scripts\python backend\test_api.py
```

---

## Sample Result

From the CLI and API using the included test image:

```
total_buttons_detected=9
target_floor=14
target_found=true
bbox=[501, 0, 640, 114]
center=[570, 57]
detection_confidence=0.9029
ocr_confidence=1.0
ocr_text=14
```

---

## Model Information

| Property | Value |
|----------|-------|
| Architecture | YOLOv8n |
| Task | Object detection (single class: button) |
| Weights | models/best.pt (~6 MB) |
| Input | Any resolution (auto-resized by ultralytics) |
| Confidence threshold | 0.45 |
| Training dataset | Custom Roboflow elevator button dataset |

Full detector evaluation metrics (mAP, precision, recall) are in EVALUATION_REPORT.md.
End-to-end OCR and floor-recognition accuracy depends on image quality and button legibility.

---

## Environment Variables

| Variable | File | Default | Description |
|----------|------|---------|-------------|
| NEXT_PUBLIC_API_URL | frontend/.env.local | http://localhost:8000 | Backend URL |

No API keys or secrets are required.

---

## Known Limitations

- EasyOCR cold-start takes 15-45 seconds on first request (model loads on demand)
- Supported floor labels: 1-30, B1, B2, B3 (configurable in src/floor_selector.py)
- No GPU acceleration (CPU-only inference)
- No inference queue -- concurrent requests will serialize
- Annotated images persist in output/api_tmp/annotated/ until manually cleared

---

## AI-Assisted Development

This prototype was built with assistance from the Antigravity AI coding tool.
See BUILD_WITH_AI.md for a full write-up.

---

## Dataset Credit

Dataset sourced from Roboflow. See README.dataset.txt and README.roboflow.txt for attribution.
