# server/Dockerfile
FROM node:20-alpine
WORKDIR /app

# Копируем package.json и lock, устанавливаем зависимости
COPY package.json pnpm-lock.yaml* ./
RUN npm i -g pnpm && pnpm install --prod

# Копируем исходники
COPY . .

EXPOSE 3000
# Замени на свою команду запуска, если используешь компиляцию или tsx
CMD ["pnpm", "start"] 