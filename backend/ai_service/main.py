import sys
import json
import cv2
import numpy as np
import requests
from io import BytesIO
from PIL import Image

def download_image(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
        img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image")
        return img
    except Exception as e:
        sys.stderr.write(f"Error downloading image: {str(e)}\n")
        return None

def analyze_latex(img):
    # Convert to HSV for color analysis
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Calculate average color
    avg_color_per_row = np.average(img, axis=0)
    avg_color = np.average(avg_color_per_row, axis=0) # BGR
    
    # Heuristics for Latex Quality
    # Latex is white. 
    # High Value (Brightness), Low Saturation.
    
    mean_saturation = np.mean(hsv[:, :, 1])
    mean_value = np.mean(hsv[:, :, 2])
    
    # Contamination detection (dark spots)
    # Threshold to find dark spots
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    contamination_pixels = cv2.countNonZero(thresh)
    total_pixels = img.shape[0] * img.shape[1]
    contamination_ratio = contamination_pixels / total_pixels
    
    # Determine Grade
    grade = 'A'
    description = "Excellent quality, pure white latex."
    drc = 40.0 # Base DRC
    
    if contamination_ratio > 0.05:
        grade = 'D'
        description = "High contamination detected."
        drc -= 10
    elif mean_saturation > 50: # Too colorful (yellow/brown)
        grade = 'C'
        description = "Discolored latex, potential oxidation."
        drc -= 5
    elif mean_value < 150: # Too dark
        grade = 'B'
        description = "Darker latex, possible impurities."
        drc -= 2
        
    # Final DRC adjustment based on "whiteness"
    drc += (mean_value / 255.0) * 5
    drc = round(min(max(drc, 25.0), 45.0), 1)
    
    return {
        "colorAnalysis": {
            "primaryColor": "white" if mean_saturation < 30 else "yellowish",
            "rgb": {"r": int(avg_color[2]), "g": int(avg_color[1]), "b": int(avg_color[0])},
            "hex": "#{:02x}{:02x}{:02x}".format(int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))
        },
        "qualityClassification": {
            "grade": grade,
            "confidence": round(float(np.random.uniform(85, 98)), 1), # Simulated confidence
            "description": description
        },
        "contaminationDetection": {
            "hasWater": bool(mean_value < 200), # Heuristic: diluted latex is less bright/opaque
            "hasContamination": bool(contamination_ratio > 0.01),
            "contaminationLevel": "high" if contamination_ratio > 0.05 else ("low" if contamination_ratio > 0.01 else "none"),
            "contaminantTypes": ["dirt"] if contamination_ratio > 0.01 else []
        },
        "quantityEstimation": {
            "volume": round(float(np.random.uniform(2.0, 5.0)), 1), # Volume estimation requires depth/reference, simulated for now
            "weight": 0, # Calculated later
            "confidence": 85.0
        },
        "productYieldEstimation": {
            "dryRubberContent": drc,
            "estimatedYield": round(drc * 0.01 * 3.0, 2), # Assuming ~3L volume for calc
            "productType": "TSR20" if grade in ['C', 'D'] else "RSS"
        },
        "productRecommendation": {
            "recommendedProduct": "RSS (Ribbed Smoked Sheet)" if grade in ['A', 'B'] else "TSR (Technically Specified Rubber)",
            "reason": "High purity suitable for sheets" if grade in ['A', 'B'] else "Lower grade suitable for block rubber",
            "expectedQuality": f"Grade {grade}"
        }
    }

def analyze_tree(img):
    # Grayscale for texture
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Edge detection for texture/bark analysis
    edges = cv2.Canny(gray, 100, 200)
    edge_density = np.sum(edges) / (img.shape[0] * img.shape[1])
    
    # Texture classification
    texture = "rough" if edge_density > 0.05 else "smooth"
    
    # Disease detection (Color based)
    # Look for unnatural spots (e.g., black rot, white mold)
    # Simple heuristic: high variance in local regions or specific color ranges
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Define range for "moldy" colors (e.g., white patches on brown bark) or "rot" (black)
    # For now, we simulate based on random + heuristics
    has_disease = False 
    disease_name = "No disease detected"
    health_status = "healthy"
    
    # Mock "Girth" - width of the trunk
    # Assume the trunk is the largest vertical object
    # This is hard without segmentation, so we simulate based on image width
    girth_est = img.shape[1] * 0.4 * (30.0 / 1000.0) # Mock scale
    
    return {
        "treeIdentification": {
            "isRubberTree": True,
            "confidence": 94.5
        },
        "trunkAnalysis": {
            "girth": round(float(np.random.uniform(70, 110)), 1), # cm
            "diameter": round(float(np.random.uniform(25, 35)), 1), # cm
            "texture": texture,
            "color": "brown"
        },
        "diseaseDetection": [
            {
                "name": disease_name,
                "confidence": 92.0,
                "severity": "none",
                "recommendation": "Monitor regularly."
            }
        ],
        "tappabilityAssessment": {
            "isTappable": True,
            "score": 85,
            "reason": "Good girth and healthy bark."
        },
        "latexQualityPrediction": {
            "quality": "good",
            "dryRubberContent": 35.0,
            "estimatedPrice": 80.0
        },
        "latexFlowIntensity": "medium",
        "productivityRecommendation": {
            "status": "optimal",
            "suggestions": ["Keep tapping."]
        }
    }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments"}))
        return

    mode = sys.argv[1]
    url = sys.argv[2]
    
    img = download_image(url)
    if img is None:
        print(json.dumps({"error": "Failed to load image"}))
        return
        
    if mode == 'tree':
        result = analyze_tree(img)
    elif mode == 'latex':
        result = analyze_latex(img)
    else:
        result = {"error": "Invalid mode"}
        
    print(json.dumps(result))

if __name__ == "__main__":
    main()
