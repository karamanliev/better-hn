FROM node:24.15.0-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY . .

RUN pnpm build

FROM node:24.15.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=build /app/.output ./.output

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -q --tries=1 -O /dev/null http://127.0.0.1:3000/ || exit 1

CMD ["node", ".output/server/index.mjs"]
