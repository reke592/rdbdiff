FROM node:20.18.0-alpine

WORKDIR /sqldiff
COPY package*.json .
RUN npm ci

COPY . .
RUN npm link .

ENTRYPOINT ["sqldiff"]
