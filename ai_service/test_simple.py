import sys
import os

print("Step 1", flush=True)
try:
    from ultralytics import YOLO
    print("Step 2: Ultralytics imported", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)

import cv2
print("Step 3: CV2 imported", flush=True)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
print("Step 4: Sys path appended", flush=True)

try:
    from disease_mapping import map_trunk_disease
    print("Step 5: Disease mapping imported", flush=True)
except Exception as e:
    print(f"Error mapping: {e}", flush=True)
