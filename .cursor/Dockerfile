FROM ubuntu:22.04

# Set non-interactive mode for apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    wget \
    unzip \
    build-essential \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS version)
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs

# Install Python 3.11 and pip
RUN add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y python3.11 python3.11-pip python3.11-venv python3.11-dev \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Install PostgreSQL client tools (for TimescaleDB)
RUN apt-get update && apt-get install -y postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for container management)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Create ubuntu user and set up home directory
RUN useradd -m -s /bin/bash ubuntu \
    && usermod -aG sudo ubuntu \
    && echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Set user and working directory
USER ubuntu
WORKDIR /home/ubuntu

# Install global npm packages that might be useful
RUN npm install -g npm@latest \
    && npm install -g @prisma/cli \
    && npm install -g typescript \
    && npm install -g tsx

# Set up Python virtual environment tools
RUN python3 -m pip install --user --upgrade pip setuptools wheel virtualenv

# Set environment variables
ENV NODE_ENV=development
ENV PYTHONPATH=/home/ubuntu
ENV PATH="/home/ubuntu/.local/bin:$PATH"

# Set the shell to bash for better compatibility
SHELL ["/bin/bash", "-c"]
