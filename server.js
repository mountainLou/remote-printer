const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { fileTypeFromBuffer } = require('file-type');
const crypto = require('crypto');
const ipp = require('ipp');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CUPS配置
const CUPS_BASE_URL = process.env.CUPS_BASE_URL || 'http://192.168.1.113:3631';
const CUPS_USERNAME = process.env.CUPS_USERNAME || '';
const CUPS_PASSWORD = process.env.CUPS_PASSWORD || '';

// 日志函数
function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    console.log(logEntry);
    if (data) {
        console.log(JSON.stringify(data, null, 2));
    }
}

// IPP客户端配置
function createIppClient(printerName = '') {
    const url = new URL(CUPS_BASE_URL);
    let printerUrl = url.origin;

    // 如果指定了打印机名称，构建完整的打印机URL
    if (printerName) {
        printerUrl = `${url.origin}/printers/${encodeURIComponent(printerName)}`;
    } else {
        printerUrl = url.origin;
    }

    const options = {
        version: '2.0',
        uri: printerUrl,
        host: url.hostname,
        port: url.port || 3631,
        protocol: url.protocol.replace(':', '')
    };

    if (CUPS_USERNAME && CUPS_PASSWORD) {
        options.username = CUPS_USERNAME;
        options.password = CUPS_PASSWORD;
    }

    log('DEBUG', '创建IPP客户端', { printerUrl, hasAuth: !!(CUPS_USERNAME && CUPS_PASSWORD) });

    return new ipp.Printer(printerUrl, options);
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

    log('INFO', `用户登录成功: ${username}`);

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
    log('INFO', '请求获取打印机列表', { username: req.user.username });
    const result = await getPrinters();
    res.json(result);
});

// 获取打印机状态
app.get('/api/status', authenticateToken, async (req, res) => {
    log('INFO', '请求获取打印机状态', { username: req.user.username });
    const result = await getPrinterStatus();
    res.json(result);
});

// 获取当前打印任务
app.get('/api/jobs', authenticateToken, async (req, res) => {
    log('INFO', '请求获取打印任务', { username: req.user.username });
    const result = await getJobs();
    res.json(result);
});

