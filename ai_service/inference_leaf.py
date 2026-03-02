import cv2
import numpy as np
import argparse
import os
import sys

# Try to import YOLO, handle failure gracefully
try:
    from ultralytics import YOLO
except ImportError as e:
    print(f"Error: Could not import ultralytics. Please install it using: pip install ultralytics")
    print(f"Details: {e}")
    sys.exit(1)
except Exception as e:
    print(f"Error initializing ultralytics: {e}")
    sys.exit(1)

def count_spots(img):
    """
    Counts dark spots on a leaf image using image processing.
    """
    if img is None:
        return 0, None
    
    # Convert to HSV color space
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Pre-processing: Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Invert so dark spots become bright
    gray_inv = cv2.bitwise_not(gray)
    
    # Threshold to isolate the spots
    # We assume spots are significantly darker than the leaf
    # You may need to adjust the threshold value (200) based on lighting
    _, thresh = cv2.threshold(gray_inv, 200, 255, cv2.THRESH_BINARY)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Filter small noise
    min_spot_area = 10
    spot_contours = [cnt for cnt in contours if cv2.contourArea(cnt) > min_spot_area]
    
    # Draw contours on image for visualization
    vis_img = img.copy()
    cv2.drawContours(vis_img, spot_contours, -1, (0, 0, 255), 2)
    
    return len(spot_contours), vis_img

def process_image(model, image_path, show=True):
    """
    Runs classification and spot counting on a single image.
    """
    if not os.path.exists(image_path):
        print(f"Error: Image not found at {image_path}")
        return

    img = cv2.imread(image_path)
    if img is None:
        print("Error: Could not read image.")
        return

    # 1. Run Classification
    results = model(img)
    probs = results[0].probs
    top1_index = probs.top1
    class_name = results[0].names[top1_index]
    confidence = probs.top1conf.item()
    
    print(f"Prediction: {class_name.upper()} ({confidence:.2f})")
    
    final_img = img.copy()
    text = f"{class_name.upper()} ({confidence:.2f})"
    
    # 2. If Diseased, Count Spots
    if class_name.lower() == 'diseased':
        count, vis_img = count_spots(img)
        print(f"Estimated Spot Count: {count}")
        final_img = vis_img
        text += f" | Spots: {count}"
    
    # Display Result
    cv2.putText(final_img, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    
    if show:
        cv2.imshow("Leaf Analysis", final_img)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    else:
        # Save the result if not showing
        output_path = "result_" + os.path.basename(image_path)
        cv2.imwrite(output_path, final_img)
        print(f"Result saved to {output_path}")
        
    return final_img

def run_webcam(model):
    """
    Runs real-time inference on webcam.
    """
    print("Initializing webcam...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    print("Starting Webcam... Press 'q' to quit.")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
            
        # 1. Run Classification
        # verbose=False prevents printing per-frame stats to console
        results = model(frame, verbose=False)
        probs = results[0].probs
        top1_index = probs.top1
        class_name = results[0].names[top1_index]
        confidence = probs.top1conf.item()
        
        display_frame = frame.copy()
        text = f"{class_name.upper()} {confidence:.2f}"
        
        # 2. If Diseased, Count Spots
        if class_name.lower() == 'diseased':
            count, vis_frame = count_spots(frame)
            display_frame = vis_frame
            text += f" | Spots: {count}"
            
        cv2.putText(display_frame, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imshow("Real-time Leaf Analysis", display_frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Leaf Disease Detection & Spot Counting")
    
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Construct absolute path to the model relative to the script
    default_model_path = os.path.join(script_dir, "models", "rubber_tree_model", "weights", "best.pt")
    
    parser.add_argument("--model", type=str, default=default_model_path, help="Path to the trained YOLO model (best.pt or Leaf.pt)")
    parser.add_argument("--source", type=str, default="webcam", help="Path to image file or 'webcam'")
    parser.add_argument("--no-show", action="store_true", help="Do not display the image window (save to disk instead)")
    
    args = parser.parse_args()
    
    # Load model
    if not os.path.exists(args.model):
        print(f"Error: Model file '{args.model}' not found.")
        print(f"Current working directory: {os.getcwd()}")
        print("Please check the path.")
    else:
        print(f"Loading model: {args.model}...")
        try:
            model = YOLO(args.model)
            print("Model loaded successfully.")
            
            if args.source == "webcam":
                run_webcam(model)
            else:
                process_image(model, args.source, show=not args.no_show)
        except Exception as e:
            print(f"Error running model: {e}")
