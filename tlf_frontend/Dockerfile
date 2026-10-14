# ============================================================
# Stage 1: Build (Vite + React + Antd)
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ============================================================
# Stage 2: Nginx static
# ============================================================
FROM nginx:1.27-alpine AS runtime
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/tlf_frontend.conf
COPY --from=builder /build/dist /usr/share/nginx/html
EXPOSE 8040
CMD ["nginx", "-g", "daemon off;"]
