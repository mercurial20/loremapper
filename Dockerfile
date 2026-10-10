# syntax=docker/dockerfile:1

# ---- build: compile the static web app -------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- serve: plain nginx, no Node.js at runtime -----------------------------
FROM nginx:1.30-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
LABEL org.opencontainers.image.title="Loremapper" \
      org.opencontainers.image.description="Local-first fantasy world map editor (static web app)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="1.0.0-beta.2"
