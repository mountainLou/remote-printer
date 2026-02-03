FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json并安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p uploads data

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "server.js"]
