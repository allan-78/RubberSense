
import cv2
import sys

print("Python version:", sys.version)
print("OpenCV version:", cv2.__version__)

print("Attempting to open camera 0...")
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Error: Could not open camera 0.")
    # Try other indices
    for i in range(1, 4):
        print(f"Attempting to open camera {i}...")
        cap = cv2.VideoCapture(i)
        if cap.isOpened():
            print(f"Success! Camera {i} opened.")
            break
else:
    print("Success! Camera 0 opened.")

if cap.isOpened():
    ret, frame = cap.read()
    if ret:
        print(f"Frame captured. Shape: {frame.shape}")
        # cv2.imshow("Test Frame", frame)
        # cv2.waitKey(1000)
        # cv2.destroyAllWindows()
    else:
        print("Error: Could not read frame.")
    cap.release()
else:
    print("No camera found.")
