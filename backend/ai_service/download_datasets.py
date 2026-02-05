import os
from roboflow import Roboflow

def download_roboflow_dataset():
    print("="*50)
    print("DOWNLOAD ROBOFLOW DATASET")
    print("="*50)
    print("To download the dataset, you need a free Roboflow API Key.")
    print("1. Go to https://app.roboflow.com/settings/api")
    print("2. Copy your Private API Key")
    print("3. Paste it below")
    print("-" * 50)
    
    api_key = input("Enter your Roboflow API Key: ").strip()
    
    if not api_key:
        print("Error: API Key is required.")
        return

    try:
        rf = Roboflow(api_key=api_key)
        # Project: rubber-tree-r2r31
        # Workspace: udon-thani-rajabhat-university-vooqf
        project = rf.workspace("udon-thani-rajabhat-university-vooqf").project("rubber-tree-r2r31")
        
        print("\nDownloading dataset...")
        # Download YOLOv11 format (or YOLOv8 which is compatible)
        dataset = project.version(1).download("yolov11")
        
        print("\n✅ Dataset downloaded successfully!")
        print(f"Location: {dataset.location}")
        
        # Move/Merge logic could go here, but Roboflow usually creates a folder
        # We might need to update data.yaml to point to this new folder
        
    except Exception as e:
        print(f"\n❌ Error downloading dataset: {e}")
        print("Please check your API key and try again.")

if __name__ == "__main__":
    download_roboflow_dataset()
