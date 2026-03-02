import sys
print("Step 1", flush=True)
try:
    import torch
    print("Step 2: Torch imported", flush=True)
except ImportError:
    print("Torch not found", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)

try:
    from ultralytics import YOLO
    print("Step 3: YOLO imported", flush=True)
except Exception as e:
    print(f"Error: {e}", flush=True)
