
from PIL import Image
import os

def create_dummy_image():
    # Create a simple red image
    img = Image.new('RGB', (100, 100), color = 'red')
    path = os.path.join(os.path.dirname(__file__), 'dummy.jpg')
    img.save(path)
    print(f"Created dummy image at {path}")

if __name__ == "__main__":
    create_dummy_image()
