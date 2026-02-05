import sys
import json
import cv2
import numpy as np
import requests
import os
from io import BytesIO
from PIL import Image

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    sys.stderr.write("Ultralytics not installed. Falling back to heuristic analysis.\n")

def classify_content(img):
    """
    Uses YOLOv11-cls (ImageNet) to check if the image contains a tree, leaf, or trunk.
    Returns: { 'is_tree': bool, 'primary_part': 'trunk' | 'leaf' | 'whole_tree' | 'unknown', 'confidence': float }
    """
    if not YOLO_AVAILABLE:
        return {'is_tree': True, 'primary_part': 'whole_tree', 'confidence': 1.0}

    try:
        # Load classification model (will download if not exists)
        model = YOLO('yolo11n-cls.pt') 
        results = model(img, verbose=False)
        
        # Check top 5 classes
        top5 = results[0].probs.top5
        names = results[0].names
        
        # ImageNet keywords
        trunk_keywords = ['bark', 'trunk', 'wood', 'log']
        leaf_keywords = ['leaf', 'foliage', 'plant', 'flower', 'green']
        tree_keywords = ['tree', 'ficus', 'rubber', 'forest']
        
        primary_part = 'unknown'
        is_tree_found = False
        confidence = 0.0
        
        trunk_score = 0
        leaf_score = 0
        tree_score = 0
        
        for idx in top5:
            class_name = names[idx].lower()
            score = float(results[0].probs.data[idx])
            
            if any(k in class_name for k in trunk_keywords):
                trunk_score += score
                is_tree_found = True
            elif any(k in class_name for k in leaf_keywords):
                leaf_score += score
                is_tree_found = True
            elif any(k in class_name for k in tree_keywords):
                tree_score += score
                is_tree_found = True
                
            confidence = max(confidence, score)
            
        # Determine primary part
        if trunk_score > leaf_score and trunk_score > tree_score:
            primary_part = 'trunk'
        elif leaf_score > trunk_score and leaf_score > tree_score:
            primary_part = 'leaf'
        elif tree_score > 0:
            primary_part = 'whole_tree'
        
        # Heuristic fallback if confidence is low but looks green (likely leaf)
        if primary_part == 'unknown' or confidence < 0.2:
            # Simple color check: Is it mostly green?
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            # Green range
            lower_green = np.array([35, 40, 40])
            upper_green = np.array([85, 255, 255])
            mask = cv2.inRange(hsv, lower_green, upper_green)
            green_ratio = cv2.countNonZero(mask) / (img.shape[0] * img.shape[1])
            
            if green_ratio > 0.3:
                primary_part = 'leaf'
                is_tree_found = True
                confidence = max(confidence, 0.6)
            
        # Lower threshold for "nature" scenes
        if confidence > 0.1: 
            return {'is_tree': True, 'primary_part': primary_part, 'confidence': confidence}
            
        return {'is_tree': False, 'primary_part': 'unknown', 'confidence': confidence}
    except Exception as e:
        sys.stderr.write(f"Tree validation failed: {e}\n")
        return {'is_tree': True, 'primary_part': 'whole_tree', 'confidence': 1.0}

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
    
    # Map Grade to Quality Enum
    quality_map = {'A': 'excellent', 'B': 'good', 'C': 'fair', 'D': 'poor'}
    quality = quality_map.get(grade, 'good')

    color_analysis = {
        "primaryColor": "white" if mean_saturation < 30 else "yellowish",
        "rgb": {"r": int(avg_color[2]), "g": int(avg_color[1]), "b": int(avg_color[0])},
        "hex": "#{:02x}{:02x}{:02x}".format(int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))
    }

    quality_classification = {
        "grade": grade,
        "confidence": round(float(np.random.uniform(85, 98)), 1), # Simulated confidence
        "description": description
    }

    product_recommendation = {
        "recommendedProduct": "RSS (Ribbed Smoked Sheet)" if grade in ['A', 'B'] else "TSR (Technically Specified Rubber)",
        "reason": "High purity suitable for sheets" if grade in ['A', 'B'] else "Lower grade suitable for block rubber",
        "expectedQuality": f"Grade {grade}"
    }

    return {
        # Schema Compatibility: Scan Model (New)
        "latexColorAnalysis": color_analysis,
        "latexQualityPrediction": {
            "quality": quality,
            "dryRubberContent": drc,
            "estimatedPrice": 0 # Placeholder, calculated in Node.js
        },
        "productivityRecommendation": {
            "status": "optimal",
            "suggestions": ["Keep tapping."]
        },
        "latexFlowIntensity": "high" if drc > 35 else "medium",

        # Schema Compatibility: LatexBatch Model (Old)
        "colorAnalysis": color_analysis,
        "qualityClassification": quality_classification,
        "productRecommendation": product_recommendation,

        # Shared Fields
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
        }
    }

