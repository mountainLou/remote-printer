# 远程打印机管理应用

一个基于Web的远程打印机管理应用，通过CUPS服务实现文件上传和打印功能。

## 功能特性

- **用户认证**: 支持多用户登录，可在环境变量中配置多个用户名和密码
- **文件上传打印**: 支持上传PDF、TXT、DOC、DOCX、JPG、PNG等格式文件并打印
- **打印机状态查看**: 实时查看打印机在线状态和工作状态
- **打印任务管理**: 查看当前打印队列，支持取消任务
- **打印历史记录**: 查看历史打印记录
- **响应式设计**: 适配桌面和移动设备
- **安全性**: JWT认证、文件类型验证、大小限制、请求限流、登录限流

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript
- **认证**: JWT (JSON Web Token)
- **打印服务**: CUPS
- **部署**: Docker

## 项目结构

```
remote-printer/
├── public/                # 前端静态文件
│   ├── index.html        # 主页面
│   ├── login.html        # 登录页面
│   ├── css/
│   │   ├── style.css     # 主页面样式
│   │   └── login.css    # 登录页面样式
│   └── js/
│       ├── app.js        # 主页面逻辑
│       └── login.js     # 登录页面逻辑
├── uploads/               # 文件上传目录
├── data/                  # 数据存储目录
│   └── history.json       # 打印历史记录
├── server.js              # 后端服务器
├── package.json           # Node.js依赖
├── Dockerfile            # Docker镜像构建文件
├── docker-compose.yml    # Docker Compose配置
├── .env.example          # 环境变量示例
└── README.md             # 项目文档
```

## 快速开始

### 前置要求

- Node.js 18 或更高版本
- 已配置的CUPS打印服务
- Docker (可选，用于容器化部署)

### 本地开发

1. **克隆项目**

```bash
cd "Remote printer"
```

2. **安装依赖**

```bash
npm install
```

3. **配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置服务和用户信息：

```env
# 服务器端口
PORT=3000

# CUPS服务配置
CUPS_BASE_URL=http://localhost:631
CUPS_USERNAME=your_cups_username
CUPS_PASSWORD=your_cups_password

# 默认打印机名称
DEFAULT_PRINTER=Cannon_Printer

# JWT密钥 (请修改为随机字符串)
JWT_SECRET=your-secret-key-change-in-production

# 用户配置
# 格式: "username1:password1,username2:password2,..."
USERS=admin:admin123,user1:password123
```

**用户配置说明**:
- 可以配置多个用户，用逗号分隔
- 格式为 `用户名:密码`
- 示例: `USERS=admin:admin123,alice:alice123,bob:bob123`

4. **启动服务**

```bash
npm start
```

5. **访问应用**

打开浏览器访问: `http://localhost:3000`

首次访问会跳转到登录页面，使用配置的用户名和密码登录。

### Docker部署

1. **配置环境变量**

编辑 `docker-compose.yml` 中的环境变量。

2. **使用Docker Compose启动**

```bash
docker-compose up -d
```

3. **访问应用**

打开浏览器访问: `http://localhost:3000`

## 用户认证

### 登录机制

- 使用JWT (JSON Web Token) 进行用户认证
- Token默认有效期为24小时
- Token存储在浏览器的localStorage中
- 所有API请求都需要携带有效的token

### 登录限流

- 15分钟内最多允许5次登录尝试
- 防止暴力破解攻击

### 配置多个用户

在 `.env` 文件中配置：

```env
# 单个用户
USERS=admin:admin123

# 多个用户（用逗号分隔）
USERS=admin:admin123,alice:alice123,bob:bob123
```

### 登出

点击页面右上角的"登出"按钮即可退出登录。

## 配置CUPS集成

应用需要连接到NAS上的CUPS服务才能正常工作。在 `server.js` 中的CUPS API部分需要根据你的实际CUPS API进行调整。

主要需要修改的部分：

1. `getPrinters()` - 获取打印机列表
2. `getPrinterStatus()` - 获取打印机状态
3. `getJobs()` - 获取打印任务
4. `/api/print` 路由 - 实际的打印调用

### CUPS API示例

CUPS提供了多种API接口，常见的有：

- REST API: `http://cups:631/api/v1/printers`
- IPP协议: 通过IPP协议与CUPS通信
- CLI命令: 通过lp, lpstat等命令

根据你的CUPS配置选择合适的集成方式。

## 安全性说明

- **JWT认证**: 使用JWT token进行用户身份验证
- **用户配置**: 在环境变量中安全配置用户名和密码
- **文件类型验证**: 只允许上传指定类型的文件
- **文件大小限制**: 默认最大50MB
- **请求限流**: 防止API滥用 (100次/15分钟)
- **登录限流**: 防止暴力破解 (5次/15分钟)
- **安全头部**: 使用Helmet设置安全相关的HTTP头部

## 开发说明

### 添加新的文件类型支持

在 `server.js` 中修改以下配置：

```javascript
const ALLOWED_MIME_TYPES = [
    // 添加新的MIME类型
];

const ALLOWED_EXTENSIONS = [
    // 添加新的文件扩展名
];
```

### 自定义样式

修改 `public/css/style.css` 中的CSS变量来自定义主题：

```css
:root {
    --primary-color: #4a90e2;
    --secondary-color: #6c757d;
    /* ... */
}
```

## API端点

### 认证相关

- `POST /api/login` - 用户登录
- `POST /api/logout` - 用户登出
- `GET /api/verify` - 验证token有效性

### 打印机相关 (需要认证)

- `GET /api/printers` - 获取打印机列表
- `GET /api/status` - 获取打印机状态
- `GET /api/jobs` - 获取当前打印任务
- `POST /api/jobs/:jobId/cancel` - 取消打印任务
- `GET /api/history` - 获取打印历史记录
- `POST /api/print` - 上传并打印文件

## 常见问题

### 1. 无法连接到CUPS服务

检查 `.env` 文件中的 `CUPS_BASE_URL` 是否正确配置。

### 2. 打印任务没有成功

- 确保CUPS服务正常运行
- 检查打印机是否在线
- 查看CUPS日志排查问题

### 3. 上传文件失败

- 检查文件大小是否超过50MB
- 确认文件类型是否支持
- 查看浏览器控制台错误信息

### 4. 登录后自动退出

- 检查token是否过期（默认24小时）
- 查看浏览器控制台是否有错误信息
- 确认 `JWT_SECRET` 配置正确

### 5. 登录失败

- 确认用户名和密码配置正确
- 检查登录尝试次数是否超限（5次/15分钟）
- 查看服务器日志获取详细错误信息

## 许可证

MIT License
