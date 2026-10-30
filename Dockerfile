# build stage
FROM node:lts-alpine AS build-stage
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install -g @angular/cli@21
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm build

# production stage
FROM nginx:stable-alpine AS production-stage
COPY --from=build-stage /app/www/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]