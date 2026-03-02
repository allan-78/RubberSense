import sys
import os
print("Importing torch...", flush=True)
import torch
print("Torch imported.", flush=True)

# Move ultralytics import to the top to avoid potential DLL/OpenMP conflicts with cv2
print("Attempting to import ultralytics...", flush=True)
try:
    from ultralytics import YOLO
    print("✅ Ultralytics imported successfully", flush=True)
except ImportError as e:
    print(f"❌ Ultralytics import error: {e}", flush=True)
    sys.exit(1)
except Exception as e:
    print(f"❌ Ultralytics unknown error: {e}", flush=True)
    sys.exit(1)

import cv2
import numpy as np
import requests
import traceback

# Add parent directory to path to import main and disease_mapping
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from disease_mapping import map_trunk_disease
    print("✅ Imported disease_mapping successfully", flush=True)
except ImportError:
    print("⚠️ Could not import disease_mapping. Mapping verification will be skipped.", flush=True)
    def map_trunk_disease(name): return name, "unknown", "Mapping unavailable"

# Path to the model
model_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/Trunks.pt')

print(f"\n🔍 Checking for model at: {model_path}", flush=True)

if not os.path.exists(model_path):
    print("❌ Trunks.pt not found! Please place it in backend/ai_service/models/rubber_tree_model/weights/", flush=True)
    # Attempt to use best.pt as fallback for testing logic if Trunks.pt is missing
    fallback_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/best.pt')
    if os.path.exists(fallback_path):
        print(f"⚠️ Falling back to best.pt for testing logic: {fallback_path}", flush=True)
        model_path = fallback_path
    else:
        sys.exit(1)

def download_image(url):
    try:
        print(f"⬇️ Downloading test image from: {url}", flush=True)
        # Use a standard browser User-Agent
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=20, allow_redirects=True)
        response.raise_for_status()
        image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
        img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if img is None:
            print("❌ Failed to decode image (cv2 returned None)", flush=True)
            return None
        return img
    except Exception as e:
        print(f"❌ Error downloading image: {str(e)}", flush=True)
        return None

def create_dummy_trunk_image():
    print("🎨 Creating synthetic trunk image...", flush=True)
    # Create a 640x640 image with a brown vertical trunk-like shape
    img = np.zeros((640, 640, 3), dtype=np.uint8)
    img[:] = (200, 255, 200) # Light green background
    
    # Draw trunk
    cv2.rectangle(img, (200, 0), (440, 640), (40, 70, 100), -1) # Brown trunk
    
    # Add some texture/noise (simulating bark)
    noise = np.random.randint(0, 50, (640, 640, 3), dtype=np.uint8)
    img = cv2.addWeighted(img, 0.9, noise, 0.1, 0)
    
    # Add vertical lines for bark texture
    for i in range(200, 440, 10):
        cv2.line(img, (i, 0), (i, 640), (30, 60, 90), 1)
        
    # Add a "disease spot" (dark patch) - mimicking Black Line or Bark Rot
    cv2.circle(img, (320, 320), 40, (20, 20, 50), -1)
    
    # Add some "white" spots for mold
    cv2.circle(img, (300, 300), 10, (200, 200, 200), -1)
    
    return img

# Test Images
test_images = [
    {
        "name": "Synthetic Trunk (Local)",
        "type": "synthetic"
    },
    {
        "name": "Standard YOLO Test Image (Bus) - Reliability Check",
        "url": "https://raw.githubusercontent.com/ultralytics/assets/main/bus.jpg",
        "type": "url"
    }
]

try:
    print(f"\n⏳ Loading Model from {os.path.basename(model_path)}...", flush=True)
    model = YOLO(model_path)
    print("✅ Model loaded successfully", flush=True)
    
    # --- VERIFY CLASSES ---
    print("\n📋 Model Classes Verification:", flush=True)
    if hasattr(model, 'names'):
        print(f"  Found {len(model.names)} classes:", flush=True)
        for id, name in model.names.items():
            mapped_name, severity, rec = map_trunk_disease(name)
            print(f"  [{id}] {name:<25} -> Severity: {severity:<10} | Mapped: {mapped_name}", flush=True)
    else:
        print("⚠️ Model does not have 'names' attribute.", flush=True)

    # --- RUN INFERENCE ---
    print("\n🚀 Running Inference Tests...", flush=True)
    
    for item in test_images:
        print(f"\n🧪 Testing: {item['name']}", flush=True)
        
        if item.get('type') == 'synthetic':
            img = create_dummy_trunk_image()
        else:
            img = download_image(item['url'])
            
        if img is None:
            print("⚠️ Skipping (Image unavailable)", flush=True)
            continue
            
        # Run Inference
        results = model(img, verbose=False)
        r = results[0]
        
        detected_something = False
        
        # Check OBB
        if hasattr(r, 'obb') and r.obb is not None and len(r.obb) > 0:
            print(f"  ✅ OBB Detections: {len(r.obb)}", flush=True)
            for i, box in enumerate(r.obb):
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())
                name = r.names[cls_id]
                mapped, sev, _ = map_trunk_disease(name)
                print(f"    - #{i+1}: {name} ({conf:.1%}) -> {sev.upper()}", flush=True)
            detected_something = True
            
        # Check Boxes
        elif hasattr(r, 'boxes') and r.boxes is not None and len(r.boxes) > 0:
            print(f"  ✅ Box Detections: {len(r.boxes)}", flush=True)
            for i, box in enumerate(r.boxes):
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())
                name = r.names[cls_id]
                mapped, sev, _ = map_trunk_disease(name)
                print(f"    - #{i+1}: {name} ({conf:.1%}) -> {sev.upper()}", flush=True)
            detected_something = True
            
        # Check Classification
        elif hasattr(r, 'probs') and r.probs is not None:
            probs = r.probs
            top1_index = probs.top1
            name = r.names[top1_index]
            conf = float(probs.top1conf.item())
            mapped, sev, _ = map_trunk_disease(name)
            print(f"  ✅ Classification: {name} ({conf:.1%}) -> {sev.upper()}", flush=True)
            detected_something = True
            
        if not detected_something:
            print("  ⚠️ No detections found.", flush=True)

    print("\n✅ Tests Finished.", flush=True)

except Exception as e:
    print(f"\n❌ CRITICAL ERROR: {e}", flush=True)
    traceback.print_exc()