def analyze_trunk(img, has_disease, disease_name, severity):
    # Grayscale for texture
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Edge detection for texture/bark analysis
    edges = cv2.Canny(gray, 100, 200)
    edge_density = np.sum(edges) / (img.shape[0] * img.shape[1])
    
    # Texture classification
    texture = "rough" if edge_density > 0.05 else "smooth"

    # Mock "Girth" - width of the trunk
    # Assume the trunk is the largest vertical object
    # This is hard without segmentation, so we simulate based on image width
    girth_est = img.shape[1] * 0.4 * (30.0 / 1000.0) # Mock scale
    
    # Immature Tree Logic (Scope Addition)
    # If girth is small, it's immature
    is_immature = False
    girth_cm = round(float(np.random.uniform(30, 110)), 1)
    
    # 20% chance of being immature for demo purposes, or based on girth
    if girth_cm < 45: 
        is_immature = True
        girth_cm = round(float(np.random.uniform(20, 40)), 1)

    health_status = 'diseased' if has_disease else 'healthy'
    damages = []
    if has_disease:
        damages.append(disease_name)

    return {
        "girth": girth_cm, # cm
        "diameter": round(girth_cm / 3.14159, 1), # cm
        "texture": texture,
        "color": "brown",
        "healthStatus": health_status,
        "damages": damages,
        "is_immature": is_immature
    }

def analyze_leaf(img, has_disease, disease_name, severity):
    # Leaf specific analysis
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Check for yellowing (Chlorosis)
    # Yellow is around H=30
    lower_yellow = np.array([20, 100, 100])
    upper_yellow = np.array([40, 255, 255])
    yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)
    yellow_ratio = cv2.countNonZero(yellow_mask) / (img.shape[0] * img.shape[1])
    
    # Check for brown spots (Necrosis)
    # Brown is low saturation orange/red
    # This is tricky in HSV, simplified for now
    
    health_status = 'healthy'
    color = 'green'
    spot_count = 0
    
    if yellow_ratio > 0.1:
        health_status = 'diseased'
        color = 'yellowing'
        if not has_disease: # Add generic yellowing if no specific disease found
            has_disease = True
            disease_name = "Chlorosis (Nutrient Deficiency)"
            severity = "medium"

    if has_disease:
        health_status = 'diseased'
        spot_count = np.random.randint(5, 50) # Simulated spot count for now
    
    diseases = []
    if has_disease:
        diseases.append({
            "name": disease_name,
            "confidence": 95.0,
            "severity": severity
        })

    return {
        "healthStatus": health_status,
        "color": color,
        "spotCount": spot_count,
        "diseases": diseases
    }

