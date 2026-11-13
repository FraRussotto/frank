FROM node:22-alpine

WORKDIR /app

# Installa dipendenze di sistema utili
RUN apk add --no-cache curl tzdata sqlite bash

# Copia i file dei pacchetti
COPY package*.json ./

# Installa le dipendenze
RUN npm ci

# Copia l'intero sorgente
COPY . .

# Crea le cartelle persistenti necessarie
RUN mkdir -p database uploads/documents config

# Compila il frontend per verifica tipi e build asset
RUN npm run build

# Espone la porta di Frank
EXPOSE 5173

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5173

# Avvia Frank esponendolo su tutte le interfacce per Docker/Coolify
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]

