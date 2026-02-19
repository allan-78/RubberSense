import sys
import json
# print("DEBUG: START")
import cv2
import numpy as np
import requests
import os
import time
from io import BytesIO

# Export helper function for testing
__all__ = ['map_trunk_disease']

# Import the disease mapping logic
try:
    from disease_mapping import map_trunk_disease
except ImportError:
    # Fallback if running from a different directory context or if file missing
    def map_trunk_disease(disease_name):
        return disease_name, "unknown", "Mapping module missing."

# print("DEBUG: IMPORTS DONE")

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    sys.stderr.write("Ultralytics not installed. Falling back to heuristic analysis.\n")
except Exception as e:
    YOLO_AVAILABLE = False
    sys.stderr.write(f"Ultralytics import error: {e}\n")

# print("DEBUG: AFTER YOLO IMPORT")

# Global model cache
LEAF_MODEL = None
CLS_MODEL = None
LATEX_MODEL = None
TRUNK_MODEL = None

def get_leaf_model():
    global LEAF_MODEL
    if LEAF_MODEL is None and YOLO_AVAILABLE:
        try:
            # UPDATED: Pointing to Leaf.pt as requested
            model_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/Leaf.pt')
            if not os.path.exists(model_path):
                 # Fallback to best.pt if Leaf.pt is missing (safety)
                 model_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/best.pt')
            
            if os.path.exists(model_path):
                LEAF_MODEL = YOLO(model_path)
                sys.stderr.write(f"✅ [Python ML] Loaded Leaf Model: {model_path}\n")
            else:
                sys.stderr.write(f"❌ [Python ML] Leaf model not found at {model_path}\n")
        except Exception as e:
            sys.stderr.write(f"❌ [Python ML] Failed to load leaf model: {e}\n")
    return LEAF_MODEL

def get_trunk_model():
    global TRUNK_MODEL
    if TRUNK_MODEL is None and YOLO_AVAILABLE:
        try:
            model_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/Trunks.pt')
            if os.path.exists(model_path):
                TRUNK_MODEL = YOLO(model_path)
                sys.stderr.write(f"✅ [Python ML] Loaded Trunk Model: {model_path}\n")
            else:
                sys.stderr.write(f"❌ [Python ML] Trunk model not found at {model_path}\n")
        except Exception as e:
            sys.stderr.write(f"❌ [Python ML] Failed to load trunk model: {e}\n")
    return TRUNK_MODEL

def get_latex_model():
    global LATEX_MODEL
    if LATEX_MODEL is None and YOLO_AVAILABLE:
        try:
            model_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/Latex.pt')
            if os.path.exists(model_path):
                LATEX_MODEL = YOLO(model_path)
                sys.stderr.write(f"✅ [Python ML] Loaded Latex Model: {model_path}\n")
            else:
                sys.stderr.write(f"❌ [Python ML] Latex model not found at {model_path}\n")
        except Exception as e:
            sys.stderr.write(f"❌ [Python ML] Failed to load latex model: {e}\n")
    return LATEX_MODEL

def get_cls_model():
    global CLS_MODEL
    if CLS_MODEL is None and YOLO_AVAILABLE:
        try:
            CLS_MODEL = YOLO('yolo11n-cls.pt')
        except Exception as e:
            sys.stderr.write(f"❌ [Python ML] Failed to load CLS model: {e}\n")
    return CLS_MODEL

def get_groq_analysis(disease_name, confidence, spot_count, color_name):
    """
    Calls Groq API to get detailed analysis and recommendations.
    """
    api_key = os.environ.get("GROQ_API_KEY")
    url = "https://api.groq.com/openai/v1/chat/completions"
    
    prompt = f"""
    You are an expert plant pathologist specializing in rubber trees (Hevea brasiliensis).
    Analyze this leaf scan result:
    - Detected Condition: {disease_name}
    - AI Confidence: {confidence:.1f}%
    - Visual Traits: {color_name} color, {spot_count} spots detected.
    
    Provide a valid JSON response with these keys:
    1. "diagnosis": A detailed scientific explanation of the condition.
    2. "treatment": Specific chemical (fungicide names) and organic treatments.
    3. "prevention": Actionable steps to prevent spread or recurrence.
    4. "severity_reasoning": Why this is low/medium/high severity based on the spot count and disease type.
    5. "tappability_advice": Can this tree be tapped? Why/Why not?

    Do not include markdown formatting, just the raw JSON object.
    """
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=15)
        if response.status_code == 200:
            content = response.json()['choices'][0]['message']['content']
            return json.loads(content)
    except Exception as e:
        sys.stderr.write(f"⚠️ [Groq API] Analysis failed: {e}\n")
    
    return None

def get_groq_latex_analysis(latex_type, confidence, contamination_level, drc):
    """
    Calls Groq API to get detailed analysis and recommendations for latex quality.
    """
    api_key = os.environ.get("GROQ_API_KEY")
    url = "https://api.groq.com/openai/v1/chat/completions"
    
    prompt = f"""
    You are an expert rubber technologist specializing in natural rubber latex quality control.
    Analyze this latex scan result:
    - Detected Type: {latex_type}
    - AI Confidence: {confidence:.1f}%
    - Contamination Level: {contamination_level}
    - Estimated Dry Rubber Content (DRC): {drc}%
    
    Provide a valid JSON response with these keys:
    1. "quality_assessment": A technical assessment of the latex quality based on the type and visual indicators.
    2. "processing_advice": Specific steps to process this type of latex for maximum yield/quality.
    3. "contamination_handling": How to treat or filter the latex if contamination is present.
    4. "market_value_insight": Brief comment on the potential market grade (e.g., Centrifuged Latex, USS, RSS).
    5. "preservation_tips": Chemical recommendations (e.g., Ammonia, TMTD) to prevent coagulation before processing.
    6. "market_analysis": {{
        "trend": "stable" | "increasing" | "decreasing",
        "estimated_price_range_php": "min-max" (e.g., "50-60"),
        "reasoning": "Reason for the price estimation based on quality and general market knowledge."
    }}

    Do not include markdown formatting, just the raw JSON object.
    """
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=15)
        if response.status_code == 200:
            content = response.json()['choices'][0]['message']['content']
            return json.loads(content)
    except Exception as e:
        sys.stderr.write(f"⚠️ [Groq API] Latex Analysis failed: {e}\n")
    
    return None