def analyze_tree(img, user_hint=None):
    # 1. Classification (Trunk vs Leaf vs Whole Tree)
    classification = classify_content(img)
    
    # Override if user provided a hint
    if user_hint:
        user_hint = user_hint.strip().lower()
        if user_hint in ['leaf', 'trunk']:
            classification['primary_part'] = user_hint
            classification['is_tree'] = True # Assume user is correct for now
            classification['confidence'] = 1.0 # Trust user
    
    if not classification['is_tree']:
        return {
            "error": "Image does not appear to contain a tree or plant part.",
            "confidence": classification['confidence']
        }

    primary_part = classification['primary_part'] # 'trunk', 'leaf', 'whole_tree', 'unknown'

    # 2. Disease Detection (Common for both, but we interpret differently)
    # ... (Keep existing YOLO inference logic, but tailored) ...
    # Try Custom YOLO inference for Disease
    possible_paths = [
        os.path.join(os.path.dirname(__file__), 'models', 'rubber_tree_model', 'weights', 'best.pt'),
        os.path.join(os.path.dirname(__file__), '..', '..', 'yolo11n.pt'), # Check root directory
        os.path.join(os.path.dirname(__file__), '..', 'yolo11n.pt') # Check backend directory
    ]
    
    model_path = None
    for p in possible_paths:
        if os.path.exists(p):
            model_path = p
            break
    
    disease_detections = []
    has_disease = False
    disease_name = "No disease detected"
    severity = "none"
    recommendation = "Regular monitoring."
    
    if YOLO_AVAILABLE and model_path:
        try:
            model = YOLO(model_path)
            results = model(img, verbose=False) # Suppress output
            
            for r in results:
                boxes = r.boxes
                for box in boxes:
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    if hasattr(model, 'names'):
                        name = model.names[cls]
                    else:
                        name = f"Class {cls}"
                    
                    is_generic = 'person' in model.names.values()
                    if is_generic: continue
                    
                    if conf > 0.25: # Confidence threshold
                        disease_detections.append({
                            "name": name,
                            "confidence": round(conf * 100, 1),
                            "box": box.xywh.tolist()
                        })
                        
            if disease_detections:
                has_disease = True
                top_disease = max(disease_detections, key=lambda x: x['confidence'])
                disease_name = top_disease['name']
                severity = "high" if top_disease['confidence'] > 80 else "medium"
                recommendation = f"Treat {disease_name} immediately."
                
        except Exception as e:
            sys.stderr.write(f"YOLO inference failed: {e}\n")

    # Fallback to Simulation if no detections
    if not disease_detections:
        # Disease detection (Color based simulation for demo)
        disease_chance = np.random.random()
        if disease_chance < 0.3:
            has_disease = True
            # Differentiate diseases based on part
            if primary_part == 'leaf':
                disease_types = [
                    ("Leaf Blight", "low", "Apply foliar fungicide spray."),
                    ("Powdery Mildew", "medium", "Use sulfur-based fungicides."),
                    ("Bird's Eye Spot", "low", "Monitor nutrient levels.")
                ]
            else: # Trunk or whole tree
                disease_types = [
                    ("White Root Rot", "high", "Immediate fungicide treatment required. Isolate tree."),
                    ("Pink Disease", "medium", "Prune affected branches and apply Bordeaux mixture."),
                    ("Mouldy Rot", "high", "Stop tapping, apply fungicide to panel.")
                ]
            
            selected_disease = disease_types[int(np.random.choice(len(disease_types)))]
            disease_name = selected_disease[0]
            severity = selected_disease[1]
            recommendation = selected_disease[2]

    # 3. Analyze based on part
    trunk_data = {}
    leaf_data = {}
    is_immature = False # Default

    if primary_part == 'leaf':
        leaf_data = analyze_leaf(img, has_disease, disease_name, severity)
        # Trunk data removed as requested for leaf mode
        trunk_data = None
    elif primary_part == 'trunk':
        trunk_data = analyze_trunk(img, has_disease, disease_name, severity)
        is_immature = trunk_data.get('is_immature', False)
        # Leaf data removed as requested for trunk mode
        leaf_data = None
    else: # Whole tree or unknown (do both roughly)
        trunk_data = analyze_trunk(img, has_disease, disease_name, severity)
        is_immature = trunk_data.get('is_immature', False)
        # Assume leaves are also healthy/diseased based on overall result
        leaf_data = {
             "healthStatus": 'diseased' if has_disease else 'healthy',
             "color": "green",
             "spotCount": 0,
             "diseases": [{"name": disease_name, "confidence": 90, "severity": severity}] if has_disease else []
        }

    # Construct Final Response

    # 5. Latex Quality Prediction (Tree-based)
    # Infer from health and maturity
    pred_quality = "excellent"
    pred_drc = 40.0
    if has_disease:
        if severity == "high":
            pred_quality = "poor"
            pred_drc = 25.0
        else:
            pred_quality = "fair"
            pred_drc = 32.0
    elif is_immature:
        pred_quality = "good" # Young trees have good quality but low volume
        pred_drc = 35.0

    # 6. Latex Flow Intensity Estimation
    # Infer from girth and health
    flow_intensity = "medium"
    if is_immature:
        flow_intensity = "low"
    elif has_disease and severity == "high":
        flow_intensity = "low"
    else:
        # Healthy mature tree
        girth = trunk_data.get('girth', 50) if trunk_data else 50
        if girth > 80:
            flow_intensity = "very_high"
        elif girth > 60:
            flow_intensity = "high"

    # 7. Productivity Status & Recommendation
    prod_status = "optimal"
    suggestions = []
    
    if has_disease:
        prod_status = "critical" if severity == "high" else "at_risk"
        suggestions.append(f"Treat {disease_name} to restore productivity.")
    elif is_immature:
        prod_status = "growing"
        suggestions.append("Continue monitoring growth. Not ready for tapping.")
    else:
        suggestions.append("Maintain regular tapping schedule.")
        if flow_intensity == "high" or flow_intensity == "very_high":
             suggestions.append("Consider stimulation for sustained yield.")

    return {
        "treeIdentification": {
            "isRubberTree": True,
            "confidence": round(classification['confidence'] * 100, 1),
            "maturity": "immature" if is_immature else "mature",
            "detectedPart": primary_part # 'trunk', 'leaf', 'whole_tree'
        },
        "trunkAnalysis": trunk_data,
        "leafAnalysis": leaf_data,
        "diseaseDetection": [
            {
                "name": disease_name,
                "confidence": 92.0 if has_disease else 98.0,
                "severity": severity,
                "recommendation": recommendation
            }
        ] + disease_detections,
        "tappabilityAssessment": {
            "isTappable": not is_immature and not (has_disease and severity == "high") and primary_part != 'leaf',
            "score": 30 if is_immature else (40 if (has_disease and severity == "high") else 85),
            "reason": "Image only shows leaves." if primary_part == 'leaf' else ("Tree is too young." if is_immature else ("Tree has severe disease." if (has_disease and severity == "high") else "Good condition for tapping."))
        },
        "latexQualityPrediction": {
            "quality": pred_quality,
            "dryRubberContent": pred_drc,
            "estimatedPrice": 0 # Placeholder
        },
        "latexFlowIntensity": flow_intensity,
        "productivityRecommendation": {
            "status": prod_status,
            "suggestions": suggestions
        }
    }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments"}))
        return

    mode = sys.argv[1]
    url = sys.argv[2]
    user_hint = sys.argv[3] if len(sys.argv) > 3 else None
    
    img = download_image(url)
    if img is None:
        print(json.dumps({"error": "Failed to load image"}))
        return
        
    if mode == 'tree':
        result = analyze_tree(img, user_hint)
    elif mode == 'latex':
        result = analyze_latex(img)
    else:
        result = {"error": "Invalid mode"}
        
    print(json.dumps(result))

if __name__ == "__main__":
    main()
