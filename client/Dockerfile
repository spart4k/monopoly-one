FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm@latest

COPY package.json ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

EXPOSE 5173

# CHOKIDAR_USEPOLLING важен для hot-reload на Windows + Docker
CMD ["sh", "-c", "pnpm dev --host 0.0.0.0"]