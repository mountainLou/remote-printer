/**
 * 测试程序：查询CUPS服务器中的打印机列表
 *
 * 用途：
 * 1. 向CUPS服务器发送IPP请求获取所有打印机
 * 2. 列出当前可用的打印机及其状态
 *
 * 使用方法：
 * node test-list-printers.js
 */

const ipp = require('ipp');

// CUPS服务器配置
const CUPS_SERVER_URL = 'http://192.168.1.113:3631';

/**
 * 获取CUPS服务器上的所有打印机
 * @param {string} serverUrl - CUPS服务器URL
 * @returns {Promise} 包含打印机列表的Promise
 */
function getAllPrinters(serverUrl) {
    return new Promise((resolve, reject) => {
        // 创建IPP客户端连接到CUPS服务器
        const printer = new ipp.Printer(serverUrl);

        // 使用CUPS-Get-Printers操作获取所有打印机
        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': 'test-user',
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

        printer.execute('CUPS-Get-Printers', msg, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

/**
 * 获取特定打印机的详细属性
 * @param {string} printerName - 打印机名称
 * @returns {Promise} 包含打印机属性的Promise
 */
function getPrinterDetails(printerName) {
    return new Promise((resolve, reject) => {
        const printerUrl = `${CUPS_SERVER_URL}/printers/${encodeURIComponent(printerName)}`;
        const printer = new ipp.Printer(printerUrl);

        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': 'test-user',
                'requested-attributes': [
                    'printer-name',
                    'printer-state',
                    'printer-state-message',
                    'printer-is-accepting-jobs',
                    'printer-location',
                    'printer-make-and-model',
                    'printer-uri-supported',
                    'printer-info',
                    'queued-job-count',
                    'completed-job-count'
                ]
            }
        };

        printer.execute('Get-Printer-Attributes', msg, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

/**
 * 尝试获取打印机详情（即使有错误也返回响应）
 * @param {string} printerName - 打印机名称
 * @returns {Promise} 包含打印机属性的Promise
 */
function tryGetPrinterDetails(printerName) {
    return new Promise((resolve) => {
        const printerUrl = `${CUPS_SERVER_URL}/printers/${encodeURIComponent(printerName)}`;
        const printer = new ipp.Printer(printerUrl);

        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': 'test-user',
                'requested-attributes': [
                    'printer-name',
                    'printer-state',
                    'printer-state-message',
                    'printer-is-accepting-jobs',
                    'printer-location',
                    'printer-make-and-model',
                    'printer-uri-supported',
                    'printer-info',
                    'queued-job-count',
                    'completed-job-count'
                ]
            }
        };

        printer.execute('Get-Printer-Attributes', msg, (err, res) => {
            if (err) {
                resolve({ error: err, response: res });
            } else {
                resolve({ error: null, response: res });
            }
        });
    });
}

/**
 * 格式化打印机状态
 * @param {number} state - 打印机状态码
 * @returns {string} 状态描述
 */
function formatPrinterState(state) {
    const states = {
        3: '空闲',
        4: '处理中',
        5: '已停止',
        'idle': '空闲',
        'processing': '处理中',
        'stopped': '已停止'
    };
    return states[state] || `未知 (${state})`;
}

/**
 * 主函数
 */
async function main() {
    console.log('====================================');
    console.log('CUPS打印机列表查询程序');
    console.log('====================================\n');

    console.log(`CUPS服务器: ${CUPS_SERVER_URL}\n`);
    console.log('正在查询打印机列表...\n');

    try {
        // 方法1：使用CUPS-Get-Printers获取所有打印机
        let printers = await getAllPrinters(CUPS_SERVER_URL);

        // 检查是否返回了错误或者没有打印机数据
        const hasError = printers && (printers.statusCode && printers.statusCode.startsWith('server-error-'));
        const hasPrinters = printers && (printers['printer-name'] || printers['printer-attributes-tag'] || (Array.isArray(printers) && printers.length > 0));

        // 如果CUPS-Get-Printers不支持或返回空，尝试其他方法
        if (hasError || !hasPrinters) {
            console.log('CUPS-Get-Printers不支持，尝试其他方法...\n');

            // 方法2：尝试使用Get-Printer-Attributes直接查询服务器
            const printer = new ipp.Printer(CUPS_SERVER_URL);

            const msg = {
                'operation-attributes-tag': {
                    'requesting-user-name': 'test-user',
                    'requested-attributes': [
                        'printer-name',
                        'printer-state',
                        'printer-location',
                        'printer-make-and-model',
                        'printer-info'
                    ]
                }
            };

            try {
                const serverAttrs = await new Promise((resolve, reject) => {
                    printer.execute('Get-Printer-Attributes', msg, (err, res) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(res);
                        }
                    });
                });

                // 检查是否返回了错误
                if (serverAttrs.statusCode && serverAttrs.statusCode.startsWith('client-error-')) {
                    throw new Error(serverAttrs['status-message'] || 'Client error');
                }

                if (serverAttrs && Object.keys(serverAttrs).length > 0) {
                    printers = [serverAttrs];
                }
            } catch (err) {
                // 方法3：尝试常见的打印机名称
                const commonNames = ['7100cn', 'HP_LaserJet_7100cn', 'HP-7100cn', 'printer'];
                let foundPrinters = [];

                for (const name of commonNames) {
                    try {
                        const result = await tryGetPrinterDetails(name);
                        
                        // 检查响应是否包含有效的打印机数据
                        if (result.response && result.response.statusCode === 'successful-ok') {
                            // 成功找到打印机，添加名称字段
                            result.response['printer-name'] = result.response['printer-name'] || name;
                            foundPrinters.push(result.response);
                        } else if (result.response && result.response['printer-name']) {
                            foundPrinters.push(result.response);
                        }
                    } catch (err) {
                        // 忽略错误，继续尝试下一个名称
                    }
                }

                if (foundPrinters.length > 0) {
                    printers = foundPrinters;
                }
            }
        }

        // 处理返回的打印机数据
        console.log('\n--- 发现的打印机 ---\n');

        let printerList = [];

        // 检查返回的数据格式
        if (printers && typeof printers === 'object') {
            // 如果返回的是数组
            if (Array.isArray(printers)) {
                printerList = printers;
            }
            // 如果返回的是单个打印机对象
            else if (printers['printer-name']) {
                printerList = [printers];
            }
            // 如果有printer-attributes-tag
            else if (printers['printer-attributes-tag']) {
                const attrs = printers['printer-attributes-tag'];
                if (Array.isArray(attrs)) {
                    printerList = attrs;
                } else {
                    printerList = [attrs];
                }
            }
        }

        // 提取printer-attributes-tag中的属性到根对象
        printerList = printerList.map(printer => {
            if (printer['printer-attributes-tag']) {
                const attrs = printer['printer-attributes-tag'];
                return {
                    ...printer,
                    ...attrs
                };
            }
            return printer;
        });

        // 显示打印机列表
        if (printerList.length > 0) {
            console.log(`找到 ${printerList.length} 个打印机:\n`);

            printerList.forEach((printer, index) => {
                console.log(`【打印机 ${index + 1}】`);
                console.log(`  名称: ${printer['printer-name'] || 'N/A'}`);
                console.log(`  位置: ${printer['printer-location'] || 'N/A'}`);
                console.log(`  型号: ${printer['printer-make-and-model'] || 'N/A'}`);
                console.log(`  信息: ${printer['printer-info'] || 'N/A'}`);

                const state = printer['printer-state'];
                console.log(`  状态: ${formatPrinterState(state)}`);
                console.log(`  状态消息: ${printer['printer-state-message'] || '无'}`);
                console.log(`  接受任务: ${printer['printer-is-accepting-jobs'] ? '是' : '否'}`);
                console.log(`  队列中的任务: ${printer['queued-job-count'] || 0}`);

                if (printer['printer-uri-supported']) {
                    const uris = Array.isArray(printer['printer-uri-supported'])
                        ? printer['printer-uri-supported']
                        : [printer['printer-uri-supported']];
                    console.log(`  URI: ${uris[0] || 'N/A'}`);
                }

                console.log('');
            });

            console.log('====================================');
            console.log(`共发现 ${printerList.length} 个打印机`);
            console.log('====================================\n');

        } else {
            console.log('未找到任何打印机');
            console.log('\n可能的原因:');
            console.log('1. CUPS服务器上没有配置打印机');
            console.log('2. 当前用户没有访问权限');
            console.log('3. IPP协议版本不兼容\n');
        }

    } catch (error) {
        console.error('\n====================================');
        console.error('查询失败！');
        console.error('====================================\n');
        console.error('错误类型:', error.name);
        console.error('错误消息:', error.message);
        console.error('错误代码:', error.code || 'N/A');

        if (error.stack) {
            console.error('\n错误堆栈:');
            console.error(error.stack);
        }

        console.error('\n常见问题排查:');
        console.error('1. 检查CUPS服务器地址是否正确');
        console.error('2. 确认CUPS服务正在运行');
        console.error('3. 验证网络连接是否正常');
        console.error('4. 检查是否需要认证（用户名/密码）');
        console.error('5. 确认端口3631是否正确（CUPS默认是631）\n');

        process.exit(1);
    }
}

// 运行主函数
if (require.main === module) {
    main().catch(error => {
        console.error('未捕获的错误:', error);
        process.exit(1);
    });
}

module.exports = { getAllPrinters, getPrinterDetails };
