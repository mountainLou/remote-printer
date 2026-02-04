const ipp = require('ipp');
const url = require('url');

const CUPS_BASE_URL = 'http://192.168.1.113:3631';
const CUPS_USERNAME = 'admin';
const CUPS_PASSWORD = 'admin';

console.log('=== 检查打印机支持的格式 ===');

const printerUrl = `${CUPS_BASE_URL}/printers/7100cn`;
const parsedUrl = new URL(CUPS_BASE_URL);

const options = {
    version: '2.0',
    uri: printerUrl,
    host: parsedUrl.hostname,
    port: parsedUrl.port || 3631,
    protocol: parsedUrl.protocol.replace(':', '')
};

if (CUPS_USERNAME && CUPS_PASSWORD) {
    options.username = CUPS_USERNAME;
    options.password = CUPS_PASSWORD;
}

const printerClient = new ipp.Printer(printerUrl, options);

console.log('请求打印机属性...');

printerClient.execute('Get-Printer-Attributes', null, (err, response) => {
    if (err) {
        console.log('错误:', err);
        process.exit(1);
    }

    console.log('打印机属性:');
    console.log(JSON.stringify(response, null, 2));

    if (response['printer-attributes-tag']) {
        const attrs = response['printer-attributes-tag'];
        
        console.log('\n=== 支持的文档格式 ===');
        if (attrs['document-format-supported']) {
            console.log('支持的格式:', attrs['document-format-supported']);
        } else {
            console.log('未找到 document-format-supported 属性');
        }
        
        console.log('\n=== 打印机信息 ===');
        console.log('打印机名称:', attrs['printer-name']);
        console.log('打印机状态:', attrs['printer-state']);
        console.log('打印机信息:', attrs['printer-info']);
    }
    
    process.exit(0);
});
