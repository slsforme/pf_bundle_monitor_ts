FROM node:alpine

WORKDIR /usr/pf-bundle-monitor

COPY package.json ./

RUN npm i

COPY . .

RUN npm i -g ts-node

CMD ["npx", "ts-node", "./index.ts"]

