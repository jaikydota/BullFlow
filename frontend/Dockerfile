# ============================================================
# Stage 1: Build — install deps + compile production bundle
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# COPY . . 会把 frontend/.env 一起带进 builder（dockerignore 已放行）；
# vite build 自动读取 frontend/.env 里的 VITE_* 并 build-time 静态替换到 bundle
COPY . .
RUN npx vite build

# ============================================================
# Stage 2: Runtime — serve static files with Nginx
# ============================================================
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 8020

CMD ["nginx", "-g", "daemon off;"]
