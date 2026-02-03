// API基础路径
const API_BASE = '/api';

// 显示通知
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

// 检查登录状态
function checkLoginStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        window.location.href = '/';
    }
}

// 登录处理
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');

    if (!username || !password) {
        showNotification('请输入用户名和密码', 'error');
        return;
    }

    // 显示加载状态
    loginBtn.disabled = true;
    loginBtn.classList.add('loading');
    loginBtn.textContent = '登录中...';

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // 保存token和用户信息
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('username', data.username);

            showNotification('登录成功，正在跳转...', 'success');

            // 延迟跳转以显示成功消息
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showNotification(data.message || '登录失败，请检查用户名和密码', 'error');
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');
            loginBtn.textContent = '登录';
        }
    } catch (error) {
        console.error('登录错误:', error);
        showNotification('网络错误，请检查网络连接', 'error');
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading');
        loginBtn.textContent = '登录';
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否已登录
    checkLoginStatus();

    // 绑定表单提交事件
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // 按回车键提交
    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin(e);
        }
    });
});
