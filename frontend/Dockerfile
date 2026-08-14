FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY index.html ./
COPY tsconfig.json vite.config.mjs ./
COPY src ./src
RUN npm run build

FROM build AS test
COPY test ./test
RUN npm test

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
