FROM node:20-alpine

WORKDIR /app

# Устанавливаем pnpm глобально
RUN npm install -g pnpm

# Копируем манифесты ПЕРЕД кодом для кэширования слоя install
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости ВНУТРИ образа
RUN pnpm install --frozen-lockfile

# Копируем исходный код
COPY . .

EXPOSE 3000 9229
ENV NODE_OPTIONS="--inspect=0.0.0.0:9229"

CMD ["pnpm", "dev"]