FROM python:3.10-slim

WORKDIR /app

# Install system dependencies if required (e.g., for psycopg2-binary if not using -slim or if issues arise)
# RUN apt-get update && apt-get install -y libpq-dev gcc

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY ./src ./src
COPY ./config ./config
COPY .env.template .env.template
# Ensure run_services.sh is copied if it's in the root
COPY run_services.sh .

# Set environment variables
ENV PYTHONPATH=/app

# Make the script executable
RUN chmod +x run_services.sh

CMD ["./run_services.sh"] 