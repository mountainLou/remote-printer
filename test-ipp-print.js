const ipp = require('ipp');
const fs = require('fs');
const path = require('path');

const CUPS_BASE_URL = 'http://192.168.1.113:3631';
const CUPS_USERNAME = 'admin';
const CUPS_PASSWORD = 'admin';

console.log('=== 开始测试 IPP 打印 ===');

// 创建 IPP 客户端
const printerUrl = `${CUPS_BASE_URL}/printers/7100cn`;
const url = new URL(CUPS_BASE_URL);

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

console.log('创建 IPP 客户端...');
console.log('Printer URL:', printerUrl);
console.log('Options:', options);

const printerClient = new ipp.Printer(printerUrl, options);

// 读取文件
const filePath = path.join(__dirname, '测试打印机.docx');
console.log('读取文件:', filePath);

const fileContent = fs.readFileSync(filePath);
console.log('FileContent type:', typeof fileContent);
console.log('FileContent length:', fileContent.length);
console.log('FileContent is Buffer:', Buffer.isBuffer(fileContent));

// 构建打印作业
const printJob = {
    'operation-attributes-tag': {
        'requesting-user-name': 'admin',
        'job-name': '测试打印机.docx',
        'document-format': 'application/octet-stream'
    },
    'job-attributes-tag': {
        'copies': 1
    },
    data: fileContent
};

console.log('PrintJob object:', JSON.stringify(printJob, null, 2));

// 发送打印请求
console.log('=== 开始执行打印请求 ===');

const startTime = Date.now();

printerClient.execute('Print-Job', printJob, (err, response) => {
    const elapsed = Date.now() - startTime;
    console.log('=== 打印回调被调用 ===');
    console.log('Elapsed time:', elapsed, 'ms');
    console.log('Error:', err);
    console.log('Response:', response);

    if (err) {
        console.log('=== 打印错误详情 ===');
        console.log('Error object:', err);
        console.log('Error type:', typeof err);
        console.log('Error keys:', Object.keys(err));
        console.log('Error message:', err.message);
        console.log('Error stack:', err.stack);
        process.exit(1);
    }

    const jobId = response['job-id'];
    console.log('打印任务提交成功，Job ID:', jobId);
    process.exit(0);
});

// 检查回调是否被调用
setTimeout(() => {
    console.log('=== 警告：回调未被调用 ===');
    console.log('已等待 10 秒，回调仍未被调用');
    process.exit(1);
}, 10000);
