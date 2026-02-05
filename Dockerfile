FROM node:18-alpine

# 安装必要的系统依赖
RUN apk add --no-cache curl libreoffice ttf-dejavu

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 复制应用代码
COPY . .

# 创建必要的目录并设置权限
RUN mkdir -p uploads data && \
    chown -R node:node /app

# 切换到非root用户
USER node

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 启动应用
CMD ["node", "server.js"]
