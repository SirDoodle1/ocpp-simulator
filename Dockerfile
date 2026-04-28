FROM node:20-alpine AS client-builder
WORKDIR /client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
COPY --from=client-builder /client/dist ./client/dist
EXPOSE 3000
CMD ["node", "src/index.js"]
