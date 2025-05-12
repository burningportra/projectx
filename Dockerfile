FROM python:3.9-slim

WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Update requirements.txt with FastAPI dependencies 
RUN echo "fastapi==0.115.12" >> requirements.txt
RUN echo "uvicorn==0.34.2" >> requirements.txt

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY ./src ./src

# Set environment variables
ENV PYTHONPATH=/app
ENV MODULE_NAME=src.api.server
ENV VARIABLE_NAME=app
ENV PORT=8000

# Expose port
EXPOSE 8000

# Command to run the API server
CMD ["uvicorn", "src.api.server:app", "--host", "0.0.0.0", "--port", "8000"] 