// 取消打印任务
app.post('/api/jobs/:jobId/cancel', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { printer } = req.body;

        log('INFO', '请求取消打印任务', { jobId, printer, username: req.user.username });

        if (!printer) {
            return res.status(400).json({
                success: false,
                message: '请指定打印机名称'
            });
        }

        const printerClient = createIppClient(printer);

        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': req.user.username,
                'job-id': parseInt(jobId)
            }
        };

        printerClient.execute('Cancel-Job', msg, (err, response) => {
            if (err) {
                log('ERROR', '取消任务失败', { error: err.message, jobId });
                return res.json({
                    success: false,
                    message: '取消任务失败',
                    error: err.message
                });
            }

            log('INFO', '取消任务成功', { jobId });
            res.json({
                success: true,
                message: '任务已取消'
            });
        });
    } catch (error) {
        log('ERROR', '取消任务异常', { error: error.message });
        res.status(500).json({
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
            fs.unlinkSync(req.file.path);
            return res.json({
                success: false,
                message: '请选择打印机'
            });
        }

        log('INFO', '收到打印请求', {
            filename: req.file.originalname,
            printer,
            copies: copies || 1,
            username: req.user.username
        });

        // 验证文件类型
        const fileType = await fileTypeFromBuffer(fs.readFileSync(req.file.path));
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
        const printerUrl = `${CUPS_BASE_URL}/printers/${encodeURIComponent(printer)}`;
        const printerClient = createIppClient(printer);

        // 确定文档格式
        let documentFormat = 'application/octet-stream';
        if (fileType) {
            // 检查打印机是否支持该格式
            const supportedFormats = [
                'application/pdf',
                'application/postscript',
                'image/jpeg',
                'image/png',
                'image/tiff',
                'text/plain',
                'text/html'
            ];
            
            if (supportedFormats.includes(fileType.mime)) {
                documentFormat = fileType.mime;
            } else {
                // 对于不支持的格式，使用 application/octet-stream
                // 打印机可能会尝试处理它
                documentFormat = 'application/octet-stream';
                log('WARN', '文件格式不支持，使用 application/octet-stream', { 
                    originalFormat: fileType.mime,
                    printer 
                });
            }
        }

        // 构建打印作业属性
        const printJob = {
            'operation-attributes-tag': {
                'requesting-user-name': req.user.username,
                'job-name': req.file.originalname,
                'document-format': documentFormat
            },
            'job-attributes-tag': {
                'copies': copies ? parseInt(copies) : 1
            },
            data: fileContent
        };

        log('DEBUG', '发送打印请求', { 
            printerUrl: printerUrl,
            fileSize: req.file.size,
            fileType: fileType ? fileType.mime : 'unknown',
            printJob: {
                'operation-attributes-tag': printJob['operation-attributes-tag'],
                dataSize: fileContent.length
            }
        });

        // 发送打印请求
        const startTime = Date.now();
        let callbackCalled = false;
        
        printerClient.execute('Print-Job', printJob, (err, response) => {
            callbackCalled = true;
            
            // 清理上传的文件
            fs.unlinkSync(req.file.path);

            if (err) {
                console.log('=== 打印错误详情 ===');
                console.log('Error object:', err);
                console.log('Error type:', typeof err);
                console.log('Error keys:', Object.keys(err));
                console.log('Error message:', err.message);
                console.log('Error stack:', err.stack);
                
                log('ERROR', '打印失败', { error: err.message || err, printer, errObj: JSON.stringify(err), errStack: err.stack });
                return res.json({
                    success: false,
                    message: '打印失败',
                    error: err.message || String(err)
                });
            }

            const jobId = response['job-id'];

            log('INFO', '打印任务提交成功', { jobId, printer });

            // 检查回调是否被调用
            setTimeout(() => {
                if (!callbackCalled) {
                    console.log('=== 警告：回调未被调用 ===');
                    log('ERROR', '打印请求超时，回调未被调用', { printer, elapsed: Date.now() - startTime });
                }
            }, 10000); // 10秒后检查

            // 记录到历史
            const history = readHistory();
            
            // 修复文件名编码问题
            let filename = req.file.originalname;
            try {
                // 尝试修复 UTF-8 编码
                filename = Buffer.from(filename, 'latin1').toString('utf8');
            } catch (e) {
                // 如果转换失败，保持原样
            }
            
            const historyRecord = {
                id: jobId || Date.now(),
                filename: filename,
                printer: printer,
                printedAt: new Date().toISOString(),
                status: 'success',
                size: formatFileSize(req.file.size),
                user: req.user.username
            };

            history.unshift(historyRecord);
            
            // 保存历史记录时确保使用UTF-8编码
            try {
                fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
            } catch (error) {
                log('ERROR', '保存历史记录失败', { error: error.message });
            }

            res.json({
                success: true,
                message: '文件已添加到打印队列',
                jobId: jobId || historyRecord.id
            });
        });
    } catch (error) {
        log('ERROR', '打印失败', { error: error.message });

        // 清理上传的文件
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: '打印失败: ' + error.message
        });
    }
});

