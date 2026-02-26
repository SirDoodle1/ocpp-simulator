FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=development

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]
