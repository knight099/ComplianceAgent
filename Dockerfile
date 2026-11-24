FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
CMD ["node","node_modules/next/dist/bin/next","start","-H","0.0.0.0"]
