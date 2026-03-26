FROM node:24.11.0-alpine

WORKDIR /app

RUN npm install -g npm@11.6.4

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
