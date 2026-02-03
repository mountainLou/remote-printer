// 应用状态
const API_BASE = '/api';

// 获取认证token
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// 检查登录状态
function checkLoginStatus() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// 登出
async function logout() {
    try {
        // 调用登出API
        await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
    } catch (error) {
        console.error('登出API调用失败:', error);
    }

    // 清除本地存储
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');

    showNotification('已登出', 'success');

    // 跳转到登录页
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}

// 带认证的fetch请求
async function authenticatedFetch(url, options = {}) {
    const token = getAuthToken();

    if (!token) {
        window.location.href = '/login.html';
        return Promise.reject(new Error('未登录'));
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    // 处理401未授权
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        window.location.href = '/login.html';
        return Promise.reject(new Error('登录已过期'));
    }

    return response;
}

// 工具函数：显示通知
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

// 工具函数：格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 更新用户名显示
function updateUsernameDisplay() {
    const username = localStorage.getItem('username') || '未登录';
    const usernameElement = document.getElementById('currentUsername');
    if (usernameElement) {
        usernameElement.textContent = username;
    }
}

// 加载打印机列表
async function loadPrinters() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/printers`);
        const data = await response.json();

        const select = document.getElementById('printerSelect');
        select.innerHTML = '';

        if (data.success && data.printers.length > 0) {
            data.printers.forEach(printer => {
                const option = document.createElement('option');
                option.value = printer.name;
                option.textContent = `${printer.name} - ${printer.state || '状态未知'}`;
                select.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '无可用的打印机';
            select.appendChild(option);
        }
    } catch (error) {
        if (error.message !== '未登录' && error.message !== '登录已过期') {
            console.error('加载打印机列表失败:', error);
            showNotification('加载打印机列表失败', 'error');
        }
    }
}

// 加载打印机状态
async function loadPrinterStatus() {
    const container = document.getElementById('printerStatus');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await authenticatedFetch(`${API_BASE}/status`);
        const data = await response.json();

        if (data.success) {
            if (data.printers.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                            <path d="M6 14h12v8H6z"/>
                        </svg>
                        <p>未找到打印机</p>
                    </div>
                `;
                return;
            }

            let html = '';
            data.printers.forEach(printer => {
                const statusClass = printer.isOnline ? 'status-online' : 'status-offline';
                const statusText = printer.isOnline ? '在线' : '离线';
                const stateText = printer.state || '未知';

                html += `
                    <div class="status-item">
                        <span class="status-label">打印机名称:</span>
                        <span class="status-value">${printer.name}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">连接状态:</span>
                        <span class="status-value ${statusClass}">${statusText}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">打印机状态:</span>
                        <span class="status-value">${stateText}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">当前任务:</span>
                        <span class="status-value">${printer.jobs || 0}</span>
                    </div>
                `;
            });

            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>${data.message || '加载状态失败'}</p>
                </div>
            `;
        }
    } catch (error) {
        if (error.message !== '未登录' && error.message !== '登录已过期') {
            console.error('加载打印机状态失败:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>加载失败，请检查网络连接</p>
                </div>
            `;
        }
    }
}

