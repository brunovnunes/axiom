FROM node:20-slim AS builder

# Instalar pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copiar arquivos de dependência
COPY package.json pnpm-lock.yaml ./

# Instalar dependências
RUN pnpm install --frozen-lockfile

# Copiar o resto do código
COPY . .

# Build do projeto (se houver script "build")
RUN pnpm run build

# Imagem final (opcional, multi-stage)
FROM node:20-slim

WORKDIR /app

# Instalar pnpm na imagem final (se precisar rodar comandos)
RUN npm install -g pnpm

# Copiar o build e as dependências
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/api/server.js", "--orchestrator"]
