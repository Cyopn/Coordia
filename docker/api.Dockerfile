FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
CMD ["pnpm", "--filter", "@coordia/api", "dev"]
