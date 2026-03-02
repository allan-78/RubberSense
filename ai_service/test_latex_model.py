import cv2
import sys
import os
import glob
import numpy as np
from ultralytics import YOLO

def test_model(model_path, target_path):
    print(f"\n=== Latex Quality Model Tester ===")
    print(f"Loading model from: {model_path}")
    
    if not os.path.exists(model_path):
        print(f"Error: Model file not found at {model_path}")
        return

    try:
        model = YOLO(model_path)
        print("Model loaded successfully.")
        print(f"Model Classes: {model.names}")
        
        # Check for model defects (single class issue)
        if len(model.names) < 2:
            print("\n⚠️ WARNING: This model only has 1 class. It cannot distinguish between latex types.")
            print("Likely cause: Training data was not grouped correctly in the Colab notebook.")
            print("Please re-run the updated Colab notebook to fix the dataset structure.")
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # Determine if target is file or directory
    if os.path.isfile(target_path):
        files = [target_path]
        print(f"\nTesting single file: {target_path}")
    elif os.path.isdir(target_path):
        # Recursive search for images
        files = []
        extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp', '*.webp']
        for ext in extensions:
            files.extend(glob.glob(os.path.join(target_path, '**', ext), recursive=True))
        print(f"\nTesting directory: {target_path}")
        print(f"Found {len(files)} images.")
    else:
        print(f"Error: Target path not found: {target_path}")
        return

    if not files:
        print("No images found to test.")
        return

    # Statistics tracking
    correct_count = 0
    total_count = 0
    unknown_label_count = 0
    
    print("\n--- Inference Results ---")
    
    for file_path in files:
        try:
            results = model(file_path, verbose=False)
            
            for r in results:
                top1_index = r.probs.top1
                top1_conf = r.probs.top1conf.item()
                predicted_class = r.names[top1_index]
                
                # Attempt to infer ground truth from folder name
                # E.g., if path is ".../yellow latex/img1.jpg", ground truth is "yellow latex"
                parent_dir = os.path.basename(os.path.dirname(file_path))
                ground_truth = None
                
                # Simple matching: check if parent dir matches any class name
                for cls_id, cls_name in model.names.items():
                    if cls_name.lower() in parent_dir.lower() or parent_dir.lower() in cls_name.lower():
                        ground_truth = cls_name
                        break
                
                # Display result
                filename = os.path.basename(file_path)
                status_icon = "❓"
                
                if ground_truth:
                    total_count += 1
                    if predicted_class == ground_truth:
                        correct_count += 1
                        status_icon = "✅"
                    else:
                        status_icon = "❌"
                    print(f"{status_icon} {filename}: Pred={predicted_class} ({top1_conf:.2f}) | True={ground_truth}")
                else:
                    unknown_label_count += 1
                    print(f"ℹ️ {filename}: Pred={predicted_class} ({top1_conf:.2f})")
                    
        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    # Summary
    if total_count > 0:
        accuracy = (correct_count / total_count) * 100
        print(f"\n--- Accuracy Summary ---")
        print(f"Total labeled images: {total_count}")
        print(f"Correct predictions: {correct_count}")
        print(f"Accuracy: {accuracy:.2f}%")
    elif unknown_label_count > 0:
        print(f"\nProcessed {unknown_label_count} images (no labels inferred from folders).")

if __name__ == "__main__":
    # Default paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    default_model = os.path.join(base_dir, "models", "rubber_tree_model", "weights", "Latex.pt")
    
    # Arguments
    model_path = sys.argv[1] if len(sys.argv) > 1 else default_model
    
    # Default image/folder to test
    default_target = None
    temp_dir = os.path.join(base_dir, "temp_output")
    if os.path.exists(temp_dir):
        default_target = temp_dir
            
    target_path = sys.argv[2] if len(sys.argv) > 2 else default_target
    
    if not target_path:
        print("Usage: python test_latex_model.py [model_path] [image_or_folder_path]")
        print("Example: python test_latex_model.py models/Latex.pt ./test_images")
    else:
        test_model(model_path, target_path)