def get_dominant_color_name(img, mask=None):
    """
    Determines the dominant color name using HSV averages.
    """
    if img is None: return "Unknown"
    
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    if mask is not None:
        mean_color = cv2.mean(hsv, mask=mask)[:3]
    else:
        mean_color = cv2.mean(hsv)[:3]
        
    h, s, v = mean_color
    
    # H ranges 0-179 in OpenCV
    if s < 20 and v > 200: return "White/Pale"
    if v < 30: return "Black/Dark"
    if s < 30: return "Grayish"
    
    if h < 10 or h > 170: return "Red/Brown"
    elif 10 <= h < 25: return "Orange"
    elif 25 <= h < 35: return "Yellow"
    elif 35 <= h < 85: return "Green"
    elif 85 <= h < 130: return "Blue/Dark Green"
    elif 130 <= h < 170: return "Purple/Brown"
    
    return "Discolored"

def count_spots(img):
    """
    Counts dark spots on a leaf image using image processing.
    Returns count and the visualization image with contours drawn.
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

def classify_content(img):
    """
    PRIORITIZES the specialized Leaf Model (best.pt) as the main classifier.
    Falls back to YOLOv11-cls (ImageNet) only if Leaf Model is unsure or fails.
    """
    
    primary_part = 'unknown'
    confidence = 0.0
    
    # 1. TRY LEAF MODEL FIRST (User Instruction: Main Classifier is best.pt)
    leaf_model = get_leaf_model()
    if leaf_model:
        try:
            # Run inference
            results = leaf_model(img, verbose=False)
            probs = results[0].probs
            top1_conf = float(probs.top1conf.item())
            
            # If Leaf Model is confident (> 25%), we assume it IS a leaf (healthy or diseased)
            if top1_conf > 0.25:
                sys.stderr.write(f"✅ [Python ML] Leaf Model identified content with confidence: {top1_conf:.2f}\n")
                return {'is_tree': True, 'primary_part': 'leaf', 'confidence': top1_conf}
                
        except Exception as e:
             sys.stderr.write(f"⚠️ [Python ML] Leaf Model classification check failed: {e}\n")

    # 2. Fallback to Generic Classifier (ImageNet) if Leaf Model didn't catch it
    if not YOLO_AVAILABLE:
        return {'is_tree': True, 'primary_part': 'whole_tree', 'confidence': 1.0}

    try:
        model = get_cls_model()
        if not model:
             return {'is_tree': True, 'primary_part': 'whole_tree', 'confidence': 1.0}

        results = model(img, verbose=False)
        
        # Check top 5 classes
        top5 = results[0].probs.top5
        names = results[0].names
        
        trunk_keywords = ['bark', 'trunk', 'wood', 'log']
        leaf_keywords = ['leaf', 'foliage', 'plant', 'flower', 'green']
        tree_keywords = ['tree', 'ficus', 'rubber', 'forest']
        
        trunk_score = 0
        leaf_score = 0
        tree_score = 0
        
        for idx in top5:
            class_name = names[idx].lower()
            score = float(results[0].probs.data[idx])
            
            if any(k in class_name for k in trunk_keywords):
                trunk_score += score
            elif any(k in class_name for k in leaf_keywords):
                leaf_score += score
            elif any(k in class_name for k in tree_keywords):
                tree_score += score
                
            confidence = max(confidence, score)
            
        if trunk_score > leaf_score and trunk_score > tree_score:
            primary_part = 'trunk'
        elif leaf_score > trunk_score and leaf_score > tree_score:
            primary_part = 'leaf'
        elif tree_score > 0:
            primary_part = 'whole_tree'
        
        # Heuristic fallback if CLS model failed or is unsure
        if primary_part == 'unknown' or confidence < 0.2:
            # Check for green color dominance
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            lower_green = np.array([35, 40, 40])
            upper_green = np.array([85, 255, 255])
            mask = cv2.inRange(hsv, lower_green, upper_green)
            green_ratio = cv2.countNonZero(mask) / (img.shape[0] * img.shape[1])
            
            if green_ratio > 0.3:
                primary_part = 'leaf'
                confidence = max(confidence, 0.6)

        if confidence > 0.1: 
            return {'is_tree': True, 'primary_part': primary_part, 'confidence': confidence}
            
        return {'is_tree': False, 'primary_part': 'unknown', 'confidence': confidence}
    except Exception as e:
        sys.stderr.write(f"Tree validation failed: {e}\n")
        return {'is_tree': True, 'primary_part': 'whole_tree', 'confidence': 1.0}

def download_image(url):
    try:
        if os.path.exists(url):
            img = cv2.imread(url)
            if img is None:
                raise ValueError(f"Failed to read local image: {url}")
            return img
        
        headers = {'User-Agent': 'RubberSense-AI/1.0'}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
        img = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image")
        return img
    except Exception as e:
        sys.stderr.write(f"Error downloading image: {str(e)}\n")
        return None

def generate_productivity_recommendation(health_status, disease_name, tappable, severity):
    status = "optimal"
    suggestions = []
    
    if health_status == 'healthy':
        status = "optimal"
        suggestions = [
            "Routine maintenance: Ensure regular weeding around the base.",
            "Fertilizer: Apply standard NPK fertilizer schedule.",
            "Tapping: Safe to tap if girth permits (>45cm).",
            "Monitor: Check weekly for any signs of new spots."
        ]
    else:
        status = "at_risk" if severity in ['low', 'moderate'] else "critical"
        
        # Disease specific suggestions
        d_name = disease_name.lower()
        if 'mildew' in d_name:
             suggestions.append("Apply sulfur-based fungicide immediately.")
             suggestions.append("Prune heavily infected branches to increase airflow.")
        elif 'spot' in d_name:
             suggestions.append("Apply copper-based fungicide.")
             suggestions.append("Remove and burn fallen infected leaves.")
        elif 'blight' in d_name:
             suggestions.append("Isolate the tree to prevent spread.")
             suggestions.append("Avoid tapping until fully recovered.")
        else:
             suggestions.append(f"Consult local agricultural extension for {disease_name} treatment.")
             
        if severity == 'critical':
             suggestions.append("STOP TAPPING immediately to reduce stress.")
             suggestions.append("Consider quarantine measures.")
        
        suggestions.append("Improve soil drainage if waterlogging is suspected.")

    return {
        "status": status,
        "suggestions": suggestions
    }

def analyze_leaf_with_model(img, image_path_for_saving):
    """
    Uses the trained Leaf Disease Model (Leaf.pt) for analysis.
    Integrates Groq API for detailed insights.
    """
    model = get_leaf_model()
    
    # Default values
    disease_name = "Unknown"
    confidence = 0.0
    severity = "low"
    spot_count = 0
    recommendation = "Maintain regular monitoring."
    processed_image_path = None
    color_name = "Green"
    
    if model:
        try:
            results = model(img, verbose=False)
            probs = results[0].probs
            top1_index = probs.top1
            disease_name = results[0].names[top1_index]
            confidence = float(probs.top1conf.item()) * 100
            
            # --- Visual Analysis ---
            # 1. Spot Counting
            spot_count, spotted_img = count_spots(img)
            vis_img = spotted_img if spotted_img is not None else img.copy()
            
            # 2. Color Analysis
            color_name = get_dominant_color_name(img)
            
            # --- Severity Logic ---
            label_text = f"{disease_name.upper()} ({confidence:.1f}%)"
            
            if disease_name.lower() == 'healthy':
                severity = "none"
                recommendation = "Tree is healthy. Continue routine care."
                color_cv = (0, 255, 0) # Green
            else:
                label_text += f" | Spots: {spot_count}"
                
                # Dynamic severity based on spot count and disease type
                if spot_count > 50:
                    severity = "critical"
                    color_cv = (0, 0, 255) # Red
                elif spot_count > 20:
                    severity = "high"
                    color_cv = (0, 165, 255) # Orange
                else:
                    severity = "moderate"
                    color_cv = (0, 255, 255) # Yellow

            # --- AI Insights (Groq) ---
            sys.stderr.write(f"🧠 [Python ML] Requesting detailed analysis from Groq for {disease_name}...\n")
            ai_insights = get_groq_analysis(disease_name, confidence, spot_count, color_name)
            
            if ai_insights:
                raw_treatment = ai_insights.get("treatment", recommendation)
                if isinstance(raw_treatment, list):
                    recommendation = "; ".join(raw_treatment)
                elif isinstance(raw_treatment, dict):
                    # Flatten dict to string
                    parts = []
                    for k, v in raw_treatment.items():
                        val_str = ", ".join(v) if isinstance(v, list) else str(v)
                        parts.append(f"{k.title()}: {val_str}")
                    recommendation = " | ".join(parts)
                else:
                    recommendation = str(raw_treatment)
                
                # Add AI reasoning to severity if available
                severity_reasoning = ai_insights.get("severity_reasoning", "")
                
            # Cap confidence for display
            if confidence >= 100.0: confidence = 99.9

            # Draw text on image
            cv2.putText(vis_img, label_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_cv, 2)
            
            # Save processed image
            script_dir = os.path.dirname(os.path.abspath(__file__))
            temp_dir = os.path.join(script_dir, 'temp_output')
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)
                
            timestamp = int(time.time())
            processed_filename = f"processed_{timestamp}_{os.path.basename(image_path_for_saving)}"
            if 'http' in processed_filename: # Sanitize
                processed_filename = f"processed_{timestamp}.jpg"
                
            processed_image_path = os.path.join(temp_dir, processed_filename)
            cv2.imwrite(processed_image_path, vis_img)
            
            # --- Final Response Construction ---
            # Prepare prevention suggestions (flatten if needed)
            prevention_raw = ai_insights.get("prevention", "Monitor regularly.") if ai_insights else "Monitor regularly."
            prevention_list = []
            if isinstance(prevention_raw, list):
                prevention_list = [str(p) for p in prevention_raw]
            elif isinstance(prevention_raw, dict):
                for k, v in prevention_raw.items():
                    val_str = ", ".join(v) if isinstance(v, list) else str(v)
                    prevention_list.append(f"{k.title()}: {val_str}")
            else:
                prevention_list = [str(prevention_raw)]

            tappability_advice = ai_insights.get("tappability_advice", "Check health before tapping.") if ai_insights else "Check health before tapping."

            return {
                "diseaseDetection": [{
                    "name": disease_name,
                    "confidence": confidence,
                    "severity": severity,
                    "recommendation": recommendation,
                    "ai_diagnosis": ai_insights.get("diagnosis", "No detailed diagnosis available.") if ai_insights else None
                }],
                "leafAnalysis": {
                    "healthStatus": "healthy" if disease_name.lower() == 'healthy' else "diseased",
                    "spotCount": spot_count,
                    "color": color_name,
                    "detailed_analysis": ai_insights # Include full AI object
                },
                "processed_image_path": processed_image_path,
                # Use AI advice for productivity if available, else generate default
                "productivityRecommendation": {
                    "status": "optimal" if severity == "none" else "at_risk",
                    "suggestions": prevention_list + [tappability_advice] if ai_insights else generate_productivity_recommendation(
                        "healthy" if disease_name.lower() == 'healthy' else "diseased", 
                        disease_name, 
                        disease_name.lower() == 'healthy', 
                        severity
                    )["suggestions"]
                }
            }

        except Exception as e:
            sys.stderr.write(f"Leaf model inference failed: {e}\n")
            # Return basic error structure but try to survive
            return {
                "diseaseDetection": [{"name": "Error", "confidence": 0, "severity": "unknown", "recommendation": "Analysis failed."}],
                "leafAnalysis": {
                    "healthStatus": "unknown",
                    "spotCount": 0,
                    "color": "Unknown",
                    "detailed_analysis": None
                },
                "processed_image_path": None,
                "productivityRecommendation": {"status": "unknown", "suggestions": []}
            }
    
    # Fallback if model load failed
    return {
        "diseaseDetection": [{"name": "System Error", "confidence": 0, "severity": "unknown", "recommendation": "Model unavailable."}],
        "leafAnalysis": {
            "healthStatus": "unknown",
            "spotCount": 0,
            "color": "Unknown",
            "detailed_analysis": None
        },
        "processed_image_path": None,
        "productivityRecommendation": {"status": "unknown", "suggestions": []}
    }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments"}))
        return

    mode = sys.argv[1]

    if mode == 'ai_suggestions':
        # Mode: Generate AI suggestions only (skipping image processing)
        # argv[2] should be a JSON string with detection data
        try:
            data_json = sys.argv[2]
            data = json.loads(data_json)
            
            disease_name = data.get('disease_name', 'Unknown')
            confidence = data.get('confidence', 0)
            spot_count = data.get('spot_count', 0)
            color_name = data.get('color_name', 'Green')
            
            sys.stderr.write(f"🧠 [Python AI] Generating suggestions for {disease_name}...\n")
            
            ai_insights = get_groq_analysis(disease_name, confidence, spot_count, color_name)
            
            # If Groq fails or returns null, provide basic fallback
            if not ai_insights:
                ai_insights = {
                    "diagnosis": f"Detected {disease_name}. Detailed AI diagnosis unavailable.",
                    "treatment": "Standard fungicide application recommended.",
                    "prevention": "Monitor regularly.",
                    "severity_reasoning": "Based on visual detection.",
                    "tappability_advice": "Proceed with caution."
                }
                
            print(json.dumps(ai_insights))
            return

        except Exception as e:
             sys.stderr.write(f"❌ [Python AI] Error parsing input or generating suggestions: {e}\n")
             print(json.dumps({"error": str(e)}))
             return

    image_url = sys.argv[2]
    # Robust argument parsing for sub_mode
    raw_sub_mode = sys.argv[3] if len(sys.argv) > 3 else ''
    sub_mode = raw_sub_mode.strip().lower()
    
    sys.stderr.write(f"ℹ️ [Python ML] Mode: {mode}, SubMode: '{sub_mode}' (Raw: '{raw_sub_mode}')\n")

    img = download_image(image_url)
    if img is None:
        print(json.dumps({"error": "Failed to load image"}))
        return

    if mode == 'tree':
        # 1. Determine Scan Subtype (Leaf vs Trunk)
        # Priority: User Input (sub_mode) > AI Classification > Default
        
        is_user_specified_trunk = sub_mode == 'trunk'
        is_user_specified_leaf = sub_mode == 'leaf'
        
        # Only run generic classification if user didn't specify, OR to validate
        classification = classify_content(img)
        
        # Override classification if user explicitly selected a mode
        if is_user_specified_trunk:
            sys.stderr.write("✅ [Python ML] User specified 'Trunk' scan. Enforcing Trunk Model.\n")
            classification['primary_part'] = 'trunk'
            classification['is_tree'] = True
        elif is_user_specified_leaf:
            sys.stderr.write("✅ [Python ML] User specified 'Leaf' scan. Enforcing Leaf Model.\n")
            classification['primary_part'] = 'leaf'
            classification['is_tree'] = True
        
        base_confidence = classification['confidence'] * 100
        
        tree_id_result = {
            "isRubberTree": classification['is_tree'],
            "confidence": base_confidence,
            "detectedPart": classification['primary_part'],
            "maturity": "mature" # default
        }
        
        # 2. Perform detailed analysis based on part
        analysis_result = {}
        
        # Logic: If it's a leaf scan (user specified OR detected)
        if classification['primary_part'] == 'leaf':
            # Use the Specialized Leaf Model
            analysis_result = analyze_leaf_with_model(img, image_url)
            
            # Merge with tree ID
            analysis_result["treeIdentification"] = tree_id_result
            
            # Fill other required fields with defaults
            analysis_result["trunkAnalysis"] = None
            
            is_healthy = analysis_result["leafAnalysis"]["healthStatus"] == "healthy"
            analysis_result["tappabilityAssessment"] = {
                "isTappable": is_healthy,
                "score": 75 if is_healthy else 40,
                "reason": "Tree is healthy, proceed to check trunk." if is_healthy else "Treat disease before tapping."
            }
            
            # Ensure productivityRecommendation is present in the final output
            if "productivityRecommendation" not in analysis_result:
                 analysis_result["productivityRecommendation"] = generate_productivity_recommendation(
                     analysis_result["leafAnalysis"]["healthStatus"],
                     analysis_result["diseaseDetection"][0]["name"],
                     is_healthy,
                     analysis_result["diseaseDetection"][0]["severity"]
                 )
            
        else:
            # TRUNK ANALYSIS (Default fallback if not leaf)
            # Use the Specialized Trunk Model (Trunks.pt)
            analysis_result = analyze_trunk_with_model(img, image_url, base_confidence)
            
            # Merge with existing tree ID (though trunk model also predicts it)
            # We trust the initial tree ID for "isRubberTree" but use trunk model for specifics
            analysis_result["treeIdentification"]["detectedPart"] = "trunk"

        print(json.dumps(analysis_result))

    elif mode == 'latex':
        # Latex analysis
        try:
            # We can optionally save a processed image if we add visualization later
            processed_path = None
            result = analyze_latex_with_model(img, processed_path)
            print(json.dumps(result))
        except Exception as e:
            sys.stderr.write(f"Latex analysis failed: {e}\n")
            # Fallback
            result = analyze_latex_heuristic(img)
            print(json.dumps(result))

def analyze_latex_with_model(img, image_path_for_saving=None):
    """
    Uses the trained Latex Quality Model (Latex.pt) for analysis.
    Integrates Groq API for detailed insights.
    """
    model = get_latex_model()
    
    # Default values
    latex_type = "Unknown"
    confidence = 0.0
    contamination_level = "low"
    grade = 'A'
    drc = 40.0 # Default DRC
    description = "Standard latex."
    
    # Heuristic Fallback logic components
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    avg_color_per_row = np.average(img, axis=0)
    avg_color = np.average(avg_color_per_row, axis=0)
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    contamination_pixels = cv2.countNonZero(thresh)
    contamination_ratio = contamination_pixels / (img.shape[0] * img.shape[1])
    
    if model:
        try:
            results = model(img, verbose=False)
            
            # Check if Classification or Detection model
            if hasattr(results[0], 'probs') and results[0].probs is not None:
                # Classification Model
                probs = results[0].probs
                top1_index = probs.top1
                latex_type = results[0].names[top1_index]
                confidence = float(probs.top1conf.item()) * 100
            elif hasattr(results[0], 'boxes') and results[0].boxes is not None:
                # Detection Model - find the class with highest confidence or most occurrences
                boxes = results[0].boxes
                if len(boxes) > 0:
                    # Get the box with highest confidence
                    best_box_idx = boxes.conf.argmax()
                    cls_id = int(boxes.cls[best_box_idx].item())
                    latex_type = results[0].names[cls_id]
                    confidence = float(boxes.conf[best_box_idx].item()) * 100
                else:
                    latex_type = "Unknown"
                    confidence = 0.0
            
            sys.stderr.write(f"✅ [Python ML] Latex Model Prediction: {latex_type} ({confidence:.1f}%)\n")
            
            # --- Combine AI Prediction with Heuristics ---
            
            # Use detection box if available to mask the latex area for accurate color
            latex_mask = None
            if hasattr(results[0], 'boxes') and results[0].boxes is not None and len(results[0].boxes) > 0:
                best_box_idx = results[0].boxes.conf.argmax()
                box = results[0].boxes.xyxy[best_box_idx].cpu().numpy().astype(int)
                x1, y1, x2, y2 = box
                
                # Create mask for color analysis
                latex_mask = np.zeros(img.shape[:2], dtype=np.uint8)
                latex_mask[y1:y2, x1:x2] = 255
            else:
                # Fallback: Use HSV segmentation to find latex-colored regions (White/Yellowish)
                # This ignores dark bark/background
                hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
                
                # Define range for white/cream/yellowish latex
                # Hue: 0-180 (OpenCV), allow yellowish (20-40) and neutral/white
                # Saturation: Low for white (0-60), higher for yellow (up to 150)
                # Value: High brightness (>100)
                
                # White/Light Grey Mask
                lower_white = np.array([0, 0, 100])
                upper_white = np.array([180, 60, 255])
                mask_white = cv2.inRange(hsv_img, lower_white, upper_white)
                
                # Yellowish Mask (for oxidized latex)
                lower_yellow = np.array([15, 60, 100])
                upper_yellow = np.array([40, 200, 255])
                mask_yellow = cv2.inRange(hsv_img, lower_yellow, upper_yellow)
                
                # Combine masks
                latex_mask = cv2.bitwise_or(mask_white, mask_yellow)
                
                # Clean up mask (morphology)
                kernel = np.ones((5,5), np.uint8)
                latex_mask = cv2.morphologyEx(latex_mask, cv2.MORPH_OPEN, kernel)
                latex_mask = cv2.morphologyEx(latex_mask, cv2.MORPH_CLOSE, kernel)
                
                # If mask is empty (e.g., lighting issues), fallback to center crop
                if cv2.countNonZero(latex_mask) < (img.shape[0] * img.shape[1] * 0.05): # Less than 5% latex found
                    sys.stderr.write("⚠️ [Python ML] Latex segmentation failed, falling back to center crop.\n")
                    h, w = img.shape[:2]
                    center_h, center_w = h // 2, w // 2
                    crop_h, crop_w = h // 3, w // 3
                    latex_mask = np.zeros(img.shape[:2], dtype=np.uint8)
                    latex_mask[center_h-crop_h//2:center_h+crop_h//2, center_w-crop_w//2:center_w+crop_w//2] = 255

            # Calculate average color ONLY within the mask
            avg_color = cv2.mean(img, mask=latex_mask)[:3]
            
            # Re-calculate contamination ratio within the MASKED area only
            # Invert mask to find dark spots inside the latex area
            # We want pixels that are INSIDE latex_mask but are DARK (contamination)
            gray_masked = cv2.bitwise_and(gray, gray, mask=latex_mask)
            _, contamination_thresh = cv2.threshold(gray_masked, 90, 255, cv2.THRESH_BINARY)
            # Dark pixels will be 0, bright will be 255. 
            # But outside mask is 0 too. So we need to distinguish background (0) from contamination (0).
            # Easier: Find pixels where (latex_mask > 0) AND (gray < 90)
            
            latex_pixels_count = cv2.countNonZero(latex_mask)
            if latex_pixels_count > 0:
                # Contamination = pixels inside mask that are dark
                contamination_mask = cv2.inRange(gray_masked, 1, 90) # 1 to exclude background 0
                contamination_pixels = cv2.countNonZero(contamination_mask)
                contamination_ratio = contamination_pixels / latex_pixels_count
            else:
                contamination_ratio = 0.0

            # Adjust Grade/DRC based on Model Class
            primary_color_class = "Unknown"
            
            # Normalize type string for robust matching against Latex.pt classes
            # Expected classes: "latex with water", "yellow latex", "white latex"
            lt_lower = latex_type.lower()
            
            # Default values
            grade = 'B'
            drc = 35.0
            contamination_level = "low"
            description = f"Detected: {latex_type}"
            
            if "white" in lt_lower:
                # "white latex" -> High Quality
                grade = 'A'
                drc = 40.0
                description = "High quality fresh white latex."
                primary_color_class = "White Latex"
                contamination_level = "low"
                
            elif "yellow" in lt_lower:
                # "yellow latex" -> Oxidized / Pre-coagulated
                grade = 'C'
                drc = 32.0
                description = "Yellowish/Oxidized latex detected."
                primary_color_class = "Yellow/Oxidized"
                contamination_level = "medium" # Oxidation is a form of contamination/degradation
                
            elif "water" in lt_lower:
                # "latex with water" -> Diluted / Rain Contamination
                grade = 'D'
                drc = 15.0
                description = "Diluted or contaminated with water."
                primary_color_class = "Water/Diluted"
                contamination_level = "high"
                
            elif "lump" in lt_lower or "cup" in lt_lower:
                 grade = 'B'
                 drc = 55.0 
                 description = "Cup lump detected."
                 primary_color_class = "Cup Lump"
            else:
                # Fallback for unknown classes
                grade = 'B'
                drc = 35.0
                description = f"Detected: {latex_type}"
                primary_color_class = latex_type.title()

            # Refine contamination level based on visual analysis (pixels)
            # Only downgrade if visual analysis CONFIRMS physical debris, or if Model says "water"
            if "water" in lt_lower:
                 contamination_level = "high"
            elif contamination_ratio > 0.05:
                # Physical debris detected
                if grade < 'D': grade = chr(ord(grade) + 1) 
                drc -= 2 
                if contamination_level != "high": contamination_level = "medium"
                description += " Debris detected."
            
            drc = max(5.0, drc) # Min floor

            # --- AI Insights (Groq) ---
            sys.stderr.write(f"🧠 [Python ML] Requesting detailed latex analysis from Groq...\n")
            ai_insights = get_groq_latex_analysis(latex_type, confidence, contamination_level, drc)
            
            quality_assessment = description
            processing_advice = "Filter and centrifuge."
            
            if ai_insights:
                quality_assessment = ai_insights.get("quality_assessment", description)
                processing_advice = ai_insights.get("processing_advice", "Filter and centrifuge.")
                if isinstance(processing_advice, list): processing_advice = "; ".join(processing_advice)
                elif isinstance(processing_advice, dict): processing_advice = str(processing_advice)
            
            # --- Construct Result ---
            # Re-convert BGR to RGB for output
            r_val = int(avg_color[2])
            g_val = int(avg_color[1])
            b_val = int(avg_color[0])
            
            return {
                "colorAnalysis": {
                    "primaryColor": primary_color_class, 
                    "rgb": { "r": r_val, "g": g_val, "b": b_val },
                    "hex": "#{:02x}{:02x}{:02x}".format(r_val, g_val, b_val)
                },
                "qualityClassification": {
                    "grade": grade,
                    "description": quality_assessment, # Use AI detailed assessment
                    "confidence": confidence
                },
                "productYieldEstimation": {
                    "dryRubberContent": drc,
                    "productType": ai_insights.get("market_value_insight", "USS") if ai_insights else "USS"
                },
                "quantityEstimation": {
                    "volume": 0 # Needs user input or depth estimation
                },
                "contaminationDetection": {
                    "hasContamination": contamination_ratio > 0.01,
                    "contaminationLevel": contamination_level,
                    "contaminantTypes": ["Water"] if contamination_level == "high" else (["Debris"] if contamination_ratio > 0.02 else []),
                    "details": ai_insights.get("contamination_handling", "Filter required") if ai_insights else "Filter required"
                },
                "productRecommendation": {
                    "recommendedProduct": "RSS (Ribbed Smoked Sheet)" if grade in ['A','B'] else "Cup Lump",
                    "reason": processing_advice,
                    "preservation": ai_insights.get("preservation_tips", "Use Ammonia") if ai_insights else "Use Ammonia"
                },
                "marketAnalysis": ai_insights.get("market_analysis") if ai_insights else None,
                "aiInsights": { # New standardized field
                    "promptRecommendations": [
                        f"How to improve {latex_type} quality?",
                        "Best preservation methods for latex",
                        "Current rubber market prices"
                    ],
                    "suggestions": [processing_advice, ai_insights.get("preservation_tips", "Check for pre-coagulation")] if ai_insights else [processing_advice]
                }
            }
        except Exception as e:
            sys.stderr.write(f"❌ [Python ML] Model inference error: {e}\n")
            # Fallback to heuristic
            return analyze_latex_heuristic(img)
    
    # Fallback if no model
    return analyze_latex_heuristic(img)



def analyze_trunk_with_model(img, image_path_for_saving=None, base_confidence=0.0):
    """
    Uses the trained Trunks.pt model for disease detection and analysis.
    """
    model = get_trunk_model()
    
    # Default values
    disease_name = "Healthy"
    confidence = base_confidence # Use base classification confidence as default
    severity = "none"
    recommendation = "Maintain regular monitoring."
    processed_image_path = None
    
    if model:
        try:
            results = model(img, verbose=False)
            
            # Check for detections (OBB or Standard Box)
            if hasattr(results[0], 'obb') and results[0].obb is not None and len(results[0].obb) > 0:
                # OBB Detection
                best_idx = results[0].obb.conf.argmax()
                cls_id = int(results[0].obb.cls[best_idx].item())
                disease_name = results[0].names[cls_id]
                confidence = float(results[0].obb.conf[best_idx].item()) * 100
            elif hasattr(results[0], 'boxes') and results[0].boxes is not None and len(results[0].boxes) > 0:
                # Standard Box Detection
                best_idx = results[0].boxes.conf.argmax()
                cls_id = int(results[0].boxes.cls[best_idx].item())
                disease_name = results[0].names[cls_id]
                confidence = float(results[0].boxes.conf[best_idx].item()) * 100
            elif hasattr(results[0], 'probs') and results[0].probs is not None:
                # Classification Fallback
                probs = results[0].probs
                top1_index = probs.top1
                disease_name = results[0].names[top1_index]
                confidence = float(probs.top1conf.item()) * 100
            
            # Ensure confidence is not zero if we default to healthy but have a base confidence
            if confidence == 0.0 and base_confidence > 0:
                 confidence = base_confidence

            # Map Disease Name to Health Status & Severity
            disease_name, severity, recommendation = map_trunk_disease(disease_name)
            
            sys.stderr.write(f"✅ [Python ML] Trunk Model Prediction: {disease_name} ({confidence:.1f}%)\n")
            
            # Get Groq Analysis
            sys.stderr.write(f"🧠 [Python ML] Requesting detailed trunk analysis from Groq...\n")
            
            # --- Physical Properties (Real Analysis) ---
            # Pass bounding box if available for better girth estimation
            bbox = None
            if hasattr(results[0], 'obb') and results[0].obb is not None and len(results[0].obb) > 0:
                 best_idx = results[0].obb.conf.argmax()
                 bbox = results[0].obb.xyxyxyxy[best_idx].cpu().numpy().astype(int) # 4 points
            elif hasattr(results[0], 'boxes') and results[0].boxes is not None and len(results[0].boxes) > 0:
                 best_idx = results[0].boxes.conf.argmax()
                 bbox = results[0].boxes.xyxy[best_idx].cpu().numpy().astype(int) # [x1, y1, x2, y2]
            
            trunk_phys = analyze_trunk_physical(img, bbox)
            
            # We can reuse the leaf analysis prompt structure or create a new one. 
            # For simplicity, we reuse get_groq_analysis but contextually it works for diseases.
            ai_insights = get_groq_analysis(disease_name, confidence, 0, trunk_phys["color"]) # Use real color
            
            if ai_insights:
                 recommendation = ai_insights.get("treatment", recommendation)
                 if isinstance(recommendation, list): recommendation = "; ".join(recommendation)
                 elif isinstance(recommendation, dict): recommendation = str(recommendation)
            
            return {
                "treeIdentification": {
                    "isRubberTree": True,
                    "confidence": confidence,
                    "detectedPart": "trunk",
                    "maturity": "mature"
                },
                "trunkAnalysis": {
                    "girth": trunk_phys["girth"],
                    "diameter": trunk_phys["diameter"],
                    "texture": trunk_phys["texture"],
                    "color": trunk_phys["color"],
                    "healthStatus": "healthy" if severity == "none" else "diseased",
                    "damages": [disease_name] if severity != "none" else []
                },
                "leafAnalysis": None,
                "diseaseDetection": [{
                     "name": disease_name, 
                     "confidence": confidence, 
                     "severity": severity, 
                     "recommendation": recommendation,
                     "ai_diagnosis": ai_insights.get("diagnosis", "No detailed diagnosis available.") if ai_insights else None
                }],
                "tappabilityAssessment": {
                    "isTappable": severity == "none" and trunk_phys['girth'] > 45,
                    "score": 85 if severity == "none" else 30,
                    "reason": "Tree is healthy." if severity == "none" else f"Untappable due to {disease_name}."
                },
                "productivityRecommendation": { # Add this
                    "status": "optimal" if severity == "none" else "critical",
                    "suggestions": [recommendation]
                }
            }

        except Exception as e:
            sys.stderr.write(f"❌ [Python ML] Trunk model inference failed: {e}\n")
            return analyze_trunk_heuristic_wrapper(img)
            
    return analyze_trunk_heuristic_wrapper(img)

def analyze_trunk_heuristic_wrapper(img):
    # Wrapper to format heuristic output to match full analysis structure
    trunk_data = analyze_trunk_physical(img) # Use new physical analysis
    return {
        "treeIdentification": {"isRubberTree": True, "confidence": 100, "detectedPart": "trunk", "maturity": "mature"},
        "trunkAnalysis": trunk_data,
        "leafAnalysis": None,
        "diseaseDetection": [{
             "name": "No disease detected (Heuristic)", 
             "confidence": 0, 
             "severity": "none", 
             "recommendation": "Trunk analysis limited to physical properties."
        }],
        "tappabilityAssessment": {
            "isTappable": trunk_data['girth'] > 45,
            "score": 85 if trunk_data['girth'] > 45 else 40,
            "reason": "Suitable girth." if trunk_data['girth'] > 45 else "Girth too small."
        },
        "productivityRecommendation": {"status": "optimal", "suggestions": ["Monitor growth."]}
    }

def analyze_trunk_physical(img, bbox=None):
    """
    Analyzes physical properties of the trunk from the image.
    Uses bounding box if available, otherwise heuristic center crop.
    """
    height, width = img.shape[:2]
    
    # 1. Girth/Diameter Estimation (Pixel-based)
    # If we have a bbox, use its width. Otherwise, estimate from center.
    pixel_width = 0
    if bbox is not None:
        if len(bbox.shape) == 2 and bbox.shape[0] == 4: # OBB 4 points
             # Calculate width as min side of rotated rect? Or just bounds.
             # Simple approach: max x - min x
             xs = bbox[:, 0]
             pixel_width = np.max(xs) - np.min(xs)
        elif len(bbox.shape) == 1 and bbox.shape[0] == 4: # Box [x1, y1, x2, y2]
             pixel_width = bbox[2] - bbox[0]
    
    if pixel_width == 0:
        # Heuristic: Find strong vertical edges in the middle third
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        center_row = gray[height//2, :]
        edges = cv2.Canny(gray, 50, 150)
        row_edges = edges[height//2, :]
        edge_indices = np.where(row_edges > 0)[0]
        
        if len(edge_indices) >= 2:
            pixel_width = edge_indices[-1] - edge_indices[0]
        else:
            pixel_width = width * 0.4 # Fallback to 40% of image width
            
    # Convert pixel width to estimated cm
    # Assumption: Standard photo distance (~1m), standard camera FOV covers ~1m width
    # This is a ROUGH ESTIMATE.
    cm_per_pixel = 100.0 / width # Assuming 1m width field of view
    estimated_diameter_cm = float(pixel_width * cm_per_pixel)
    estimated_girth_cm = float(estimated_diameter_cm * 3.14159)
    
    # Clamp to realistic values (10cm - 150cm)
    estimated_girth_cm = max(10.0, min(150.0, estimated_girth_cm))
    estimated_diameter_cm = estimated_girth_cm / 3.14159

    # 2. Texture Analysis
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Calculate GLCM-like features (Contrast/Entropy via simple variance)
    # High variance in local patches = Rough
    # Low variance = Smooth
    
    # Crop to center for texture analysis to avoid background
    crop_size = min(height, width) // 4
    center_y, center_x = height // 2, width // 2
    texture_roi = gray[center_y-crop_size:center_y+crop_size, center_x-crop_size:center_x+crop_size]
    
    if texture_roi.size == 0: texture_roi = gray # Fallback
    
    # Variance of Laplacian (measure of texture detail)
    laplacian_var = cv2.Laplacian(texture_roi, cv2.CV_64F).var()
    
    texture = "rough" if laplacian_var > 500 else "smooth"
    if laplacian_var > 1500: texture = "very rough/damaged"
    
    # 3. Color Analysis
    # Reuse dominant color logic but formatted for trunk
    # Crop to center again
    color_roi = img[center_y-crop_size:center_y+crop_size, center_x-crop_size:center_x+crop_size]
    if color_roi.size == 0: color_roi = img
    
    dominant_color = get_dominant_color_name(color_roi)
    
    # Refine color name for trunk context
    if "Green" in dominant_color: dominant_color = "Mossy/Greenish"
    if "Yellow" in dominant_color: dominant_color = "Pale/Yellowish"
    
    return {
        "girth": round(float(estimated_girth_cm), 1),
        "diameter": round(float(estimated_diameter_cm), 1),
        "texture": texture,
        "color": dominant_color,
        "healthStatus": "unknown", # Determined by model, not physical
        "damages": [],
        "is_immature": bool(estimated_girth_cm < 40)
    }

def analyze_trunk_heuristic(img):
    # Legacy wrapper
    return analyze_trunk_physical(img)

def analyze_latex_heuristic(img):
    # ... (Keep existing latex logic or simplify)
    # Using the logic from previous main.py for latex
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    avg_color_per_row = np.average(img, axis=0)
    avg_color = np.average(avg_color_per_row, axis=0)
    mean_saturation = np.mean(hsv[:, :, 1])
    mean_value = np.mean(hsv[:, :, 2])
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    contamination_pixels = cv2.countNonZero(thresh)
    contamination_ratio = contamination_pixels / (img.shape[0] * img.shape[1])
    
    grade = 'A'
    drc = 40.0
    description = "Excellent quality."
    
    if contamination_ratio > 0.05:
        grade = 'D'; drc -= 10; description = "High contamination."
    elif mean_saturation > 50:
        grade = 'C'; drc -= 5; description = "Discolored."
    elif mean_value < 150:
        grade = 'B'; drc -= 2; description = "Dark impurities."
        
    return {
        "latexColorAnalysis": {
            "primaryColor": "white",
            "hex": "#{:02x}{:02x}{:02x}".format(int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))
        },
        "latexQualityPrediction": {
            "quality": "excellent" if grade == 'A' else "good",
            "dryRubberContent": drc,
            "estimatedPrice": 0
        },
        "qualityClassification": {
            "grade": grade,
            "description": description
        },
        "productYieldEstimation": {
             "dryRubberContent": drc
        },
        "quantityEstimation": {
            "volume": 2.5,
            "weight": 2.5
        },
        "contaminationDetection": {
             "hasContamination": contamination_ratio > 0.01
        }
    }

if __name__ == "__main__":
    # print("DEBUG: MAIN CALLED")
    main()
