FROM python:3.12-alpine

RUN apk add --no-cache \
    bash \
    build-base \
    libffi-dev \
    openssl-dev \
    nodejs \
    npm

WORKDIR /app

COPY backend/ ./backend/

COPY frontend/ ./frontend/

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r backend/requirements.txt

WORKDIR /app/frontend
RUN npm install --no-save

RUN npm run build

WORKDIR /app

# Expose ports (frontend preview and backend)
EXPOSE 8000
EXPOSE 4173

# Environment variables
ENV GOOGLE_CLIENT_SECRET=""
ENV GOOGLE_CLIENT_ID=""
ENV GROQ_API_KEY=""
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=""

# Start both servers
CMD ["bash", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 & npm run preview --prefix frontend -- --host 0.0.0.0 --port 4173 && wait"]
