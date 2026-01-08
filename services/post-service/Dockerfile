FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./tsconfig.json
COPY src ./src

EXPOSE 3005

CMD ["npm", "run", "dev"]


