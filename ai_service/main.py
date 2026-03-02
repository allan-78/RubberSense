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
            weights_dir = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights')
            model_candidates = [
                os.path.join(weights_dir, 'Leaf-v2.pt'),
                os.path.join(weights_dir, 'Leaf.pt'),
                os.path.join(weights_dir, 'best.pt')
            ]
            model_path = next((candidate for candidate in model_candidates if os.path.exists(candidate)), None)

            if model_path:
                LEAF_MODEL = YOLO(model_path)
                sys.stderr.write(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [Python ML] Loaded Leaf Model: {model_path}\n")
            else:
                checked = ", ".join(model_candidates)
                sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Leaf model not found. Checked: {checked}\n")
        except Exception as e:
            sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Failed to load leaf model: {e}\n")
    return LEAF_MODEL

def get_trunk_model():
    global TRUNK_MODEL
    if TRUNK_MODEL is None and YOLO_AVAILABLE:
        try:
            weights_dir = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights')
            primary_model_path = os.path.join(weights_dir, 'Trunks-v2.pt')
            fallback_model_path = os.path.join(weights_dir, 'Trunks.pt')
            model_path = primary_model_path if os.path.exists(primary_model_path) else fallback_model_path
            if os.path.exists(model_path):
                TRUNK_MODEL = YOLO(model_path)
                sys.stderr.write(f"Loaded Trunk Model: {model_path}\n")
            else:
                sys.stderr.write(
                    f"Trunk model not found. Checked: {primary_model_path} and {fallback_model_path}\n"
                )
        except Exception as e:
            sys.stderr.write(f"Failed to load trunk model: {e}\n")
    return TRUNK_MODEL

def get_latex_model():
    global LATEX_MODEL
    if LATEX_MODEL is None and YOLO_AVAILABLE:
        try:
            model_path = os.path.join(os.path.dirname(__file__), 'models/rubber_tree_model/weights/Latex.pt')
            if os.path.exists(model_path):
                LATEX_MODEL = YOLO(model_path)
                sys.stderr.write(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [Python ML] Loaded Latex Model: {model_path}\n")
            else:
                sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Latex model not found at {model_path}\n")
        except Exception as e:
            sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Failed to load latex model: {e}\n")
    return LATEX_MODEL

def get_cls_model():
    global CLS_MODEL
    if CLS_MODEL is None and YOLO_AVAILABLE:
        try:
            CLS_MODEL = YOLO('yolo11n-cls.pt')
        except Exception as e:
            sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Failed to load CLS model: {e}\n")
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
        sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Groq API] Analysis failed: {e}\n")
    
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
    6. "recommended_end_products": Array of 3-6 product-use suggestions based on this latex quality
       (e.g., "Medical gloves", "Household gloves", "Adhesive latex", "Rubberized asphalt blend").
    7. "grade_based_product_recommendations": Array of concise recommendations where each item includes product + use case + why.
    8. "primary_recommended_product": Best single product category for this quality.
    9. "market_analysis": {{
        "trend": "stable" | "increasing" | "decreasing",
        "estimated_price_range_php": "min-max" (e.g., "50-60"),
        "reasoning": "Reason for the price estimation based on quality and general market knowledge."
    }}
    10. "prompt_recommendations": Array of 3-6 concise user questions for the assistant.
    11. "suggestions": Array of 4-8 actionable bullet-ready recommendations for this specific sample.

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
        sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Groq API] Latex Analysis failed: {e}\n")
    
    return None

def to_text_list(value):
    """
    Normalize mixed AI response values into a clean list of display strings.
    """
    if value is None:
        return []

    if isinstance(value, list):
        out = []
        for item in value:
            if item is None:
                continue
            txt = str(item).strip()
            if txt:
                out.append(txt)
        return out

    if isinstance(value, dict):
        out = []
        for k, v in value.items():
            key = str(k).strip()
            val = str(v).strip()
            if key and val:
                out.append(f"{key}: {val}")
        return out

    text = str(value).strip()
    if not text:
        return []

    parts = [p.strip() for p in text.replace('\r', '\n').split('\n') if p.strip()]
    return parts if parts else [text]

def text_says_healthy(value):
    """
    Detect if AI text explicitly indicates a healthy/no-disease outcome.
    """
    text = " ".join(to_text_list(value)).lower().strip()
    if not text:
        return False

    explicit_healthy = [
        "no disease detected",
        "no signs of disease",
        "no evidence of disease",
        "disease-free",
        "appears healthy",
        "tree is healthy"
    ]
    if any(token in text for token in explicit_healthy):
        return True

    has_healthy = "healthy" in text
    disease_terms = [
        "diseased", "infection", "infected", "blight", "mildew",
        "rot", "canker", "fungal", "lesion", "necrosis", "rust", "pustule"
    ]
    has_disease_terms = any(term in text for term in disease_terms)
    return has_healthy and not has_disease_terms

