# FoodHeaven backend — production-style container image.
#
# What this file does:
# - Builds a minimal Node.js 20 image with only production npm dependencies
# - Copies the Express API source and starts it on port 5000
#
# Typical usage (with MySQL via docker-compose):
#   cd backend
#   docker compose up --build
#
# Standalone build/run (you must provide DB env vars yourself):
#   docker build -t foodheaven-backend .
#   docker run -p 5000:5000 --env-file .env foodheaven-backend
#
# See also: docker-compose.yml (MySQL + backend together), .dockerignore

# Base image: Node 20 on Alpine Linux (small footprint)
FROM node:20-alpine

# All subsequent commands run from /app inside the container
WORKDIR /app

# Copy dependency manifests first — Docker layer cache: npm install only
# re-runs when package.json or package-lock.json changes, not on every code edit
COPY package*.json ./

# Install exact versions from lockfile; omit devDependencies (jest, supertest)
RUN npm ci --omit=dev

# Copy application source (src/, db/, scripts/, etc.) — excluded paths in .dockerignore
COPY . .

# Document the port the Express server listens on (see server.js PORT default 5000)
EXPOSE 5000

# Start the API: `npm start` → `node src/server.js`
CMD ["npm", "start"]