// 获取打印机列表
async function getPrinters() {
    try {
        log('DEBUG', '正在获取打印机列表');

        // 使用CUPS-Get-Printers操作获取所有打印机
        const printer = createIppClient();

        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': CUPS_USERNAME || 'anonymous',
                'requested-attributes': [
                    'printer-name',
                    'printer-state',
                    'printer-state-message',
                    'printer-is-accepting-jobs',
                    'printer-location',
                    'printer-make-and-model',
                    'printer-uri-supported',
                    'printer-info',
                    'queued-job-count'
                ]
            }
        };

        return new Promise((resolve) => {
            printer.execute('CUPS-Get-Printers', msg, (err, res) => {
                if (err) {
                    log('ERROR', '获取打印机列表失败', { error: err.message });
                    // 尝试备用方法
                    return getPrintersFallback().then(resolve);
                }

                // 检查是否返回了错误
                if (res && res.statusCode && res.statusCode.startsWith('server-error-')) {
                    log('WARN', 'CUPS-Get-Printers不支持，尝试备用方法');
                    return getPrintersFallback().then(resolve);
                }

                // 解析IPP响应
                const printers = [];

                if (res && res['printer-attributes-tag']) {
                    const printerAttributes = Array.isArray(res['printer-attributes-tag'])
                        ? res['printer-attributes-tag']
                        : [res['printer-attributes-tag']];

                    printerAttributes.forEach(attr => {
                        // 提取printer-attributes-tag中的属性到根对象
                        let printerData = attr;
                        if (attr['printer-attributes-tag']) {
                            printerData = {
                                ...attr,
                                ...attr['printer-attributes-tag']
                            };
                        }

                        if (printerData['printer-name']) {
                            const printerState = printerData['printer-state'];
                            const stateText = printerState === 3 ? 'idle' :
                                            printerState === 4 ? 'processing' :
                                            printerState === 5 ? 'stopped' :
                                            printerState === 'idle' ? 'idle' :
                                            printerState === 'processing' ? 'processing' :
                                            printerState === 'stopped' ? 'stopped' : 'unknown';

                            printers.push({
                                name: printerData['printer-name'],
                                state: stateText,
                                isOnline: printerState !== 5 && printerState !== 'stopped',
                                isAcceptingJobs: !!printerData['printer-is-accepting-jobs'],
                                location: printerData['printer-location'] || '',
                                model: printerData['printer-make-and-model'] || '',
                                info: printerData['printer-info'] || '',
                                jobs: printerData['queued-job-count'] || 0
                            });
                        }
                    });
                }

                log('INFO', `找到 ${printers.length} 个打印机`);

                resolve({ success: true, printers });
            });
        });
    } catch (error) {
        log('ERROR', '获取打印机列表异常', { error: error.message });
        return getPrintersFallback();
    }
}

// 备用方法：直接获取单个打印机属性
async function getPrintersFallback() {
    try {
        log('DEBUG', '使用备用方法获取打印机列表');

        const printer = createIppClient();

        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': CUPS_USERNAME || 'anonymous',
                'requested-attributes': [
                    'printer-name',
                    'printer-state',
                    'printer-state-message',
                    'printer-is-accepting-jobs',
                    'printer-location',
                    'printer-make-and-model',
                    'printer-uri-supported',
                    'printer-info',
                    'queued-job-count'
                ]
            }
        };

        return new Promise((resolve) => {
            printer.execute('Get-Printer-Attributes', msg, (err, res) => {
                if (err) {
                    log('ERROR', '备用方法也失败', { error: err.message });
                    // 尝试常见的打印机名称
                    return getPrintersByCommonNames().then(resolve);
                }

                // 检查是否返回了错误
                if (res && res.statusCode && res.statusCode.startsWith('client-error-')) {
                    log('WARN', 'Get-Printer-Attributes返回错误，尝试常见打印机名称');
                    return getPrintersByCommonNames().then(resolve);
                }

                // 解析IPP响应
                const printers = [];

                // 提取printer-attributes-tag中的属性到根对象
                let printerData = res;
                if (res && res['printer-attributes-tag']) {
                    printerData = {
                        ...res,
                        ...res['printer-attributes-tag']
                    };
                }

                if (printerData && printerData['printer-name']) {
                    const printerState = printerData['printer-state'];
                    const stateText = printerState === 3 ? 'idle' :
                                    printerState === 4 ? 'processing' :
                                    printerState === 5 ? 'stopped' :
                                    printerState === 'idle' ? 'idle' :
                                    printerState === 'processing' ? 'processing' :
                                    printerState === 'stopped' ? 'stopped' : 'unknown';

                    printers.push({
                        name: printerData['printer-name'],
                        state: stateText,
                        isOnline: printerState !== 5 && printerState !== 'stopped',
                        isAcceptingJobs: !!printerData['printer-is-accepting-jobs'],
                        location: printerData['printer-location'] || '',
                        model: printerData['printer-make-and-model'] || '',
                        info: printerData['printer-info'] || '',
                        jobs: printerData['queued-job-count'] || 0
                    });
                }

                log('INFO', `备用方法找到 ${printers.length} 个打印机`);

                if (printers.length > 0) {
                    resolve({ success: true, printers });
                } else {
                    return getPrintersByCommonNames().then(resolve);
                }
            });
        });
    } catch (error) {
        log('ERROR', '备用方法异常', { error: error.message });
        return getPrintersByCommonNames();
    }
}