def build_latex_ai_recommendation(ai_insights, grade, fallback_quality_assessment):
    """
    Build latex recommendations from Groq output only.
    If Groq is unavailable, return explicit AI-unavailable placeholders (not static products).
    """
    unavailable = "AI recommendation unavailable. Please re-analyze when Groq is available."

    quality_assessment = str(fallback_quality_assessment or "").strip() or unavailable
    processing_advice = unavailable
    preservation_tips = unavailable
    market_value_insight = unavailable
    contamination_handling = unavailable
    recommended_product = "AI recommendation unavailable"
    recommended_uses = []
    market_analysis = None
    prompt_recommendations = []
    suggestions = []

    if ai_insights:
        quality_assessment = str(
            ai_insights.get("quality_assessment", fallback_quality_assessment) or fallback_quality_assessment or unavailable
        ).strip()

        processing_values = to_text_list(ai_insights.get("processing_advice"))
        preservation_values = to_text_list(ai_insights.get("preservation_tips"))
        market_values = to_text_list(ai_insights.get("market_value_insight"))
        contamination_values = to_text_list(ai_insights.get("contamination_handling"))

        processing_advice = "; ".join(processing_values) if processing_values else unavailable
        preservation_tips = "; ".join(preservation_values) if preservation_values else unavailable
        market_value_insight = "; ".join(market_values) if market_values else unavailable
        contamination_handling = "; ".join(contamination_values) if contamination_values else unavailable

        ai_primary_product = str(ai_insights.get("primary_recommended_product", "")).strip()
        ai_end_products = to_text_list(ai_insights.get("recommended_end_products"))
        ai_grade_recs = to_text_list(ai_insights.get("grade_based_product_recommendations"))
        recommended_uses = list(dict.fromkeys(ai_end_products + ai_grade_recs))
        prompt_recommendations = list(dict.fromkeys(
            to_text_list(ai_insights.get("prompt_recommendations"))
            + to_text_list(ai_insights.get("promptRecommendations"))
        ))
        suggestions = list(dict.fromkeys(to_text_list(ai_insights.get("suggestions"))))
        if not suggestions:
            suggestions = list(dict.fromkeys(
                processing_values + preservation_values + market_values + contamination_values + ai_end_products[:3]
            ))

        if ai_primary_product:
            recommended_product = ai_primary_product
        elif recommended_uses:
            recommended_product = recommended_uses[0]

        market_analysis = ai_insights.get("market_analysis")

    return {
        "quality_assessment": quality_assessment,
        "processing_advice": processing_advice,
        "preservation_tips": preservation_tips,
        "market_value_insight": market_value_insight,
        "contamination_handling": contamination_handling,
        "recommended_product": recommended_product,
        "recommended_uses": recommended_uses[:8],
        "expected_quality": f"Grade {grade}",
        "market_analysis": market_analysis,
        "prompt_recommendations": prompt_recommendations[:8],
        "suggestions": suggestions[:12]
    }

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
    PRIORITIZES Generic Classifier (YOLOv11-cls) to filter out non-plant objects.
    Then uses Leaf Model (Leaf-v2.pt preferred) for specific confirmation if needed.
    """
    
    primary_part = 'unknown'
    confidence = 0.0
    
    # 1. First, check if it's even a plant/tree using Generic ImageNet Model
    if YOLO_AVAILABLE:
        try:
            model = get_cls_model()
            if model:
                results = model(img, verbose=False)
                
                # Check top 5 classes
                top5 = results[0].probs.top5
                names = results[0].names
                
                trunk_keywords = ['bark', 'trunk', 'wood', 'log', 'tree']
                leaf_keywords = ['leaf', 'foliage', 'plant', 'flower', 'green', 'vegetable', 'fruit', 'herb', 'shrub'] 
                non_plant_keywords = [
                    'wall', 'floor', 'paper', 'rock', 'sand', 'soil', 'fabric', 'plastic', 
                    'keyboard', 'computer', 'laptop', 'screen', 'monitor', 'mouse', 
                    'electronic', 'device', 'furniture', 'table', 'desk', 'room', 
                    'interior', 'man-made', 'text', 'book', 'writing'
                ]
                
                trunk_score = 0.0
                leaf_score = 0.0
                non_plant_score = 0.0
                
                for idx in top5:
                    class_name = names[idx].lower()
                    score = float(results[0].probs.data[idx])
                    
                    if any(k in class_name for k in trunk_keywords):
                        trunk_score += score
                    elif any(k in class_name for k in leaf_keywords):
                        leaf_score += score
                    elif any(k in class_name for k in non_plant_keywords):
                        non_plant_score += score
                        
                    confidence = max(confidence, score)
                
                # Strict filtering logic
                # 1. HARD REJECT if non-plant score is dominant
                # User Feedback: "keyboard detected as leaf" -> We need this.
                # User Feedback: "clear trunk detected as not trunk" -> We need to be less strict.
                # Changed from 0.4 to 0.6 to allow more ambiguity.
                if non_plant_score > 0.6 and leaf_score < 0.2 and trunk_score < 0.2:
                     sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Generic model detected NON-PLANT object. Non-Plant Score: {non_plant_score:.2f}\n")
                     primary_part = 'unknown'
                
                # 2. Require reasonable plant score
                elif leaf_score > 0.15 or trunk_score > 0.15:
                    # It's likely a plant
                    if trunk_score > leaf_score:
                        primary_part = 'trunk'
                    else:
                        primary_part = 'leaf'
                else:
                    # Likely not a plant (or very unsure)
                    sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Generic model did not detect plant features. Top 1: {names[top5[0]]}\n")
                    primary_part = 'unknown'

        except Exception as e:
            sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Generic model check failed: {e}\n")

    # 2. If Generic thinks it's a leaf (or is unsure), VALIDATE with Leaf Model
    #    If Generic thinks it's 'unknown', we give Leaf Model a chance ONLY if confidence was low
    if primary_part == 'leaf' or (primary_part == 'unknown' and confidence < 0.3):
        leaf_model = get_leaf_model()
        if leaf_model:
            try:
                # Run inference
                results = leaf_model(img, verbose=False)
                result = results[0]
                top1_conf = 0.0

                if hasattr(result, 'probs') and result.probs is not None and getattr(result.probs, 'top1conf', None) is not None:
                    top1_conf = float(result.probs.top1conf.item())
                elif hasattr(result, 'obb') and result.obb is not None and len(result.obb) > 0 and getattr(result.obb, 'conf', None) is not None:
                    top1_conf = float(result.obb.conf.max().item())
                elif hasattr(result, 'boxes') and result.boxes is not None and len(result.boxes) > 0 and getattr(result.boxes, 'conf', None) is not None:
                    top1_conf = float(result.boxes.conf.max().item())
                
                # Dynamic Thresholding:
                # If Generic detected 'leaf', we accept lower confidence (0.35)
                # If Generic was 'unknown', we need HIGHER confidence (0.55) to override
                required_conf = 0.35 if primary_part == 'leaf' else 0.55
                
                if top1_conf > required_conf:
                    sys.stderr.write(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [Python ML] Leaf Model identified content with confidence: {top1_conf:.2f} (Threshold: {required_conf})\n")
                    return {'is_tree': True, 'primary_part': 'leaf', 'confidence': top1_conf}
                else:
                    sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Leaf Model low confidence: {top1_conf:.2f} (Threshold: {required_conf})\n")
                    # If Generic thought it was a leaf but Leaf Model disagrees heavily?
                    # We stick with Generic's decision if it was confident, otherwise downgrade to unknown
                    if primary_part == 'leaf' and confidence < 0.4:
                        primary_part = 'unknown'

            except Exception as e:
                 sys.stderr.write(f"ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Leaf Model classification check failed: {e}\n")

    if primary_part != 'unknown': 
        return {'is_tree': True, 'primary_part': primary_part, 'confidence': confidence}
        
    return {'is_tree': False, 'primary_part': 'unknown', 'confidence': confidence}

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

def leaf_has_spatial_detection(img, min_conf=0.20):
    """
    Strict leaf validation using Leaf-v2 spatial detections only (OBB/boxes).
    Returns: (is_valid, best_conf, detected_count)
    """
    model = get_leaf_model()
    if model is None:
        return False, 0.0, 0

    def extract_confidences(pred):
        confs = []
        if hasattr(pred, 'obb') and pred.obb is not None and len(pred.obb) > 0 and getattr(pred.obb, 'conf', None) is not None:
            confs.extend([float(v) for v in pred.obb.conf.tolist()])
        if hasattr(pred, 'boxes') and pred.boxes is not None and len(pred.boxes) > 0 and getattr(pred.boxes, 'conf', None) is not None:
            confs.extend([float(v) for v in pred.boxes.conf.tolist()])
        return confs

    try:
        results = model(img, verbose=False, conf=0.15)
        confs = extract_confidences(results[0]) if results else []
        if not confs:
            low_conf_results = model(img, verbose=False, conf=0.03)
            confs = extract_confidences(low_conf_results[0]) if low_conf_results else []

        if not confs:
            return False, 0.0, 0

        best_conf = max(confs)
        valid_count = sum(1 for c in confs if c >= float(min_conf))
        return valid_count > 0, best_conf, valid_count
    except Exception as e:
        sys.stderr.write(f"[Python ML] Leaf spatial validation failed: {e}\n")
        return False, 0.0, 0

def estimate_latex_presence_ratio(img):
    """
    Estimate how much of the frame looks like latex (white/cream/yellow regions).
    Returns a ratio from 0.0 to 1.0.
    """
    if img is None:
        return 0.0

    hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Relaxed White/Cream/Off-white
    lower_white = np.array([0, 0, 80])
    upper_white = np.array([180, 90, 255])
    mask_white = cv2.inRange(hsv_img, lower_white, upper_white)

    lower_yellow = np.array([15, 60, 100])
    upper_yellow = np.array([40, 200, 255])
    mask_yellow = cv2.inRange(hsv_img, lower_yellow, upper_yellow)

    latex_mask = cv2.bitwise_or(mask_white, mask_yellow)

    kernel = np.ones((5, 5), np.uint8)
    latex_mask = cv2.morphologyEx(latex_mask, cv2.MORPH_OPEN, kernel)
    latex_mask = cv2.morphologyEx(latex_mask, cv2.MORPH_CLOSE, kernel)

    total_pixels = float(img.shape[0] * img.shape[1])
    if total_pixels <= 0:
        return 0.0

    return float(cv2.countNonZero(latex_mask)) / total_pixels

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

def get_leaf_mask(img):
    """
    Generates a binary mask for the leaf area using color segmentation.
    Focuses on Green, Yellow, and Brown hues.
    """
    if img is None: return None
    
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Define color ranges (H: 0-179, S: 0-255, V: 0-255)
    
    # Green (healthy)
    lower_green = np.array([30, 30, 30])
    upper_green = np.array([90, 255, 255])
    mask_green = cv2.inRange(hsv, lower_green, upper_green)
    
    # Yellow/Orange (disease/aging)
    lower_yellow = np.array([15, 50, 50])
    upper_yellow = np.array([30, 255, 255])
    mask_yellow = cv2.inRange(hsv, lower_yellow, upper_yellow)
    
    # Brown (dead/disease) - involves Red range which wraps around 0/180
    lower_brown1 = np.array([0, 20, 20])
    upper_brown1 = np.array([15, 255, 255])
    mask_brown1 = cv2.inRange(hsv, lower_brown1, upper_brown1)
    
    lower_brown2 = np.array([165, 20, 20])
    upper_brown2 = np.array([180, 255, 255])
    mask_brown2 = cv2.inRange(hsv, lower_brown2, upper_brown2)
    
    # Combine masks
    mask = mask_green | mask_yellow | mask_brown1 | mask_brown2
    
    # Morphological operations to clean noise
    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    
    # Find largest contour (the main leaf)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    final_mask = np.zeros_like(mask)
    
    if contours:
        largest_contour = max(contours, key=cv2.contourArea)
        # Only keep if it's reasonably sized (> 5% of image)
        if cv2.contourArea(largest_contour) > (img.shape[0] * img.shape[1] * 0.05):
            cv2.drawContours(final_mask, [largest_contour], -1, 255, thickness=cv2.FILLED)
        else:
            # If nothing significant found, return original mask (best effort)
            return mask 
            
    return final_mask

def analyze_leaf_with_model(img, image_path_for_saving):
    """
    Uses the trained Leaf Disease Model (Leaf-v2.pt preferred) for analysis.
    Integrates Groq API for detailed insights.
    """
    model = get_leaf_model()
    processed_image_path = None
    color_name = "Green"

    if model:
        try:
            results = model(img, verbose=False, conf=0.15)
            result = results[0]

            def has_spatial_detections(prediction):
                has_obb = hasattr(prediction, 'obb') and prediction.obb is not None and len(prediction.obb) > 0
                has_box = hasattr(prediction, 'boxes') and prediction.boxes is not None and len(prediction.boxes) > 0
                return has_obb or has_box

            # Leaf-v2 is treated as detection-first. Retry at lower conf to recover missed boxes.
            if not has_spatial_detections(result):
                low_conf_results = model(img, verbose=False, conf=0.03)
                if low_conf_results and has_spatial_detections(low_conf_results[0]):
                    result = low_conf_results[0]

            names = result.names if hasattr(result, 'names') else {}

            def get_leaf_class_name(class_id):
                cid = int(class_id)
                if isinstance(names, dict):
                    return str(names.get(cid, cid))
                if isinstance(names, (list, tuple)) and 0 <= cid < len(names):
                    return str(names[cid])
                return str(cid)

            def leaf_severity_and_recommendation(class_name, conf_value):
                name = str(class_name or "").strip()
                name_lower = name.lower()
                disease_terms = [
                    "disease", "blight", "spot", "mildew", "rot",
                    "canker", "infect", "rust", "pustule", "lesion", "necrosis", "mold"
                ]
                is_healthy = (
                    "no disease" in name_lower
                    or ("healthy" in name_lower and not any(term in name_lower for term in disease_terms))
                )
                if is_healthy:
                    return "none", "Tree is healthy. Continue routine care."

                if conf_value >= 85:
                    severity = "critical"
                elif conf_value >= 70:
                    severity = "high"
                elif conf_value >= 45:
                    severity = "moderate"
                else:
                    severity = "low"

                recommendation = "Maintain regular monitoring."
                if "mildew" in name_lower:
                    recommendation = "Apply sulfur-based fungicide immediately and improve airflow."
                elif "spot" in name_lower:
                    recommendation = "Apply copper-based fungicide and remove infected fallen leaves."
                elif "blight" in name_lower:
                    recommendation = "Isolate infected areas and avoid tapping until recovered."
                return severity, recommendation

            def severity_to_color(level):
                sev = str(level or "").lower()
                if sev == "none":
                    return (0, 200, 0)
                if sev in ("critical", "high"):
                    return (0, 0, 255)
                if sev == "moderate":
                    return (0, 165, 255)
                if sev == "low":
                    return (0, 255, 255)
                return (255, 80, 0)

            detections = []
            if hasattr(result, 'obb') and result.obb is not None and len(result.obb) > 0:
                for idx in range(len(result.obb)):
                    cls_id = int(result.obb.cls[idx].item())
                    name = get_leaf_class_name(cls_id).strip()
                    conf = float(result.obb.conf[idx].item()) * 100
                    severity, recommendation = leaf_severity_and_recommendation(name, conf)
                    detections.append({
                        "name": name if name else "Unknown",
                        "confidence": conf,
                        "severity": severity,
                        "recommendation": recommendation,
                        "det_type": "obb",
                        "obb": result.obb.xyxyxyxy[idx].cpu().numpy().astype(int),
                        "box": None
                    })
            elif hasattr(result, 'boxes') and result.boxes is not None and len(result.boxes) > 0:
                for idx in range(len(result.boxes)):
                    cls_id = int(result.boxes.cls[idx].item())
                    name = get_leaf_class_name(cls_id).strip()
                    conf = float(result.boxes.conf[idx].item()) * 100
                    severity, recommendation = leaf_severity_and_recommendation(name, conf)
                    detections.append({
                        "name": name if name else "Unknown",
                        "confidence": conf,
                        "severity": severity,
                        "recommendation": recommendation,
                        "det_type": "box",
                        "obb": None,
                        "box": result.boxes.xyxy[idx].cpu().numpy().astype(int)
                    })
            if not detections:
                return {"error": "Detected part non-leaf only. Please try again."}

            detections.sort(key=lambda item: float(item.get("confidence", 0) or 0), reverse=True)
            primary_index = next(
                (idx for idx, item in enumerate(detections) if str(item.get("severity") or "").lower() != "none"),
                0
            )
            if primary_index > 0:
                detections = [detections[primary_index]] + detections[:primary_index] + detections[primary_index + 1:]
            primary_detection = detections[0]

            disease_name = str(primary_detection.get("name") or "Unknown")
            confidence = float(primary_detection.get("confidence") or 0)

            leaf_mask = get_leaf_mask(img)
            masked_img = img.copy()
            masked_img[leaf_mask == 0] = [0, 0, 0]
            color_name = get_dominant_color_name(img, mask=leaf_mask)
            vis_img = img.copy()

            fallback_label_y = 28
            for det in detections:
                det_name = str(det.get("name") or "Unknown").strip()
                det_conf = float(det.get("confidence") or 0)
                det_color = severity_to_color(det.get("severity"))
                label_text = f"{det_name} ({det_conf:.1f}%)"
                label_anchor = (10, 28)

                if det.get("det_type") == "obb" and det.get("obb") is not None:
                    obb_points = np.array(det["obb"]).astype(int)
                    pts = obb_points.reshape((-1, 1, 2))
                    cv2.polylines(vis_img, [pts], True, det_color, 3)
                    min_xy = np.min(obb_points, axis=0)
                    label_anchor = (int(max(min_xy[0], 10)), int(max(min_xy[1] - 10, 24)))
                elif det.get("det_type") == "box" and det.get("box") is not None:
                    x1, y1, x2, y2 = [int(v) for v in np.array(det["box"]).flatten().tolist()]
                    cv2.rectangle(vis_img, (x1, y1), (x2, y2), det_color, 3)
                    label_anchor = (max(x1, 10), max(y1 - 10, 24))
                else:
                    continue

                cv2.putText(
                    vis_img,
                    label_text,
                    label_anchor,
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    det_color,
                    2
                )

            sys.stderr.write(f"[Python ML] Requesting detailed analysis from Groq for {disease_name}...\n")
            ai_insights = get_groq_analysis(disease_name, confidence, 0, color_name)

            all_detections_healthy = all(str(det.get("severity") or "").lower() == "none" for det in detections)
            if ai_insights and text_says_healthy(ai_insights.get("diagnosis")) and all_detections_healthy:
                primary_detection["name"] = "No disease detected"
                primary_detection["severity"] = "none"
                primary_detection["recommendation"] = "Tree is healthy. Continue routine care."
            elif ai_insights:
                raw_treatment = ai_insights.get("treatment", primary_detection.get("recommendation", ""))
                if isinstance(raw_treatment, list):
                    recommendation = "; ".join(raw_treatment)
                elif isinstance(raw_treatment, dict):
                    parts = []
                    for k, v in raw_treatment.items():
                        val_str = ", ".join(v) if isinstance(v, list) else str(v)
                        parts.append(f"{k.title()}: {val_str}")
                    recommendation = " | ".join(parts)
                else:
                    recommendation = str(raw_treatment)
                if recommendation.strip():
                    primary_detection["recommendation"] = recommendation

            script_dir = os.path.dirname(os.path.abspath(__file__))
            temp_dir = os.path.join(script_dir, 'temp_output')
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)

            timestamp = int(time.time())
            processed_filename = f"processed_{timestamp}_{os.path.basename(image_path_for_saving)}"
            if 'http' in processed_filename:
                processed_filename = f"processed_{timestamp}.jpg"

            processed_image_path = os.path.join(temp_dir, processed_filename)
            cv2.imwrite(processed_image_path, vis_img)

            primary_ai_diagnosis = (
                ai_insights.get("diagnosis", "No detailed diagnosis available.")
                if ai_insights else None
            )

            normalized_detections = []
            for idx, det in enumerate(detections):
                normalized_detections.append({
                    "name": str(det.get("name") or "Unknown").strip(),
                    "confidence": float(det.get("confidence") or 0),
                    "severity": str(det.get("severity") or "unknown").strip().lower(),
                    "recommendation": (
                        str(primary_detection.get("recommendation") or "").strip()
                        if idx == 0 else str(det.get("recommendation") or "").strip()
                    ),
                    "ai_diagnosis": primary_ai_diagnosis if idx == 0 else None
                })

            has_diseased_detection = any(
                str(det.get("severity") or "").lower() != "none"
                for det in normalized_detections
            )

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
                "diseaseDetection": normalized_detections,
                "leafAnalysis": {
                    "healthStatus": "diseased" if has_diseased_detection else "healthy",
                    "color": color_name,
                    "detailed_analysis": ai_insights,
                    "diseases": [
                        {
                            "name": det["name"],
                            "confidence": det["confidence"],
                            "severity": det["severity"]
                        }
                        for det in normalized_detections
                    ]
                },
                "processed_image_path": processed_image_path,
                "productivityRecommendation": {
                    "status": "optimal" if not has_diseased_detection else "at_risk",
                    "suggestions": prevention_list + [tappability_advice] if ai_insights else [
                        str(normalized_detections[0].get("recommendation") or "Maintain regular monitoring.")
                    ]
                }
            }

        except Exception as e:
            sys.stderr.write(f"Leaf model inference failed: {e}\n")
            return {
                "diseaseDetection": [{"name": "Error", "confidence": 0, "severity": "unknown", "recommendation": "Analysis failed."}],
                "leafAnalysis": {
                    "healthStatus": "unknown",
                    "color": "Unknown",
                    "detailed_analysis": None,
                    "diseases": []
                },
                "processed_image_path": None,
                "productivityRecommendation": {"status": "unknown", "suggestions": []}
            }

    return {
        "diseaseDetection": [{"name": "System Error", "confidence": 0, "severity": "unknown", "recommendation": "Model unavailable."}],
        "leafAnalysis": {
            "healthStatus": "unknown",
            "color": "Unknown",
            "detailed_analysis": None,
            "diseases": []
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
            
            sys.stderr.write(f"ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  [Python AI] Generating suggestions for {disease_name}...\n")
            
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
             sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python AI] Error parsing input or generating suggestions: {e}\n")
             print(json.dumps({"error": str(e)}))
             return

    image_url = sys.argv[2]
    # Robust argument parsing for sub_mode
    raw_sub_mode = sys.argv[3] if len(sys.argv) > 3 else ''
    sub_mode = raw_sub_mode.strip().lower()
    
    sys.stderr.write(f"ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¹ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Mode: {mode}, SubMode: '{sub_mode}' (Raw: '{raw_sub_mode}')\n")

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
        
        # Override classification if user explicitly selected a mode.
        # IMPORTANT: reject only on STRONG mismatch evidence to avoid false negatives.
        if is_user_specified_trunk:
            # Relaxed thresholds to reduce false rejections (User Feedback: clear trunks rejected)
            strong_leaf_mismatch = (
                classification['primary_part'] == 'leaf' and classification['confidence'] >= 0.75
            )
            strong_non_tree_mismatch = (
                classification['primary_part'] == 'unknown'
                and not classification['is_tree']
                and classification['confidence'] >= 0.85
            )

            if strong_leaf_mismatch or strong_non_tree_mismatch:
                 sys.stderr.write(
                     f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] User specified 'Trunk', strong mismatch "
                     f"(detected='{classification['primary_part']}', conf={classification['confidence']:.2f}). Rejecting.\n"
                 )
                 print(json.dumps({"error": "Detected part non-trunk only. Please try again."}))
                 return

            sys.stderr.write("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [Python ML] User specified 'Trunk' scan accepted.\n")
            classification['primary_part'] = 'trunk'
            classification['is_tree'] = True
            classification['confidence'] = max(float(classification['confidence']), 0.35)

        elif is_user_specified_leaf:
            # Relaxed thresholds to reduce false rejections
            strong_trunk_mismatch = (
                classification['primary_part'] == 'trunk' and classification['confidence'] >= 0.75
            )
            strong_non_tree_mismatch = (
                classification['primary_part'] == 'unknown'
                and not classification['is_tree']
                and classification['confidence'] >= 0.85
            )

            if strong_trunk_mismatch or strong_non_tree_mismatch:
                 sys.stderr.write(
                     f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] User specified 'Leaf', strong mismatch "
                     f"(detected='{classification['primary_part']}', conf={classification['confidence']:.2f}). Rejecting.\n"
                 )
                 print(json.dumps({"error": "Detected part non-leaf only. Please try again."}))
                 return

            # Strict validation: Leaf mode requires spatial detections from Leaf-v2.
            leaf_valid, leaf_best_conf, leaf_count = leaf_has_spatial_detection(img, min_conf=0.20)
            if not leaf_valid:
                sys.stderr.write(
                    f"[Python ML] User specified 'Leaf', but Leaf-v2 found no valid boxes/OBB "
                    f"(best_conf={leaf_best_conf:.2f}, count={leaf_count}). Rejecting.\n"
                )
                print(json.dumps({"error": "Detected part non-leaf only. Please try again."}))
                return

            classification['primary_part'] = 'leaf'
            classification['is_tree'] = True
            classification['confidence'] = max(float(classification['confidence']), float(leaf_best_conf), 0.35)
            sys.stderr.write("[Python ML] User specified 'Leaf' scan accepted.\n")
        
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
            # Safety check: never run leaf analysis without spatial leaf detections.
            leaf_valid, leaf_best_conf, leaf_count = leaf_has_spatial_detection(img, min_conf=0.20)
            if not leaf_valid:
                sys.stderr.write(
                    f"[Python ML] Leaf branch blocked - no valid Leaf-v2 boxes/OBB "
                    f"(best_conf={leaf_best_conf:.2f}, count={leaf_count}).\n"
                )
                print(json.dumps({"error": "Detected part non-leaf only. Please try again."}))
                return

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
            # Use the Specialized Trunk Model (Trunks-v2.pt)
            analysis_result = analyze_trunk_with_model(img, image_url, base_confidence)
            
            # Merge with existing tree ID (though trunk model also predicts it)
            # We trust the initial tree ID for "isRubberTree" but use trunk model for specifics
            analysis_result["treeIdentification"]["detectedPart"] = "trunk"

        print(json.dumps(analysis_result))

    elif mode == 'latex':
        # Latex-only validation tuned to reduce false negatives on valid latex photos.
        classification = classify_content(img)
        latex_presence_ratio = estimate_latex_presence_ratio(img)

        # Latex analysis
        try:
            # We can optionally save a processed image if we add visualization later
            processed_path = None
            result = analyze_latex_with_model(img, processed_path)

            model_confidence = float(result.get("qualityClassification", {}).get("confidence", 0) or 0)
            
            # Relaxed for user feedback (Latex not detected)
            strong_tree_signal = (
                classification['primary_part'] in ['leaf', 'trunk']
                and classification['confidence'] >= 0.80
            )
            strong_non_tree_signal = (
                classification['primary_part'] == 'unknown'
                and not classification['is_tree']
                and classification['confidence'] >= 0.85
            )
            weak_latex_signal = latex_presence_ratio < 0.01
            weak_latex_model = model_confidence < 30

            # Reject only when multiple signals strongly say this is not latex.
            if (strong_tree_signal or strong_non_tree_signal) and weak_latex_signal and weak_latex_model:
                sys.stderr.write(
                    f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Latex mode rejected after model check "
                    f"(detected='{classification['primary_part']}', conf={classification['confidence']:.2f}, "
                    f"model_conf={model_confidence:.1f}, latex_ratio={latex_presence_ratio:.3f}).\n"
                )
                print(json.dumps({"error": "Detected part non-latex only. Please try again."}))
                return

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
            
            sys.stderr.write(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ [Python ML] Latex Model Prediction: {latex_type} ({confidence:.1f}%)\n")
            
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
                    sys.stderr.write("ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â [Python ML] Latex segmentation failed, falling back to center crop.\n")
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
            sys.stderr.write(f"ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  [Python ML] Requesting detailed latex analysis from Groq...\n")
            ai_insights = get_groq_latex_analysis(latex_type, confidence, contamination_level, drc)
            
            ai_recommendation = build_latex_ai_recommendation(ai_insights, grade, description)
            quality_assessment = ai_recommendation["quality_assessment"]
            processing_advice = ai_recommendation["processing_advice"]
            preservation_tips = ai_recommendation["preservation_tips"]
            market_value_insight = ai_recommendation["market_value_insight"]
            recommended_product = ai_recommendation["recommended_product"]
            recommended_uses = ai_recommendation["recommended_uses"]
            
            if not recommended_uses and recommended_product != "AI recommendation unavailable":
                recommended_uses = [recommended_product]
            
            # --- Construct Result ---
            # Re-convert BGR to RGB for output
            r_val = int(avg_color[2])
            g_val = int(avg_color[1])
            b_val = int(avg_color[0])
            estimated_yield = 0.0
            ai_prompt_recommendations = ai_recommendation.get("prompt_recommendations") or []
            ai_suggestions = ai_recommendation.get("suggestions") or []
            
            return {
                "colorAnalysis": {
                    "primaryColor": primary_color_class, 
                    "hex": "#{:02x}{:02x}{:02x}".format(r_val, g_val, b_val)
                },
                "qualityClassification": {
                    "grade": grade,
                    "description": quality_assessment, # Use AI detailed assessment
                    "confidence": confidence
                },
                "productYieldEstimation": {
                    "dryRubberContent": drc,
                    "estimatedYield": estimated_yield,
                    "productType": recommended_product
                },
                "quantityEstimation": {
                    "volume": 0 # Needs user input or depth estimation
                },
                "contaminationDetection": {
                    "hasContamination": contamination_ratio > 0.01,
                    "contaminationLevel": contamination_level,
                    "contaminantTypes": ["Water"] if contamination_level == "high" else (["Debris"] if contamination_ratio > 0.02 else []),
                    "details": ai_recommendation["contamination_handling"]
                },
                "productRecommendation": {
                    "recommendedProduct": recommended_product,
                    "reason": processing_advice,
                    "expectedQuality": f"Grade {grade}",
                    "recommendedUses": recommended_uses[:8],
                    "marketValueInsight": market_value_insight,
                    "preservation": preservation_tips
                },
                "marketAnalysis": ai_recommendation["market_analysis"],
                "aiInsights": { # New standardized field
                    "promptRecommendations": ai_prompt_recommendations,
                    "suggestions": ai_suggestions
                }
            }
        except Exception as e:
            sys.stderr.write(f"ÃƒÂ¢Ã‚ÂÃ…â€™ [Python ML] Model inference error: {e}\n")
            # Fallback to heuristic
            return analyze_latex_heuristic(img)
    
    # Fallback if no model
    return analyze_latex_heuristic(img)



def analyze_trunk_with_model(img, image_path_for_saving=None, base_confidence=0.0):
    """
    Uses the trained Trunks-v2.pt model for trunk disease analysis.
    Returns all detections (not top-1 only) and renders full box/OBB overlays with labels.
    """
    model = get_trunk_model()
    processed_image_path = None

    if model:
        try:
            results = model(img, verbose=False, conf=0.15)
            result = results[0]

            def has_spatial_detections(prediction):
                has_obb = hasattr(prediction, 'obb') and prediction.obb is not None and len(prediction.obb) > 0
                has_box = hasattr(prediction, 'boxes') and prediction.boxes is not None and len(prediction.boxes) > 0
                return has_obb or has_box

            # Second pass with lower confidence to avoid missing valid trunk detections.
            if not has_spatial_detections(result):
                low_conf_results = model(img, verbose=False, conf=0.03)
                if low_conf_results and has_spatial_detections(low_conf_results[0]):
                    result = low_conf_results[0]
            names = result.names if hasattr(result, 'names') else {}

            def get_class_name(class_id):
                cid = int(class_id)
                if isinstance(names, dict):
                    return str(names.get(cid, cid))
                if isinstance(names, (list, tuple)) and 0 <= cid < len(names):
                    return str(names[cid])
                return str(cid)

            def severity_to_color(level):
                sev = str(level or "").lower()
                if sev == "none":
                    return (0, 200, 0)
                if sev in ("critical", "high"):
                    return (0, 0, 255)
                if sev == "moderate":
                    return (0, 165, 255)
                if sev == "low":
                    return (0, 255, 255)
                return (255, 80, 0)

            detections = []

            if hasattr(result, 'obb') and result.obb is not None and len(result.obb) > 0:
                for idx in range(len(result.obb)):
                    cls_id = int(result.obb.cls[idx].item())
                    raw_name = get_class_name(cls_id).strip()
                    conf = float(result.obb.conf[idx].item()) * 100
                    obb_points = result.obb.xyxyxyxy[idx].cpu().numpy().astype(int)

                    mapped_name, mapped_severity, mapped_recommendation = map_trunk_disease(raw_name)
                    display_name = mapped_name if mapped_severity == "none" else (raw_name or mapped_name)

                    detections.append({
                        "name": display_name,
                        "confidence": conf,
                        "severity": mapped_severity,
                        "recommendation": mapped_recommendation,
                        "ai_diagnosis": None,
                        "det_type": "obb",
                        "obb": obb_points,
                        "box": None
                    })
            elif hasattr(result, 'boxes') and result.boxes is not None and len(result.boxes) > 0:
                for idx in range(len(result.boxes)):
                    cls_id = int(result.boxes.cls[idx].item())
                    raw_name = get_class_name(cls_id).strip()
                    conf = float(result.boxes.conf[idx].item()) * 100
                    box = result.boxes.xyxy[idx].cpu().numpy().astype(int)

                    mapped_name, mapped_severity, mapped_recommendation = map_trunk_disease(raw_name)
                    display_name = mapped_name if mapped_severity == "none" else (raw_name or mapped_name)

                    detections.append({
                        "name": display_name,
                        "confidence": conf,
                        "severity": mapped_severity,
                        "recommendation": mapped_recommendation,
                        "ai_diagnosis": None,
                        "det_type": "box",
                        "obb": None,
                        "box": box
                    })
            elif hasattr(result, 'probs') and result.probs is not None:
                probs = result.probs
                top1_index = probs.top1
                raw_name = get_class_name(top1_index).strip()
                conf = float(probs.top1conf.item()) * 100
                mapped_name, mapped_severity, mapped_recommendation = map_trunk_disease(raw_name)
                display_name = mapped_name if mapped_severity == "none" else (raw_name or mapped_name)

                detections.append({
                    "name": display_name,
                    "confidence": conf,
                    "severity": mapped_severity,
                    "recommendation": mapped_recommendation,
                    "ai_diagnosis": None,
                    "det_type": "classification",
                    "obb": None,
                    "box": None
                })

            # Fallback when model yields no detections
            if not detections:
                detections.append({
                    "name": "No disease detected",
                    "confidence": base_confidence if base_confidence > 0 else 0.0,
                    "severity": "none",
                    "recommendation": "Tree trunk appears healthy. Continue routine care.",
                    "ai_diagnosis": None,
                    "det_type": "none",
                    "obb": None,
                    "box": None
                })

            # Sort by confidence, then prioritize diseased entries as primary when available.
            detections.sort(key=lambda item: float(item.get("confidence", 0) or 0), reverse=True)
            primary_index = next(
                (
                    idx for idx, item in enumerate(detections)
                    if str(item.get("severity") or "").lower() != "none"
                ),
                0
            )
            if primary_index > 0:
                detections = [detections[primary_index]] + detections[:primary_index] + detections[primary_index + 1:]
            primary_detection = detections[0]

            if float(primary_detection.get("confidence", 0) or 0) <= 0 and base_confidence > 0:
                primary_detection["confidence"] = float(base_confidence)

            sys.stderr.write(
                f"[Python ML] Trunk detections: {len(detections)}. Primary: "
                f"{primary_detection['name']} ({float(primary_detection['confidence']):.1f}%)\n"
            )

            # Use the primary detection geometry for physical trunk analysis.
            bbox = None
            if primary_detection.get("det_type") == "obb" and primary_detection.get("obb") is not None:
                bbox = primary_detection["obb"]
            elif primary_detection.get("det_type") == "box" and primary_detection.get("box") is not None:
                bbox = primary_detection["box"]

            trunk_phys = analyze_trunk_physical(img, bbox)

            # Request a deeper recommendation for the primary detection.
            sys.stderr.write("[Python ML] Requesting detailed trunk analysis from Groq...\n")
            ai_insights = get_groq_analysis(
                primary_detection["name"],
                float(primary_detection.get("confidence", 0) or 0),
                0,
                trunk_phys["color"]
            )

            all_detections_healthy = all(str(det.get("severity") or "").lower() == "none" for det in detections)
            if ai_insights and text_says_healthy(ai_insights.get("diagnosis")) and all_detections_healthy:
                primary_detection["severity"] = "none"
                primary_detection["name"] = "No disease detected"
                primary_detection["recommendation"] = "Tree trunk appears healthy. Continue routine care."
            elif ai_insights:
                ai_recommendation = ai_insights.get("treatment", primary_detection.get("recommendation", ""))
                if isinstance(ai_recommendation, list):
                    ai_recommendation = "; ".join(ai_recommendation)
                elif isinstance(ai_recommendation, dict):
                    ai_recommendation = str(ai_recommendation)
                else:
                    ai_recommendation = str(ai_recommendation or "")

                if ai_recommendation.strip():
                    primary_detection["recommendation"] = ai_recommendation

            primary_ai_diagnosis = (
                ai_insights.get("diagnosis", "No detailed diagnosis available.")
                if ai_insights else None
            )

            # Normalize detections for API response.
            normalized_detections = []
            for idx, det in enumerate(detections):
                normalized_detections.append({
                    "name": str(det.get("name") or "Unknown").strip(),
                    "confidence": float(det.get("confidence") or 0),
                    "severity": str(det.get("severity") or "unknown").strip().lower(),
                    "recommendation": (
                        primary_detection.get("recommendation", "")
                        if idx == 0 else str(det.get("recommendation") or "").strip()
                    ),
                    "ai_diagnosis": primary_ai_diagnosis if idx == 0 else None
                })

            has_diseased_detection = any(
                str(det.get("severity") or "").lower() != "none"
                for det in normalized_detections
            )

            # Draw all detections (OBB/Box) with class + confidence labels.
            vis_img = img.copy()
            fallback_label_y = 28
            for det in detections:
                det_name = str(det.get("name") or "Unknown").strip()
                det_conf = float(det.get("confidence") or 0)
                det_color = severity_to_color(det.get("severity"))
                label_text = f"{det_name} ({det_conf:.1f}%)"
                label_anchor = (10, 28)

                if det.get("det_type") == "obb" and det.get("obb") is not None:
                    obb_points = np.array(det["obb"]).astype(int)
                    pts = obb_points.reshape((-1, 1, 2))
                    cv2.polylines(vis_img, [pts], True, det_color, 3)
                    min_xy = np.min(obb_points, axis=0)
                    label_anchor = (int(max(min_xy[0], 10)), int(max(min_xy[1] - 10, 24)))
                elif det.get("det_type") == "box" and det.get("box") is not None:
                    x1, y1, x2, y2 = [int(v) for v in np.array(det["box"]).flatten().tolist()]
                    cv2.rectangle(vis_img, (x1, y1), (x2, y2), det_color, 3)
                    label_anchor = (max(x1, 10), max(y1 - 10, 24))
                else:
                    # Classification/no-geometry fallback: still render a visible ML overlay.
                    img_h, img_w = vis_img.shape[:2]
                    cv2.rectangle(vis_img, (6, 6), (max(img_w - 6, 6), max(img_h - 6, 6)), det_color, 2)
                    label_anchor = (10, fallback_label_y)
                    fallback_label_y += 24

                cv2.putText(
                    vis_img,
                    label_text,
                    label_anchor,
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    det_color,
                    2
                )

            # Save processed trunk image.
            script_dir = os.path.dirname(os.path.abspath(__file__))
            temp_dir = os.path.join(script_dir, 'temp_output')
            if not os.path.exists(temp_dir):
                os.makedirs(temp_dir)

            timestamp = int(time.time())
            base_name = os.path.basename(str(image_path_for_saving or 'trunk.jpg'))
            processed_filename = f"processed_{timestamp}_{base_name}"
            if 'http' in processed_filename.lower():
                processed_filename = f"processed_{timestamp}_trunk.jpg"

            processed_image_path = os.path.join(temp_dir, processed_filename)
            cv2.imwrite(processed_image_path, vis_img)

            diseased_names = [
                d["name"] for d in normalized_detections
                if str(d.get("severity") or "").lower() != "none"
            ]
            unique_diseased_names = list(dict.fromkeys(diseased_names))
            primary_name = normalized_detections[0]["name"]
            primary_severity = normalized_detections[0]["severity"]

            return {
                "treeIdentification": {
                    "isRubberTree": True,
                    "confidence": float(normalized_detections[0]["confidence"]),
                    "detectedPart": "trunk",
                    "maturity": "mature"
                },
                "trunkAnalysis": {
                    "texture": trunk_phys["texture"],
                    "color": trunk_phys["color"],
                    "healthStatus": "diseased" if has_diseased_detection else "healthy",
                    "damages": unique_diseased_names
                },
                "leafAnalysis": None,
                "diseaseDetection": normalized_detections,
                "tappabilityAssessment": {
                    "isTappable": (not has_diseased_detection) and trunk_phys['girth'] > 45,
                    "score": 85 if not has_diseased_detection else 30,
                    "reason": (
                        "Tree is healthy."
                        if not has_diseased_detection
                        else f"Untappable due to {primary_name}."
                    )
                },
                "productivityRecommendation": {
                    "status": "optimal" if primary_severity == "none" else "critical",
                    "suggestions": [normalized_detections[0]["recommendation"]]
                },
                "processed_image_path": processed_image_path
            }

        except Exception as e:
            sys.stderr.write(f"[Python ML] Trunk model inference failed: {e}\n")
            return analyze_trunk_heuristic_wrapper(img)

    return analyze_trunk_heuristic_wrapper(img)

def analyze_trunk_heuristic_wrapper(img):
    # Wrapper to format heuristic output to match full analysis structure
    trunk_data = analyze_trunk_physical(img) # Use new physical analysis
    return {
        "treeIdentification": {"isRubberTree": True, "confidence": 100, "detectedPart": "trunk", "maturity": "mature"},
        "trunkAnalysis": {
            "texture": trunk_data["texture"],
            "color": trunk_data["color"],
            "healthStatus": "unknown",
            "damages": []
        },
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
    # Heuristic grade estimation + Groq recommendations (no static product templates)
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
    
    contamination_level = "none"
    if contamination_ratio > 0.12:
        contamination_level = "high"
    elif contamination_ratio > 0.05:
        contamination_level = "medium"
    elif contamination_ratio > 0.01:
        contamination_level = "low"

    latex_type = f"Heuristic grade {grade} latex"
    ai_insights = get_groq_latex_analysis(latex_type, 0.0, contamination_level, drc)
    ai_recommendation = build_latex_ai_recommendation(ai_insights, grade, description)

    r_val = int(avg_color[2])
    g_val = int(avg_color[1])
    b_val = int(avg_color[0])

    return {
        "colorAnalysis": {
            "primaryColor": "white",
            "hex": "#{:02x}{:02x}{:02x}".format(r_val, g_val, b_val)
        },
        "qualityClassification": {
            "grade": grade,
            "description": ai_recommendation["quality_assessment"],
            "confidence": 0
        },
        "productYieldEstimation": {
             "dryRubberContent": drc,
             "estimatedYield": 0.0,
             "productType": ai_recommendation["recommended_product"]
        },
        "productRecommendation": {
            "recommendedProduct": ai_recommendation["recommended_product"],
            "reason": ai_recommendation["processing_advice"],
            "expectedQuality": ai_recommendation["expected_quality"],
            "recommendedUses": ai_recommendation["recommended_uses"],
            "marketValueInsight": ai_recommendation["market_value_insight"],
            "preservation": ai_recommendation["preservation_tips"]
        },
        "quantityEstimation": {
            "volume": 0,
            "weight": 0,
            "confidence": 0
        },
        "contaminationDetection": {
            "hasWater": contamination_ratio > 0.1,
            "hasContamination": contamination_ratio > 0.01,
            "contaminationLevel": contamination_level,
            "contaminantTypes": ["Water"] if contamination_level == "high" else (["Debris"] if contamination_level in ["medium", "low"] else []),
            "details": ai_recommendation["contamination_handling"]
        },
        "marketAnalysis": ai_recommendation["market_analysis"],
        "aiInsights": {
            "promptRecommendations": ai_recommendation.get("prompt_recommendations") or [],
            "suggestions": ai_recommendation.get("suggestions") or []
        }
    }

if __name__ == "__main__":
    # print("DEBUG: MAIN CALLED")
    main()