// 加载当前打印任务
async function loadCurrentJobs() {
    const container = document.getElementById('currentJobs');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await authenticatedFetch(`${API_BASE}/jobs`);
        const data = await response.json();

        if (data.success) {
            if (data.jobs.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <p>当前没有打印任务</p>
                    </div>
                `;
                return;
            }

            let html = '';
            data.jobs.forEach(job => {
                const statusClass = job.status === 'completed' ? 'status-completed' :
                                   job.status === 'cancelled' ? 'status-cancelled' : 'status-processing';
                const statusText = job.status === 'completed' ? '已完成' :
                                  job.status === 'cancelled' ? '已取消' : '处理中';

                html += `
                    <div class="job-item">
                        <div class="job-header">
                            <span class="job-title">${job.filename}</span>
                            <span class="job-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="job-details">
                            <p>打印机: ${job.printer}</p>
                            <p>提交时间: ${formatDate(job.submittedAt)}</p>
                            ${job.status === 'processing' ? `<p>进度: ${job.progress || 0}%</p>` : ''}
                        </div>
                        ${job.status === 'processing' ? `
                            <div class="job-actions">
                                <button class="btn btn-danger" onclick="cancelJob('${job.id}')">
                                    取消任务
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>${data.message || '加载任务失败'}</p>
                </div>
            `;
        }
    } catch (error) {
        if (error.message !== '未登录' && error.message !== '登录已过期') {
            console.error('加载打印任务失败:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>加载失败，请检查网络连接</p>
                </div>
            `;
        }
    }
}

// 加载打印历史记录
async function loadPrintHistory() {
    const container = document.getElementById('printHistory');
    container.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await authenticatedFetch(`${API_BASE}/history`);
        const data = await response.json();

        if (data.success) {
            if (data.history.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <p>暂无打印历史记录</p>
                    </div>
                `;
                return;
            }

            let html = '';
            data.history.forEach(record => {
                const statusClass = record.status === 'success' ? 'status-completed' :
                                   record.status === 'cancelled' ? 'status-cancelled' : 'status-processing';
                const statusText = record.status === 'success' ? '成功' :
                                  record.status === 'cancelled' ? '已取消' : '失败';

                html += `
                    <div class="history-item">
                        <div class="history-header">
                            <span class="history-filename">${record.filename}</span>
                            <span class="job-status ${statusClass}">${statusText}</span>
                        </div>
                        <div class="history-details">
                            <p>打印机: ${record.printer}</p>
                            <p>打印时间: ${formatDate(record.printedAt)}</p>
                            ${record.pages ? `<p>页数: ${record.pages}</p>` : ''}
                            ${record.size ? `<p>文件大小: ${record.size}</p>` : ''}
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <p>${data.message || '加载历史记录失败'}</p>
                </div>
            `;
        }
    } catch (error) {
        if (error.message !== '未登录' && error.message !== '登录已过期') {
            console.error('加载打印历史失败:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>加载失败，请检查网络连接</p>
                </div>
            `;
        }
    }
}

// 取消打印任务
async function cancelJob(jobId) {
    if (!confirm('确定要取消这个打印任务吗？')) {
        return;
    }

    try {
        const response = await authenticatedFetch(`${API_BASE}/jobs/${jobId}/cancel`, {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            showNotification('任务已取消', 'success');
            loadCurrentJobs();
        } else {
            showNotification(data.message || '取消任务失败', 'error');
        }
    } catch (error) {
        if (error.message !== '未登录' && error.message !== '登录已过期') {
            console.error('取消任务失败:', error);
            showNotification('取消任务失败，请检查网络连接', 'error');
        }
    }
}

// 上传并打印文件
async function uploadAndPrint(event) {
    event.preventDefault();

    const printerSelect = document.getElementById('printerSelect');
    const fileInput = document.getElementById('fileInput');
    const copiesInput = document.getElementById('copies');
    const uploadBtn = document.getElementById('uploadBtn');
    const progressContainer = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    if (!printerSelect.value) {
        showNotification('请选择打印机', 'error');
        return;
    }

    if (!fileInput.files[0]) {
        showNotification('请选择要打印的文件', 'error');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('printer', printerSelect.value);
    formData.append('copies', copiesInput.value);

    // 禁用按钮，显示进度
    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中...';
    progressContainer.classList.remove('hidden');

    try {
        // 使用 XMLHttpRequest 以支持上传进度
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    progressFill.style.width = `${percent}%`;
                    progressText.textContent = `${percent}%`;
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        showNotification('文件已成功上传并添加到打印队列', 'success');
                        fileInput.value = '';
                        loadCurrentJobs();
                    } else {
                        showNotification(data.message || '打印失败', 'error');
                    }
                } else if (xhr.status === 401 || xhr.status === 403) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('username');
                    window.location.href = '/login.html';
                } else {
                    showNotification('上传失败', 'error');
                }
                resolve();
            });

            xhr.addEventListener('error', () => {
                showNotification('网络错误，上传失败', 'error');
                reject();
            });

            xhr.open('POST', `${API_BASE}/print`);
            xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`);
            xhr.send(formData);
        }).finally(() => {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '上传并打印';
            progressContainer.classList.add('hidden');
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
        });
    } catch (error) {
        console.error('上传失败:', error);
        if (error.message !== '未登录' && error.message !== '登录已过期') {
            showNotification('上传失败，请检查网络连接', 'error');
        }
        uploadBtn.disabled = false;
        uploadBtn.textContent = '上传并打印';
        progressContainer.classList.add('hidden');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 检查登录状态
    if (!checkLoginStatus()) {
        return;
    }

    // 更新用户名显示
    updateUsernameDisplay();

    // 加载初始数据
    loadPrinters();
    loadPrinterStatus();
    loadCurrentJobs();
    loadPrintHistory();

    // 设置定时刷新
    setInterval(() => {
        if (getAuthToken()) {
            loadPrinterStatus();
            loadCurrentJobs();
        }
    }, 30000); // 每30秒刷新一次

    // 事件监听
    document.getElementById('uploadForm').addEventListener('submit', uploadAndPrint);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('refreshStatus').addEventListener('click', () => {
        loadPrinterStatus();
        showNotification('状态已刷新', 'success');
    });
    document.getElementById('refreshHistory').addEventListener('click', () => {
        loadPrintHistory();
        showNotification('历史记录已刷新', 'success');
    });
});
