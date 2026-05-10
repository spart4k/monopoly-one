FROM node:20-alpine

WORKDIR /app

# Устанавливаем pnpm глобально
RUN npm install -g pnpm@latest

# Копируем только манифесты для кэширования слоя зависимостей
COPY package.json ./

# Устанавливаем зависимости (это попадёт в именованный том при запуске)
RUN pnpm install --frozen-lockfile || pnpm install

# Копируем остальной код (будет перекрыто маунтом, но нужно для сборки)
COPY . .

EXPOSE 3000

# Запускаем в dev-режиме
CMD ["pnpm", "dev"]