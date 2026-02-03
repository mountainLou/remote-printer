const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { fromBuffer } = require('file-type');
const crypto = require('crypto');
const ipp = require('ipp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CUPS配置
const CUPS_BASE_URL = process.env.CUPS_BASE_URL || 'http://localhost:631';
const CUPS_USERNAME = process.env.CUPS_USERNAME || '';
const CUPS_PASSWORD = process.env.CUPS_PASSWORD || '';

// IPP客户端配置
function createIppClient() {
    const url = new URL(CUPS_BASE_URL);
    const options = {
        version: '2.0',
        uri: url.href
    };
    
    if (CUPS_USERNAME && CUPS_PASSWORD) {
        options.username = CUPS_USERNAME;
        options.password = CUPS_PASSWORD;
    }
    
    return ipp.Printer(url.href, options);
}

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// 解析用户配置
function parseUsers() {
    const usersConfig = process.env.USERS || 'admin:admin123';
    const users = {};

    // 格式: "username1:password1,username2:password2"
    usersConfig.split(',').forEach(userPair => {
        const [username, password] = userPair.split(':');
        if (username && password) {
            users[username.trim()] = password.trim();
        }
    });

    return users;
}

const USERS = parseUsers();

// 上传目录
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

// 确保必要的目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(HISTORY_FILE))) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
}

// 安全中间件
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// 限流中间件
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 最多100个请求
    message: { success: false, message: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// 登录限流
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5, // 最多5次登录尝试
    message: { success: false, message: '登录尝试过于频繁，请稍后再试' }
});

// 解析JSON和URL编码的请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 重定向到登录页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 允许的文件类型
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg'
];

// 允许的文件扩展名
const ALLOWED_EXTENSIONS = [
    '.pdf', '.txt', '.doc', '.docx', '.jpg', '.jpeg', '.png'
];

// 文件大小限制 (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: async (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();

        // 检查文件扩展名
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(new Error('不支持的文件类型'), false);
        }

        cb(null, true);
    }
});

// JWT生成和验证
function generateToken(username) {
    const payload = {
        username: username,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24小时过期
    };

    // 简单的base64编码实现（生产环境建议使用jsonwebtoken库）
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }

        const [encodedHeader, encodedPayload, signature] = parts;

        // 验证签名
        const expectedSignature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64');

        if (signature !== expectedSignature) {
            return null;
        }

        // 解析payload
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString());

        // 检查过期时间
        if (payload.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }

        return payload;
    } catch (error) {
        console.error('Token验证失败:', error);
        return null;
    }
}

// 认证中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未登录或登录已过期'
        });
    }

    const payload = verifyToken(token);

    if (!payload) {
        return res.status(403).json({
            success: false,
            message: '登录已过期，请重新登录'
        });
    }

    req.user = payload;
    next();
}

// 认证路由（不需要token）
// 登录
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: '请输入用户名和密码'
        });
    }

    // 验证用户
    const correctPassword = USERS[username];
    if (!correctPassword || correctPassword !== password) {
        return res.status(401).json({
            success: false,
            message: '用户名或密码错误'
        });
    }

    // 生成token
    const token = generateToken(username);

    res.json({
        success: true,
        message: '登录成功',
        token: token,
        username: username
    });
});

// 登出
app.post('/api/logout', (req, res) => {
    res.json({
        success: true,
        message: '登出成功'
    });
});

// 验证token
app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        username: req.user.username
    });
});

// 受保护的API路由（需要认证）
// 获取打印机列表
app.get('/api/printers', authenticateToken, async (req, res) => {
    const result = await getPrinters();
    res.json(result);
});

// 获取打印机状态
app.get('/api/status', authenticateToken, async (req, res) => {
    const result = await getPrinterStatus();
    res.json(result);
});

// 获取当前打印任务
app.get('/api/jobs', authenticateToken, async (req, res) => {
    const result = await getJobs();
    res.json(result);
});

// 取消打印任务
app.post('/api/jobs/:jobId/cancel', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;

        const url = new URL(CUPS_BASE_URL);
        const options = {
            version: '2.0',
            uri: url.href
        };
        
        if (CUPS_USERNAME && CUPS_PASSWORD) {
            options.username = CUPS_USERNAME;
            options.password = CUPS_PASSWORD;
        }
        
        const printer = new ipp.Printer(url.href, options);
        
        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': CUPS_USERNAME || 'anonymous',
                'job-id': parseInt(jobId)
            }
        };
        
        printer.execute('Cancel-Job', msg, (err, response) => {
            if (err) {
                console.error('取消任务失败:', err);
                return res.json({
                    success: false,
                    message: '取消任务失败',
                    error: err.message
                });
            }
            
            res.json({
                success: true,
                message: '任务已取消'
            });
        });
    } catch (error) {
        console.error('取消任务异常:', error);
        res.json({
            success: false,
            message: '取消任务失败',
            error: error.message
        });
    }
});

