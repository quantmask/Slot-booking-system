FROM node:22-alpine AS builder

WORKDIR /app

# Copy package definitions
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install root dependencies
RUN npm ci

# Copy full repository
COPY . .

# Build frontend and backend
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm ci --omit=dev

# Copy compiled backend, migrations, seeds and frontend dist
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3000

CMD ["npm", "start"]