// 尝试常见的打印机名称
async function getPrintersByCommonNames() {
    try {
        log('DEBUG', '尝试常见的打印机名称');
        const commonNames = ['7100cn','LBP-7100cn', 'printer'];
        const foundPrinters = [];

        for (const name of commonNames) {
            try {
                const printerClient = createIppClient(name);
                
                const msg = {
                    'operation-attributes-tag': {
                        'requesting-user-name': CUPS_USERNAME || 'anonymous',
                        'requested-attributes': [
                            'printer-name',
                            'printer-state',
                            'printer-state-message',
                            'printer-is-accepting-jobs',
                            'printer-location',
                            'printer-make-and-model',
                            'printer-uri-supported',
                            'printer-info',
                            'queued-job-count'
                        ]
                    }
                };

                const result = await new Promise((resolve) => {
                    printerClient.execute('Get-Printer-Attributes', msg, (err, res) => {
                        if (err) {
                            resolve({ error: err, response: res });
                        } else {
                            resolve({ error: null, response: res });
                        }
                    });
                });

                // 检查响应是否包含有效的打印机数据
                if (result.response && result.response.statusCode === 'successful-ok') {
                    // 提取printer-attributes-tag中的属性到根对象
                    let printerData = result.response;
                    if (result.response['printer-attributes-tag']) {
                        printerData = {
                            ...result.response,
                            ...result.response['printer-attributes-tag']
                        };
                    }

                    printerData['printer-name'] = printerData['printer-name'] || name;

                    const printerState = printerData['printer-state'];
                    const stateText = printerState === 3 ? 'idle' :
                                    printerState === 4 ? 'processing' :
                                    printerState === 5 ? 'stopped' :
                                    printerState === 'idle' ? 'idle' :
                                    printerState === 'processing' ? 'processing' :
                                    printerState === 'stopped' ? 'stopped' : 'unknown';

                    foundPrinters.push({
                        name: printerData['printer-name'],
                        state: stateText,
                        isOnline: printerState !== 5 && printerState !== 'stopped',
                        isAcceptingJobs: !!printerData['printer-is-accepting-jobs'],
                        location: printerData['printer-location'] || '',
                        model: printerData['printer-make-and-model'] || '',
                        info: printerData['printer-info'] || '',
                        jobs: printerData['queued-job-count'] || 0
                    });

                    log('INFO', `找到打印机: ${name}`);
                }
            } catch (err) {
                // 忽略错误，继续尝试下一个名称
            }
        }

        if (foundPrinters.length > 0) {
            log('INFO', `通过常见名称找到 ${foundPrinters.length} 个打印机`);
            return { success: true, printers: foundPrinters };
        } else {
            log('WARN', '未找到任何打印机');
            return {
                success: false,
                message: '未找到任何打印机',
                error: 'No printers found'
            };
        }
    } catch (error) {
        log('ERROR', '尝试常见打印机名称异常', { error: error.message });
        return {
            success: false,
            message: '获取打印机列表失败',
            error: error.message
        };
    }
}