// 获取打印历史
app.get('/api/history', authenticateToken, (req, res) => {
    const history = readHistory();
    res.json({
        success: true,
        history: history.slice(0, 50) // 最多返回50条记录
    });
});

// 上传并打印文件
app.post('/api/print', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({
                success: false,
                message: '请上传文件'
            });
        }

        const { printer, copies } = req.body;

        if (!printer) {
            return res.json({
                success: false,
                message: '请选择打印机'
            });
        }

        // 验证文件类型
        const fileType = await fromBuffer(fs.readFileSync(req.file.path));
        if (fileType && !ALLOWED_MIME_TYPES.includes(fileType.mime)) {
            fs.unlinkSync(req.file.path);
            return res.json({
                success: false,
                message: '不支持的文件类型'
            });
        }

        // 读取文件内容
        const fileContent = fs.readFileSync(req.file.path);
        
        // 创建IPP打印请求
        const url = new URL(CUPS_BASE_URL);
        const options = {
            version: '2.0',
            uri: url.href
        };
        
        if (CUPS_USERNAME && CUPS_PASSWORD) {
            options.username = CUPS_USERNAME;
            options.password = CUPS_PASSWORD;
        }
        
        const printerClient = new ipp.Printer(url.href, options);
        
        // 构建打印作业属性
        const printJob = {
            'operation-attributes-tag': {
                'requesting-user-name': req.user.username,
                'job-name': req.file.originalname,
                'document-format': fileType ? fileType.mime : 'application/octet-stream',
                'copies': copies ? parseInt(copies) : 1
            },
            data: fileContent
        };

        // 发送打印请求
        printerClient.execute('Print-Job', printJob, (err, response) => {
            // 清理上传的文件
            fs.unlinkSync(req.file.path);
            
            if (err) {
                console.error('打印失败:', err);
                return res.json({
                    success: false,
                    message: '打印失败',
                    error: err.message
                });
            }
            
            // 记录到历史
            const history = readHistory();
            const historyRecord = {
                id: response['job-id'] || Date.now(),
                filename: req.file.originalname,
                printer: printer,
                printedAt: new Date().toISOString(),
                status: 'success',
                size: formatFileSize(req.file.size)
            };

            history.unshift(historyRecord);
            saveHistory(history);

            res.json({
                success: true,
                message: '文件已添加到打印队列',
                jobId: response['job-id'] || historyRecord.id
            });
        });
    } catch (error) {
        console.error('打印失败:', error);

        // 清理上传的文件
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.json({
            success: false,
            message: '打印失败: ' + error.message
        });
    }
});

// 获取打印机列表
async function getPrinters() {
    try {
        const url = new URL(CUPS_BASE_URL);
        const options = {
            version: '2.0',
            uri: url.href
        };
        
        if (CUPS_USERNAME && CUPS_PASSWORD) {
            options.username = CUPS_USERNAME;
            options.password = CUPS_PASSWORD;
        }
        
        const printer = new ipp.Printer(url.href, options);
        
        return new Promise((resolve, reject) => {
            printer.execute('Get-Printer-Attributes', null, (err, res) => {
                if (err) {
                    console.error('获取打印机列表失败:', err);
                    resolve({ success: false, message: '获取打印机列表失败', error: err.message });
                    return;
                }
                
                // 解析IPP响应
                const printers = [];
                
                // IPP响应直接包含打印机属性
                if (res) {
                    const printerName = res['printer-name'] || res['printer-name-set'] || process.env.DEFAULT_PRINTER || 'Default Printer';
                    const printerState = res['printer-state'];
                    const stateText = printerState === 3 ? 'idle' : printerState === 4 ? 'processing' : printerState === 5 ? 'stopped' : 'unknown';
                    
                    printers.push({
                        name: printerName,
                        state: stateText,
                        isOnline: printerState !== 5,
                        jobs: 0
                    });
                }
                
                resolve({ success: true, printers });
            });
        });
    } catch (error) {
        console.error('获取打印机列表异常:', error);
        return { success: false, message: '获取打印机列表失败', error: error.message };
    }
}

