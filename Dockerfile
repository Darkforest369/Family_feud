FROM node:20-alpine
WORKDIR /app
ARG PORT=3000
ENV PORT=${PORT}
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
EXPOSE ${PORT}
CMD ["npm", "start"]
