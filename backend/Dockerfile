FROM python:3.10-slim

# Install Node.js
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs libgl1 libglib2.0-0 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies (CPU-only Torch to save space/RAM)
COPY ai_service/requirements.txt ./ai_service/
# Add requests to requirements since it is used in main.py but missing in requirements.txt
RUN echo "requests" >> ./ai_service/requirements.txt
# Install CPU-only torch first
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
# Then install other requirements (ultralytics will see torch is installed)
RUN pip install --no-cache-dir -r ai_service/requirements.txt

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
