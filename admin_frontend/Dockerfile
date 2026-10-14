# ============================================================
# Stage 1: Build — Vite 静态构建 → dist/
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .
# vite build 输出到 dist/
RUN npm run build

# ============================================================
# Stage 2: Runtime — Nginx 托管静态文件 + 反代 /api/v1/admin/ → backend
# ============================================================
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 8030

CMD ["nginx", "-g", "daemon off;"]
