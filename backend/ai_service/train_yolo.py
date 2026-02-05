from ultralytics import YOLO
import os

print("Starting training script...")

def train():
    # Load a model
    model = YOLO("yolo11n.pt")  # load a pretrained model (recommended for training)

    # Train the model
    # Ensure you have created a data.yaml file in the same directory pointing to your dataset
    project_path = os.path.join(os.path.dirname(__file__), "models")
    
    results = model.train(
        data=r"c:\Users\allan\Documents\RubberSense\rubber-disease-final-datasetss-1\data.yaml",  # path to data.yaml
        epochs=1,        # number of epochs
        imgsz=640,        # training image size
        project=project_path, # save results to project/name
        name="rubber_tree_model", # save results to project/name
        exist_ok=True
    )
    
    # Export the model
    success = model.export(format="onnx")
    print("Training complete. Model saved in models/rubber_tree_model/weights/best.pt")

if __name__ == '__main__':
    train()
