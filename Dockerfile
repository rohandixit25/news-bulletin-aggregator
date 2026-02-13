# Use Python slim image
FROM python:3.11-slim

# Install system dependencies (ffmpeg for audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create output directory for generated bulletins
RUN mkdir -p output

# Expose port
EXPOSE 5000

# Set environment variables
ENV FLASK_APP=app.py
ENV PYTHONUNBUFFERED=1

# Run with gunicorn for production
# --timeout 300 allows long-running bulletin generation
# --threads 4 supports background generation + serving
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "300", "--threads", "4", "app:app"]