// 获取打印机状态
async function getPrinterStatus() {
    try {
        const printers = await getPrinters();

        if (!printers.success) {
            return printers;
        }

        // 获取每个打印机的任务数量
        const printersWithJobs = await Promise.all(
            printers.printers.map(async (printer) => {
                try {
                    const url = new URL(CUPS_BASE_URL);
                    const options = {
                        version: '2.0',
                        uri: url.href
                    };
                    
                    if (CUPS_USERNAME && CUPS_PASSWORD) {
                        options.username = CUPS_USERNAME;
                        options.password = CUPS_PASSWORD;
                    }
                    
                    const printerClient = new ipp.Printer(url.href, options);
                    
                    return new Promise((resolve) => {
                        const msg = {
                            'operation-attributes-tag': {
                                'requesting-user-name': CUPS_USERNAME || 'anonymous',
                                'which-jobs': 'not-completed',
                                'limit': 100
                            }
                        };
                        
                        printerClient.execute('Get-Jobs', msg, (err, res) => {
                            if (err) {
                                console.error(`获取打印机${printer.name}任务数量失败:`, err);
                                printer.jobs = 0;
                                resolve(printer);
                                return;
                            }
                            
                            // 计算任务数量
                            if (res && res['job-attributes-tag']) {
                                const jobAttributes = Array.isArray(res['job-attributes-tag']) 
                                    ? res['job-attributes-tag'] 
                                    : [res['job-attributes-tag']];
                                
                                // 过滤出当前打印机的任务
                                const printerJobs = jobAttributes.filter(job => 
                                    job['printer-uri'] && job['printer-uri'].includes(printer.name)
                                );
                                printer.jobs = printerJobs.length;
                            } else {
                                printer.jobs = 0;
                            }
                            
                            resolve(printer);
                        });
                    });
                } catch (error) {
                    console.error(`获取打印机${printer.name}状态异常:`, error);
                    printer.jobs = 0;
                    return printer;
                }
            })
        );

        return {
            success: true,
            printers: printersWithJobs
        };
    } catch (error) {
        console.error('获取打印机状态异常:', error);
        return { success: false, message: '获取打印机状态失败', error: error.message };
    }
}

// 获取打印任务
async function getJobs() {
    try {
        const url = new URL(CUPS_BASE_URL);
        const options = {
            version: '2.0',
            uri: url.href
        };
        
        if (CUPS_USERNAME && CUPS_PASSWORD) {
            options.username = CUPS_USERNAME;
            options.password = CUPS_PASSWORD;
        }
        
        const printer = new ipp.Printer(url.href, options);
        
        return new Promise((resolve) => {
            const msg = {
                'operation-attributes-tag': {
                    'requesting-user-name': CUPS_USERNAME || 'anonymous',
                    'which-jobs': 'all',
                    'limit': 100
                }
            };
            
            printer.execute('Get-Jobs', msg, (err, res) => {
                if (err) {
                    console.error('获取打印任务失败:', err);
                    resolve({ success: false, message: '获取打印任务失败', error: err.message });
                    return;
                }
                
                // 解析IPP响应
                const jobs = [];
                
                if (res && res['job-attributes-tag']) {
                    const jobAttributes = Array.isArray(res['job-attributes-tag']) 
                        ? res['job-attributes-tag'] 
                        : [res['job-attributes-tag']];
                    
                    jobAttributes.forEach(job => {
                        if (job && job['job-id']) {
                            jobs.push({
                                id: job['job-id'],
                                printer: job['printer-uri'] ? job['printer-uri'].split('/').pop() : 'Unknown Printer',
                                status: job['job-state'] === 3 ? 'pending' : job['job-state'] === 4 ? 'processing' : job['job-state'] === 5 ? 'completed' : 'stopped',
                                submittedAt: job['job-creation-time'] ? new Date(job['job-creation-time'] * 1000).toISOString() : new Date().toISOString(),
                                userName: job['job-originating-user-name'] || 'Unknown User'
                            });
                        }
                    });
                }
                
                resolve({ success: true, jobs });
            });
        });
    } catch (error) {
        console.error('获取打印任务异常:', error);
        return { success: false, message: '获取打印任务失败', error: error.message };
    }
}

// 读取历史记录
function readHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('读取历史记录失败:', error);
        return [];
    }
}

// 保存历史记录
function saveHistory(history) {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('保存历史记录失败:', error);
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);

    // Multer错误
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.json({
            success: false,
            message: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)`
        });
    }

    res.json({
        success: false,
        message: err.message || '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`远程打印机服务已启动: http://localhost:${PORT}`);
    console.log(`CUPS服务地址: ${CUPS_BASE_URL}`);
    console.log(`已配置用户: ${Object.keys(USERS).join(', ')}`);
});

module.exports = app;
