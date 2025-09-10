FROM node:18-alpine
RUN apk add --no-cache \
    bash \
    curl \
    python3 \
    docker \
    vim

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p /data/uploads /data/outputs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["node", "app.js"]