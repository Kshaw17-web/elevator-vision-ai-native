"""Quick API smoke test -- verifies new annotated_image_url shape."""
import urllib.request
import json
import sys

IMAGE_PATH = r"examples\input\10_mp4-0011_jpg.rf.9174fb0023d67002761a4a000016f6c9.jpg"
TARGET_FLOOR = "14"
BASE = "http://127.0.0.1:8000"

boundary = b"ElevatorVisionBoundary"

with open(IMAGE_PATH, "rb") as f:
    img_bytes = f.read()

body = (
    b"--" + boundary + b"\r\n"
    b'Content-Disposition: form-data; name="image"; filename="test.jpg"\r\n'
    b"Content-Type: image/jpeg\r\n\r\n"
    + img_bytes
    + b"\r\n--" + boundary + b"\r\n"
    b'Content-Disposition: form-data; name="target_floor"\r\n\r\n'
    + TARGET_FLOOR.encode()
    + b"\r\n--" + boundary + b"--\r\n"
)

req = urllib.request.Request(
    f"{BASE}/api/detect",
    data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode()}"},
    method="POST",
)

try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print("=== POST /api/detect ===")
    for k, v in data.items():
        if k == "all_buttons":
            print(f"  all_buttons: {len(v)} buttons")
        else:
            print(f"  {k}: {v}")

    # Verify the URL field is present and the image file is fetchable
    url = data.get("annotated_image_url")
    assert url, "FAIL: annotated_image_url missing from response"
    assert url.startswith("/api/result/"), f"FAIL: unexpected URL format: {url}"
    print(f"\n  annotated_image_url: {url}  OK")

    # Fetch the image via the new endpoint
    img_req = urllib.request.urlopen(f"{BASE}{url}")
    img_data = img_req.read()
    assert len(img_data) > 0, "FAIL: image response is empty"
    assert img_data[:2] == b"\xff\xd8", "FAIL: response is not a JPEG"
    print(f"  GET {url} -> {len(img_data)} bytes, valid JPEG  OK")

    # Verify old base64 field is gone
    assert "annotated_image" not in data, "FAIL: old base64 field still present"
    print("\n=== PASS ===")

except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
except AssertionError as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
