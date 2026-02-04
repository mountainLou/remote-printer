# Docker 部署指南

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd remote-printer
```

### 2. 配置环境变量

编辑 `docker-compose.yml` 文件，根据你的实际配置修改以下环境变量：

```yaml
environment:
  - CUPS_BASE_URL=http://192.168.1.113:3631  # 你的CUPS服务地址
  - CUPS_USERNAME=admin                        # CUPS用户名
  - CUPS_PASSWORD=admin                        # CUPS密码
  - DEFAULT_PRINTER=7100cn                     # 默认打印机名称
  - JWT_SECRET=your-secret-key-change-in-production  # JWT密钥（生产环境请修改）
  - MAX_FILE_SIZE=10485760                     # 最大文件大小（字节）
```

### 3. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 或者只启动远程打印机服务（如果已有CUPS服务）
docker-compose up -d remote-printer
```

### 4. 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f remote-printer
docker-compose logs -f cups
```

## 服务说明

### remote-printer

远程打印机Web服务，提供以下功能：

- 用户认证
- 文件上传和打印
- 查看当前打印任务
- 查看打印历史记录
- 取消打印任务

**端口**: 3000

**访问地址**: http://localhost:3000

**默认账号**:
- 用户名: admin
- 密码: admin123

### cups

CUPS打印服务（可选），如果已有CUPS服务可以不启动。

**端口**: 631

**访问地址**: http://localhost:631

**默认账号**:
- 用户名: admin
- 密码: admin

## 数据持久化

以下目录通过Docker volume挂载，数据会持久化到宿主机：

- `./uploads` - 上传的文件
- `./data` - 打印历史记录
- `cups-config` - CUPS配置
- `cups-logs` - CUPS日志
- `cups-spool` - CUPS打印队列

## 健康检查

两个服务都配置了健康检查：

- **remote-printer**: 每30秒检查一次 http://localhost:3000/health
- **cups**: 每30秒检查一次 http://localhost:631/

## 资源限制

服务配置了资源限制以防止资源耗尽：

- **remote-printer**: 最大1核CPU，512MB内存
- **cups**: 最大0.5核CPU，256MB内存

可以根据需要调整 `docker-compose.yml` 中的 `deploy.resources` 配置。

## 网络配置

服务运行在自定义桥接网络 `printer-network` 中，子网为 `172.28.0.0/16`。

如果需要访问宿主机上的打印机，可以取消注释 `cups` 服务的 `network_mode: host` 配置。

## 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除volumes
docker-compose down -v
```

## 重新构建

```bash
# 重新构建并启动
docker-compose up -d --build

# 强制重新构建（不使用缓存）
docker-compose up -d --build --no-cache
```

## 故障排查

### 服务无法启动

查看日志：
```bash
docker-compose logs remote-printer
```

### 无法访问CUPS

检查网络配置：
```bash
docker network inspect printer-network
```

确保 `remote-printer` 服务可以访问 `CUPS_BASE_URL` 指定的地址。

### 文件上传失败

检查：
1. 文件大小是否超过 `MAX_FILE_SIZE` 限制
2. `uploads` 目录是否有写权限
3. 磁盘空间是否充足

### 打印任务不显示

检查：
1. CUPS服务是否正常运行
2. CUPS认证信息是否正确
3. 打印机名称是否正确

## 生产环境建议

1. **修改JWT密钥**: 修改 `JWT_SECRET` 为强密码
2. **使用HTTPS**: 在反向代理（如Nginx）后面部署，配置SSL证书
3. **配置防火墙**: 只开放必要的端口（3000）
4. **定期备份**: 定期备份 `data` 和 `uploads` 目录
5. **监控日志**: 使用日志收集工具（如ELK、Loki等）收集和分析日志
6. **更新镜像**: 定期更新基础镜像和依赖包

## 许可证

MIT License
