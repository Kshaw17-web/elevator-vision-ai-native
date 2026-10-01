# AI-Assisted Development

## 1. Project

**Elevator Vision -- Elevator Button Detection & Floor Recognition**

A computer vision system that detects elevator panel buttons using YOLOv8 and reads
floor labels using EasyOCR. This document covers the addition of a web prototype layer
on top of the existing working CLI pipeline.

---

## 2. Existing System

Before this session, the project contained a fully working CLI inference pipeline:

| Component | Technology | Role |
|-----------|-----------|------|
| Button detector | YOLOv8n -- custom trained models/best.pt | Detects bounding boxes around each elevator button |
| OCR engine | EasyOCR | Reads floor numbers and labels from each cropped button region |
| Floor selector | src/floor_selector.py | Normalizes candidates, picks highest-confidence match |
| CLI entry point | detect_floor.py | Accepts --image and --target-floor, prints structured output |

The pipeline was invoked as:

```
python detect_floor.py --image ".\examples\input\10_mp4-0011_jpg.rf.9174fb0023d67002761a4a000016f6c9.jpg" --target-floor "14"
```

And produced:

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

The goal of this session was to add a web interface to the existing system without
rewriting or replacing the YOLOv8 and EasyOCR inference pipeline.

---

## 3. AI Tool Used

**Antigravity** (Google DeepMind AI coding assistant), accessed through the Antigravity IDE.
Model: Claude Sonnet 4.6 (Thinking).

---

## 4. Tasks Given to AI

The AI was given a single detailed specification covering:

- Inspect the existing repository before modifying anything
- Preserve the existing CLI pipeline and all existing files
- Extract the inference logic into a callable function (it was already structured this way in detect_floor.py)
- Create a FastAPI backend in a new backend/ directory that calls detect_floor.run() directly
- Expose GET /health and POST /api/detect endpoints
- Create a Next.js 15 + TypeScript + Tailwind CSS frontend with image upload, target floor input, loading state, result display, and error handling
- Return the annotated image in the API response
- Write BUILD_WITH_AI.md and update README.md and .gitignore

A follow-up task was given after integration testing revealed a bug (described in section 6).

---

## 5. Where AI Helped

- Inspected all existing source files (detect_floor.py, src/detector.py, src/ocr.py, src/floor_selector.py) before writing any code
- Created backend/main.py: FastAPI application that patches sys.path so the existing src.* imports resolve, then calls detect_floor.run() directly with no duplication of YOLO or OCR logic
- Installed fastapi, uvicorn, and python-multipart into the existing venv
- Scaffolded the Next.js 15 frontend using create-next-app
- Created the complete single-page UI in frontend/src/app/page.tsx: drag-and-drop upload zone, target floor input, loading spinner, result card with confidence badges, coordinates display, annotated image display, all-buttons table, and error states
- Updated .gitignore to exclude frontend/node_modules, .next, and output/api_tmp
- Created backend/test_api.py smoke test using only Python stdlib
- Wrote the initial README.md and BUILD_WITH_AI.md

---

## 6. Where AI Was Wrong (Integration Bug)

**Bug: annotated image not browser-accessible**

The original backend/main.py embedded the annotated JPEG as a base64-encoded string
inside the JSON response body (~145 KB of base64 data embedded in JSON).

During integration testing, the frontend got stuck on the loading state after the
backend returned HTTP 200. The backend terminal confirmed the inference succeeded and
the annotated image was saved to disk. The issue was that parsing a large JSON body
containing ~145 KB of base64 data caused the browser to stall before the response
could be consumed.

Additionally, the frontend's detect() function was missing a finally block, meaning
that if resp.json() threw any exception, the loading state had no guaranteed exit.

**What was actually observed:**

- Backend: POST /api/detect HTTP/1.1 200 OK
- Backend terminal printed: annotated_image=C:\Users\...\b7d9d282..._annotated.jpg
- Frontend: remained on loading spinner indefinitely

**Fix applied:**

1. Backend: removed base64 embedding. The annotated image is now saved to disk and
   the response returns "annotated_image_url": "/api/result/<filename>" instead.

