/**
 * 测试程序：查询CUPS打印机状态和属性
 *
 * 用途：
 * 1. 向CUPS服务器发送IPP请求获取打印机属性
 * 2. 查询打印机状态
 * 3. 显示打印机的详细信息
 *
 * 使用方法：
 * node test-printer-status.js [打印机名称]
 *
 * 示例：
 * node test-printer-status.js 7100cn
 */

const ipp = require('ipp');

// 配置
const CUPS_SERVER_URL = 'http://192.168.1.113:3631';
const PRINTER_NAME = process.argv[2] || '7100cn';

/**
 * 获取打印机属性
 * @param {string} printerUrl - 打印机完整的IPP URL
 * @returns {Promise} 包含打印机属性的Promise
 */
function getPrinterAttributes(printerUrl) {
    return new Promise((resolve, reject) => {
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
 * 获取打印机的打印任务列表
 * @param {string} printerUrl - 打印机完整的IPP URL
 * @returns {Promise} 包含任务列表的Promise
 */
function getPrinterJobs(printerUrl) {
    return new Promise((resolve, reject) => {
        const printer = new ipp.Printer(printerUrl);

        const msg = {
            'operation-attributes-tag': {
                'requesting-user-name': 'test-user',
                'which-jobs': 'all',
                'limit': 20,
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

        printer.execute('Get-Jobs', msg, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
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
 * 格式化任务状态
 * @param {number} state - 任务状态码
 * @returns {string} 状态描述
 */
function formatJobState(state) {
    const states = {
        3: '等待中',
        4: '处理中',
        5: '已完成',
        6: '已取消',
        7: '已中止',
        8: '未知',
        'pending': '等待中',
        'processing': '处理中',
        'completed': '已完成',
        'canceled': '已取消',
        'aborted': '已中止',
        'unknown': '未知'
    };
    return states[state] || `未知 (${state})`;
}

/**
 * 主函数
 */
async function main() {
    console.log('====================================');
    console.log('CUPS打印机状态测试程序');
    console.log('====================================\n');

    console.log(`CUPS服务器: ${CUPS_SERVER_URL}`);
    console.log(`打印机名称: ${PRINTER_NAME}\n`);

    // 构建完整的打印机IPP URL
    const printerUrl = `${CUPS_SERVER_URL}/printers/${encodeURIComponent(PRINTER_NAME)}`;
    console.log(`IPP URL: ${printerUrl}\n`);

    try {
        // 获取打印机属性
        console.log('--- 正在获取打印机属性 ---');
        let attributes = await getPrinterAttributes(printerUrl);

        // 提取printer-attributes-tag中的属性到根对象
        if (attributes && attributes['printer-attributes-tag']) {
            const attrs = attributes['printer-attributes-tag'];
            attributes = {
                ...attributes,
                ...attrs
            };
        }

        console.log('\n[打印机基本信息]');
        console.log(`打印机名称: ${attributes['printer-name'] || 'N/A'}`);
        console.log(`打印机位置: ${attributes['printer-location'] || 'N/A'}`);
        console.log(`打印机型号: ${attributes['printer-make-and-model'] || 'N/A'}`);
        console.log(`打印机信息: ${attributes['printer-info'] || 'N/A'}`);

        console.log('\n[打印机状态]');
        const state = attributes['printer-state'];
        console.log(`当前状态: ${formatPrinterState(state)}`);
        console.log(`状态消息: ${attributes['printer-state-message'] || '无'}`);
        console.log(`接受任务: ${attributes['printer-is-accepting-jobs'] ? '是' : '否'}`);

        console.log('\n[任务统计]');
        console.log(`队列中的任务数: ${attributes['queued-job-count'] || 0}`);
        console.log(`已完成的任务数: ${attributes['completed-job-count'] || 0}`);

        // 获取任务列表
        console.log('\n--- 正在获取任务列表 ---');
        const jobs = await getPrinterJobs(printerUrl);

        console.log('\n[当前任务列表]');
        if (jobs['job-attributes-tag']) {
            const jobAttributes = Array.isArray(jobs['job-attributes-tag'])
                ? jobs['job-attributes-tag']
                : [jobs['job-attributes-tag']];

            if (jobAttributes.length > 0) {
                jobAttributes.forEach((job, index) => {
                    // 提取job-attributes-tag中的属性到根对象
                    let jobData = job;
                    if (job['job-attributes-tag']) {
                        jobData = {
                            ...job,
                            ...job['job-attributes-tag']
                        };
                    }

                    console.log(`\n任务 #${index + 1}:`);
                    console.log(`  任务ID: ${jobData['job-id'] || 'N/A'}`);
                    console.log(`  任务名称: ${jobData['job-name'] || 'N/A'}`);
                    console.log(`  状态: ${formatJobState(jobData['job-state'])}`);
                    console.log(`  用户: ${jobData['job-originating-user-name'] || 'N/A'}`);
                    if (jobData['job-creation-time']) {
                        const date = new Date(jobData['job-creation-time'] * 1000);
                        console.log(`  创建时间: ${date.toLocaleString('zh-CN')}`);
                    }
                    console.log(`  页数: ${jobData['job-pages'] || 'N/A'}`);
                    console.log(`  份数: ${jobData['copies'] || 1}`);
                });
            } else {
                console.log('  (当前没有任务)');
            }
        } else {
            console.log('  (当前没有任务)');
        }

        console.log('\n====================================');
        console.log('测试完成！打印机正常工作。');
        console.log('====================================\n');

    } catch (error) {
        console.error('\n====================================');
        console.error('测试失败！');
        console.error('====================================\n');
        console.error('错误信息:', error.message);

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.error('\n提示: 无法连接到CUPS服务器');
            console.error('请检查:');
            console.error('1. CUPS服务器地址是否正确');
            console.error('2. CUPS服务是否正在运行');
            console.error('3. 网络连接是否正常');
        } else if (error.statusCode === 404) {
            console.error('\n提示: 未找到指定的打印机');
            console.error('请检查打印机名称是否正确');
        } else if (error.statusCode === 401 || error.statusCode === 403) {
            console.error('\n提示: 认证失败');
            console.error('可能需要提供用户名和密码');
        }

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

module.exports = { getPrinterAttributes, getPrinterJobs };
