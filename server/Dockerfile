# server/Dockerfile
FROM node:20-alpine

WORKDIR /app

# 🔹 1. Копируем манифесты
COPY package.json pnpm-lock.yaml* ./

# 🔹 2. Устанавливаем production-зависимости
RUN npm i -g pnpm && pnpm install --prod --frozen-lockfile

# 🔹 3. Копируем исходники
COPY src ./src
COPY tsconfig.json ./

# 🔹 4. Если компилируешь TS → раскомментируй:
# RUN pnpm build
# COPY dist ./dist

EXPOSE 3000

# 🔹 Запуск
# Если используешь tsx без компиляции:
CMD ["npx", "tsx", "src/index.ts"]
# Если компилируешь:
# CMD ["node", "dist/index.js"]