2. Backend: added GET /api/result/{filename} endpoint that serves the JPEG file
   directly. Only the basename is accepted; path traversal is rejected with HTTP 400.

3. Frontend: updated DetectResult type to use annotated_image_url instead of
   annotated_image. Updated the img src to construct the full backend URL.

4. Frontend: added a finally block to detect() so the loading state is always
   cleared regardless of success or failure.

---

## 7. Human Review and Testing

All tests were run from the project root with the venv active.

| Test | Command / Action | Result |
|------|-----------------|--------|
| Original CLI | python detect_floor.py --image ... --target-floor 14 | Passed -- identical output to pre-session baseline |
| Health endpoint | GET http://localhost:8000/health | {"status": "ok"} |
| Detect endpoint | backend/test_api.py smoke test | Passed -- target_found=true, bbox=[501,0,640,114], annotated_image_url present |
| Result image endpoint | GET http://localhost:8000/api/result/{filename} | Returned valid JPEG bytes |
| Frontend browser test | Opened localhost:3000, reviewed UI elements and error state | Page loaded, error banner showed on Detect without image |
| Error handling | Clicked Detect without selecting an image | Error banner displayed: "Please select an image first." |

The full end-to-end browser flow (upload image -> enter floor 14 -> Detect -> result
displayed with annotated image) was confirmed working after the integration bug fix.

---

## 8. Engineering Decisions

**Preserve the existing inference pipeline.**
detect_floor.py, src/detector.py, src/ocr.py, and src/floor_selector.py were not
modified. The FastAPI layer calls detect_floor.run() directly so there is no
duplicated YOLO or OCR logic anywhere.

**Thin backend layer.**
The backend does only what is necessary: receive the upload, write to a temp file,
call the existing inference function, and return the result. No new ML logic was added.

**Next.js / TypeScript for the frontend.**
Chosen to satisfy the internship application requirement for a modern frontend stack.

**Synchronous inference.**
The API waits for the full YOLO + EasyOCR inference before responding. This is
appropriate for a single-user prototype. A production system would use a task queue.

**No unnecessary infrastructure.**
No authentication, no database, no user accounts, no payment, no job queue. This is
intentionally a minimal prototype.

**Annotated image served as a file, not as base64.**
Embedding binary image data as base64 inside a JSON body creates an unnecessarily
large response and caused the browser to stall. Serving the image through a dedicated
GET endpoint is cleaner, standard HTTP practice.

**Reuse existing venv.**
fastapi, uvicorn, and python-multipart were installed into the project's existing
Python virtual environment rather than creating a separate backend environment.

---

## 9. Testing Summary

Tests performed during this session:

1. CLI regression -- detect_floor.py still produces identical output after adding the web layer
2. GET /health -- confirmed the backend starts and responds
3. POST /api/detect -- confirmed correct JSON response fields and values
4. GET /api/result/{filename} -- confirmed the annotated JPEG is served and is a valid JPEG
5. Frontend idle state -- page loads and displays all UI elements correctly
6. Frontend error state -- clicking Detect without an image shows the error banner
7. Integration bug identification and fix -- loading state now always clears

---

## 10. Final Architecture

```
Browser (Next.js -- localhost:3000)
      |
      |  POST /api/detect  (multipart/form-data)
      v
FastAPI backend (Uvicorn -- localhost:8000)
  backend/main.py
      |
      |  detect_floor.run(image_path, target_floor, save_dir)
      v
Existing inference pipeline (unmodified)
  detect_floor.py
  src/detector.py  ->  YOLOv8n (models/best.pt)
  src/ocr.py       ->  EasyOCR
  src/floor_selector.py
      |
      v
Annotated JPEG saved to output/api_tmp/annotated/
JSON response returned with annotated_image_url field
      |
      v  GET /api/result/{filename}
Frontend fetches annotated image and renders result card
```

---

## Current Status

The prototype is working locally. Both backend and frontend start with single commands.
The full inference flow -- image upload, YOLOv8 detection, EasyOCR floor reading,
target floor location, and annotated image display -- works end to end in the browser.

The project is ready for repository packaging. Next steps before any submission would be:

- Review the repository for any files that should be excluded before pushing
- Confirm .gitignore covers all generated outputs and secrets
- Tag a release commit
