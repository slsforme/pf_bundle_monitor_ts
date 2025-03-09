FROM node:23

WORKDIR /usr/pf-bundle-monitor

COPY package.json ./

RUN npm i

COPY . .

RUN npm i -g ts-node

EXPOSE 6379 3000

CMD ["npm", "run", "start"]