// 获取打印机状态
async function getPrinterStatus() {
    try {
        const printersResult = await getPrinters();

        if (!printersResult.success) {
            return printersResult;
        }

        // 获取每个打印机的任务数量
        const printersWithJobs = await Promise.all(
            printersResult.printers.map(async (printer) => {
                try {
                    const printerClient = createIppClient(printer.name);

                    return new Promise((resolve) => {
                        const msg = {
                            'operation-attributes-tag': {
                                'requesting-user-name': CUPS_USERNAME || 'anonymous',
                                'which-jobs': 'not-completed',
                                'limit': 100,
                                'requested-attributes': [
                                    'job-id',
                                    'job-name',
                                    'job-state',
                                    'job-originating-user-name',
                                    'job-creation-time',
                                    'job-pages',
                                    'copies',
                                    'job-uri'
                                ]
                            }
                        };

                        printerClient.execute('Get-Jobs', msg, (err, res) => {
                            if (err) {
                                log('ERROR', `获取打印机${printer.name}任务数量失败`, { error: err.message });
                                printer.jobs = 0;
                                resolve(printer);
                                return;
                            }

                            // 计算任务数量
                            if (res && res['job-attributes-tag']) {
                                const jobAttributes = Array.isArray(res['job-attributes-tag'])
                                    ? res['job-attributes-tag']
                                    : [res['job-attributes-tag']];
                                printer.jobs = jobAttributes.length;
                            } else {
                                printer.jobs = 0;
                            }

                            resolve(printer);
                        });
                    });
                } catch (error) {
                    log('ERROR', `获取打印机${printer.name}状态异常`, { error: error.message });
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
        log('ERROR', '获取打印机状态异常', { error: error.message });
        return {
            success: false,
            message: '获取打印机状态失败',
            error: error.message
        };
    }
}

// 获取打印任务
async function getJobs() {
    try {
        log('DEBUG', '正在获取打印任务');

        const printer = createIppClient();

        return new Promise((resolve) => {
            const msg = {
                'operation-attributes-tag': {
                    'requesting-user-name': CUPS_USERNAME || 'anonymous',
                    'which-jobs': 'all',
                    'limit': 100,
                    'requested-attributes': [
                    'job-id',
                    'job-name',
                    'job-state',
                    'job-originating-user-name',
                    'job-creation-time',
                    'time-at-creation',
                    'date-time-at-creation',
                    'job-pages',
                    'copies',
                    'job-uri',
                    'printer-uri'
                ]
                }
            };

            printer.execute('Get-Jobs', msg, (err, res) => {
                if (err) {
                    log('ERROR', '获取打印任务失败', { error: err.message });
                    resolve({
                        success: false,
                        message: '获取打印任务失败',
                        error: err.message
                    });
                    return;
                }

                // 解析IPP响应
                const jobs = [];

                if (res && res['job-attributes-tag']) {
                    const jobAttributes = Array.isArray(res['job-attributes-tag'])
                        ? res['job-attributes-tag']
                        : [res['job-attributes-tag']];

                    jobAttributes.forEach(job => {
                        // 提取job-attributes-tag中的属性到根对象
                        let jobData = job;
                        if (job['job-attributes-tag']) {
                            jobData = {
                                ...job,
                                ...job['job-attributes-tag']
                            };
                        }

                        if (jobData && jobData['job-id']) {
                            const jobState = jobData['job-state'];
                            
                            // 状态映射：jobState 可能是数字或字符串
                            const statusText = jobState === 3 || jobState === 'pending' ? 'pending' :
                                             jobState === 4 || jobState === 'processing' ? 'processing' :
                                             jobState === 5 || jobState === 'completed' ? 'completed' :
                                             jobState === 6 || jobState === 'canceled' || jobState === 'cancelled' ? 'cancelled' :
                                             jobState === 7 || jobState === 'aborted' ? 'aborted' :
                                             jobState === 'stopped' ? 'stopped' : 'pending';

                            // 处理提交时间
                            let submittedAt;
                            if (jobData['time-at-creation']) {
                                const creationTime = jobData['time-at-creation'];
                                if (typeof creationTime === 'number') {
                                    submittedAt = new Date(creationTime * 1000).toISOString();
                                } else {
                                    submittedAt = new Date().toISOString();
                                }
                            } else if (jobData['date-time-at-creation']) {
                                const creationTime = jobData['date-time-at-creation'];
                                if (typeof creationTime === 'number') {
                                    submittedAt = new Date(creationTime * 1000).toISOString();
                                } else if (typeof creationTime === 'string') {
                                    submittedAt = new Date(creationTime).toISOString();
                                } else if (creationTime instanceof Date) {
                                    submittedAt = creationTime.toISOString();
                                } else {
                                    submittedAt = new Date().toISOString();
                                }
                            } else {
                                // 如果没有创建时间，使用当前时间
                                submittedAt = new Date().toISOString();
                            }

                            // 提取打印机名称
                            let printerName = 'Unknown Printer';
                            if (jobData['printer-uri']) {
                                const printerUri = jobData['printer-uri'];
                                // 从 URI 中提取打印机名称
                                const match = printerUri.match(/\/printers\/([^\/]+)$/);
                                if (match) {
                                    printerName = match[1];
                                }
                            } else if (jobData['job-uri']) {
                                // 从 job-uri 中提取打印机名称
                                const jobUri = jobData['job-uri'];
                                // job-uri 格式: ipp://host:port/jobs/jobId
                                // 我们需要从其他地方获取打印机名称
                                // 尝试从 job-name 中提取
                                const jobName = jobData['job-name'] || '';
                                // 如果 job-name 包含打印机信息，可以尝试提取
                                // 否则使用默认值
                                printerName = '7100cn'; // 默认打印机名称
                            } else if (jobData['printer-name']) {
                                printerName = jobData['printer-name'];
                            }

                            // 处理文件名编码问题
                            let filename = jobData['job-name'] || 'Untitled';
                            try {
                                // 尝试修复 UTF-8 编码
                                filename = Buffer.from(filename, 'latin1').toString('utf8');
                            } catch (e) {
                                // 如果转换失败，保持原样
                            }

                            jobs.push({
                                id: jobData['job-id'],
                                printer: printerName,
                                filename: filename,
                                name: filename,
                                status: statusText,
                                submittedAt: submittedAt,
                                userName: jobData['job-originating-user-name'] || 'Unknown User',
                                pages: jobData['job-pages'] || 0
                            });
                        }
                    });
                }

                log('INFO', `找到 ${jobs.length} 个任务`);

                resolve({ success: true, jobs });
            });
        });
    } catch (error) {
        log('ERROR', '获取打印任务异常', { error: error.message });
        return {
            success: false,
            message: '获取打印任务失败',
            error: error.message
        };
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
        log('ERROR', '读取历史记录失败', { error: error.message });
        return [];
    }
}

// 保存历史记录
function saveHistory(history) {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
    } catch (error) {
        log('ERROR', '保存历史记录失败', { error: error.message });
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
    log('ERROR', '服务器错误', { error: err.message, stack: err.stack });

    // Multer错误
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.json({
            success: false,
            message: `文件大小超过限制 (最大 ${MAX_FILE_SIZE / 1024 / 1024}MB)`
        });
    }

    res.status(500).json({
        success: false,
        message: err.message || '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log('====================================');
    console.log('远程打印机服务已启动');
    console.log('====================================');
    console.log(`服务地址: http://localhost:${PORT}`);
    console.log(`CUPS服务地址: ${CUPS_BASE_URL}`);
    console.log(`已配置用户: ${Object.keys(USERS).join(', ')}`);
    console.log('====================================\n');
});

module.exports = app;
