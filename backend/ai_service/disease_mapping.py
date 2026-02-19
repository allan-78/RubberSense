
def map_trunk_disease(disease_name):
    """
    Maps the detected trunk disease name to severity, health status, and recommendation.
    Returns: (mapped_name, severity, recommendation)
    """
    dn_lower = disease_name.lower()
    
    # Default values
    severity = "high" 
    recommendation = f"Treatment required for {disease_name}. Consult specialist."
    
    # Healthy / Normal Classes
    if "nayang-normal" in dn_lower or "rubber tree" in dn_lower: 
            disease_name = "Healthy (Nayang-Normal)" if "nayang" in dn_lower else "Healthy"
            severity = "none"
            recommendation = "Tree is healthy. Continue routine care."
    elif "rubber leaves" in dn_lower:
            disease_name = "Healthy (Leaf Detected)"
            severity = "none"
            recommendation = "Healthy tree with visible leaves. Focus on trunk for better analysis."
    elif "rubber root" in dn_lower and "disease" not in dn_lower:
            disease_name = "Healthy (Root Detected)"
            severity = "none"
            recommendation = "Root appears healthy. Ensure soil drainage is good."
            
    # Disease Classes
    elif "bark rot" in dn_lower:
            severity = "high"
            recommendation = "Bark Rot detected. Apply copper fungicide to affected bark immediately."
    elif "black line" in dn_lower:
            severity = "high"
            recommendation = "Black Line Disease detected. Scrape affected bark and apply fungicide."
    elif "brown root" in dn_lower:
            severity = "critical"
            recommendation = "Brown Root Disease detected. Isolate tree, treat roots with fungicide, or remove tree if severe."
    elif "white root" in dn_lower:
            severity = "critical"
            recommendation = "White Root Disease detected. Requires immediate root treatment and soil sterilization."
    elif "dry crust" in dn_lower:
            severity = "moderate"
            recommendation = "Dry Crust Disease detected. Remove crust and apply protective coating."
    elif "fishbone" in dn_lower:
            severity = "high"
            recommendation = "Fishbone Disease detected. Stop tapping on affected panel and treat with fungicide."
    elif "pink mold" in dn_lower:
            severity = "high"
            recommendation = "Pink Mold Disease detected. Apply fungicidal paste to the tapping panel."
    elif "powdery mildew" in dn_lower:
            severity = "moderate"
            recommendation = "Powdery Mildew detected. Apply sulfur dust or wettable sulfur."
    elif "leaf pustule" in dn_lower:
            severity = "moderate"
            recommendation = "Leaf Pustule detected. Monitor canopy health."
    
    # Generic / Fallback Classes
    elif "root" in dn_lower: # Fallback for other root issues
            severity = "critical"
            recommendation = "Root disease detected. Isolate tree and apply fungicide drench."
    elif "rot" in dn_lower or "canker" in dn_lower or "mold" in dn_lower:
            severity = "high"
            recommendation = "Apply copper-based fungicide to affected bark area."
            
    return disease_name, severity, recommendation
