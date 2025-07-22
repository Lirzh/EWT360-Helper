// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      0.9.6
// @description  自动通过随机检查、自动播放下一视频、自动跳题，固定界面不可移动
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @match        https://teacher.ewt360.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/Lirzh/EWT360-Helper/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/Lirzh/EWT360-Helper/main/main.user.js
// 此脚本完全免费，倒卖的人绝对私募了XD
// ==/UserScript==

(function() {
    'use strict';

    // 配置 GitHub 仓库信息 - 请替换为实际仓库信息
    const githubConfig = {
        user: "Lirzh",
        repo: "EWT360-Helper",
        scriptPath: "main.user.js", // 脚本在仓库中的路径
        checkInterval: 600,000, // 自动检查更新间隔(ms)，默认10分钟
        lastCheckTimeKey: "ewtHelperLastCheckTime" // 本地存储键名
    };

    // 统计变量
    let stats = {
        videoPlayCount: 0,        // 累计连播视频数
        totalCheckCount: 0,       // 累计过检次数
        skippedQuestionCount: 0,  // 累计跳题次数
        startTime: new Date(),    // 脚本启动时间
        runTime: '00:00:00'       // 累计运行时长
    };

    // 开关状态变量
    let isCheckEnabled = true;
    let isRewatchEnabled = true;
    let isSkipQuestionEnabled = true;
    let checkIntervalId = null;
    let rewatchIntervalId = null;
    let skipQuestionIntervalId = null;
    let runTimeIntervalId = null;
    let updateCheckIntervalId = null;

    // 配置参数
    const config = {
        checkInterval: 1000,      // 检查间隔(ms)
        rewatchInterval: 2000,    // 连播检查间隔(ms)
        skipQuestionInterval: 1500, // 自动跳题检查间隔(ms)
        panelOpacity: 0.9,        // 面板透明度
        panelHoverOpacity: 1.0    // 面板hover透明度
    };

    // 创建固定控制面板
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'ewt-helper-panel';
        panel.style.position = 'fixed';
        panel.style.top = '0';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '9999';
        panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        panel.style.padding = '8px 15px';
        panel.style.color = 'white';
        panel.style.fontSize = '12px';
        panel.style.display = 'inline-flex';
        panel.style.alignItems = 'center';
        panel.style.gap = '15px';
        panel.style.borderRadius = '0 0 8px 8px';
        panel.style.whiteSpace = 'nowrap';
        panel.style.transition = 'all 0.3s ease';
        panel.style.opacity = config.panelOpacity;

        // 鼠标悬停效果
        panel.addEventListener('mouseenter', () => {
            panel.style.opacity = config.panelHoverOpacity;
        });

        panel.addEventListener('mouseleave', () => {
            panel.style.opacity = config.panelOpacity;
        });

        // 统计信息区
        const statsDiv = document.createElement('div');
        statsDiv.style.display = 'flex';
        statsDiv.style.alignItems = 'center';
        statsDiv.style.gap = '15px';
        statsDiv.innerHTML = `
            <div>累计连播: <span id="videoCount" style="color:#4CAF50">0</span></div>
            <div>累计过检: <span id="totalCheckCount" style="color:#2196F3">0</span></div>
            <div>累计跳题: <span id="skippedQuestionCount" style="color:#9C27B0">0</span></div>
            <div>时长: <span id="runTime">00:00:00</span></div>
        `;
        panel.appendChild(statsDiv);

        // 按钮区
        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.display = 'flex';
        buttonsDiv.style.alignItems = 'center';
        buttonsDiv.style.gap = '8px';

        const checkButton = document.createElement('button');
        checkButton.textContent = `过检: ${isCheckEnabled ? '开' : '关'}`;
        checkButton.style.padding = '3px 8px';
        checkButton.style.backgroundColor = isCheckEnabled ? '#4CAF50' : '#f44336';
        checkButton.style.color = 'white';
        checkButton.style.border = 'none';
        checkButton.style.borderRadius = '12px';
        checkButton.style.cursor = 'pointer';
        checkButton.style.fontSize = '12px';
        checkButton.style.transition = 'background-color 0.2s';

        const rewatchButton = document.createElement('button');
        rewatchButton.textContent = `连播: ${isRewatchEnabled ? '开' : '关'}`;
        rewatchButton.style.padding = '3px 8px';
        rewatchButton.style.backgroundColor = isRewatchEnabled ? '#4CAF50' : '#f44336';
        rewatchButton.style.color = 'white';
        rewatchButton.style.border = 'none';
        rewatchButton.style.borderRadius = '12px';
        rewatchButton.style.cursor = 'pointer';
        rewatchButton.style.fontSize = '12px';
        rewatchButton.style.transition = 'background-color 0.2s';

        // 跳题按钮
        const skipButton = document.createElement('button');
        skipButton.textContent = `跳题: ${isSkipQuestionEnabled ? '开' : '关'}`;
        skipButton.style.padding = '3px 8px';
        skipButton.style.backgroundColor = isSkipQuestionEnabled ? '#4CAF50' : '#f44336';
        skipButton.style.color = 'white';
        skipButton.style.border = 'none';
        skipButton.style.borderRadius = '12px';
        skipButton.style.cursor = 'pointer';
        skipButton.style.fontSize = '12px';
        skipButton.style.transition = 'background-color 0.2s';

        // 检查更新按钮
        const updateButton = document.createElement('button');
        updateButton.textContent = '检查更新';
        updateButton.style.padding = '3px 8px';
        updateButton.style.backgroundColor = '#2196F3';
        updateButton.style.color = 'white';
        updateButton.style.border = 'none';
        updateButton.style.borderRadius = '12px';
        updateButton.style.cursor = 'pointer';
        updateButton.style.fontSize = '12px';
        updateButton.style.transition = 'background-color 0.2s';

        // 重置按钮
        const resetButton = document.createElement('button');
        resetButton.textContent = '重置统计';
        resetButton.style.padding = '3px 8px';
        resetButton.style.backgroundColor = '#555';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '12px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.fontSize = '12px';
        resetButton.style.transition = 'background-color 0.2s';

        // 按钮事件监听
        checkButton.addEventListener('click', () => {
            isCheckEnabled = !isCheckEnabled;
            checkButton.textContent = `过检: ${isCheckEnabled ? '开' : '关'}`;
            checkButton.style.backgroundColor = isCheckEnabled ? '#4CAF50' : '#f44336';
            toggleCheckInterval();
        });

        rewatchButton.addEventListener('click', () => {
            isRewatchEnabled = !isRewatchEnabled;
            rewatchButton.textContent = `连播: ${isRewatchEnabled ? '开' : '关'}`;
            rewatchButton.style.backgroundColor = isRewatchEnabled ? '#4CAF50' : '#f44336';
            toggleRewatchInterval();
        });

        skipButton.addEventListener('click', () => {
            isSkipQuestionEnabled = !isSkipQuestionEnabled;
            skipButton.textContent = `跳题: ${isSkipQuestionEnabled ? '开' : '关'}`;
            skipButton.style.backgroundColor = isSkipQuestionEnabled ? '#4CAF50' : '#f44336';
            toggleSkipQuestionInterval();
        });

        updateButton.addEventListener('click', () => {
            checkForUpdates(true);
        });

        resetButton.addEventListener('click', () => {
            if (confirm('确定要重置统计数据吗？')) {
                stats.videoPlayCount = 0;
                stats.totalCheckCount = 0;
                stats.skippedQuestionCount = 0;
                stats.startTime = new Date();
                updateStatsDisplay();
            }
        });

        // 添加所有按钮到面板
        buttonsDiv.appendChild(checkButton);
        buttonsDiv.appendChild(rewatchButton);
        buttonsDiv.appendChild(skipButton);
        buttonsDiv.appendChild(updateButton);
        buttonsDiv.appendChild(resetButton);
        panel.appendChild(buttonsDiv);

        document.body.appendChild(panel);
    }

    // 更新统计显示
    function updateStatsDisplay() {
        document.getElementById('videoCount').textContent = stats.videoPlayCount;
        document.getElementById('totalCheckCount').textContent = stats.totalCheckCount;
        document.getElementById('skippedQuestionCount').textContent = stats.skippedQuestionCount;
        document.getElementById('runTime').textContent = stats.runTime;
    }

    // 更新运行时长
    function updateRunTime() {
        const now = new Date();
        const durationMs = now - stats.startTime;
        const hours = Math.floor(durationMs / 3600000).toString().padStart(2, '0');
        const minutes = Math.floor((durationMs % 3600000) / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
        stats.runTime = `${hours}:${minutes}:${seconds}`;
        updateStatsDisplay();
    }

    // 定时器控制函数
    function toggleCheckInterval() {
        if (isCheckEnabled && !checkIntervalId) {
            checkIntervalId = setInterval(clickSpecificSpan, config.checkInterval);
        } else if (!isCheckEnabled && checkIntervalId) {
            clearInterval(checkIntervalId);
            checkIntervalId = null;
        }
    }

    function toggleRewatchInterval() {
        if (isRewatchEnabled && !rewatchIntervalId) {
            rewatchIntervalId = setInterval(handleRewatchElement, config.rewatchInterval);
        } else if (!isRewatchEnabled && rewatchIntervalId) {
            clearInterval(rewatchIntervalId);
            rewatchIntervalId = null;
        }
    }

    function toggleSkipQuestionInterval() {
        if (isSkipQuestionEnabled && !skipQuestionIntervalId) {
            skipQuestionIntervalId = setInterval(handleSkipQuestions, config.skipQuestionInterval);
        } else if (!isSkipQuestionEnabled && skipQuestionIntervalId) {
            clearInterval(skipQuestionIntervalId);
            skipQuestionIntervalId = null;
        }
    }

    // 启动自动检查更新定时器
    function startUpdateCheckInterval() {
        if (updateCheckIntervalId) {
            clearInterval(updateCheckIntervalId);
        }
        
        // 检查是否需要立即检查更新（超过24小时未检查）
        const lastCheckTime = GM_getValue(githubConfig.lastCheckTimeKey, 0);
        const now = new Date().getTime();
        
        if (now - lastCheckTime > githubConfig.checkInterval) {
            checkForUpdates(false); // 静默检查
        }
        
        // 设置定期检查
        updateCheckIntervalId = setInterval(() => {
            checkForUpdates(false);
        }, githubConfig.checkInterval);
    }

    // 版本比较函数
    function compareVersions(current, latest) {
        const currentParts = current.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);
        
        for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
            const currentVal = currentParts[i] || 0;
            const latestVal = latestParts[i] || 0;
            
            if (latestVal > currentVal) return true; // 有更新
            if (latestVal < currentVal) return false; // 当前版本更新
        }
        return false; // 版本相同
    }

    // 检查更新函数
    function checkForUpdates(showNoUpdateMsg) {
        // 记录检查时间
        GM_setValue(githubConfig.lastCheckTimeKey, new Date().getTime());
        
        // 构建API URL
        const apiUrl = `https://api.github.com/repos/${githubConfig.user}/${githubConfig.repo}/contents/${githubConfig.scriptPath}`;
        
        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            headers: {
                "Accept": "application/vnd.github.v3+json"
            },
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    const content = atob(data.content.replace(/\n/g, ''));
                    
                    // 从内容中提取版本号
                    const versionMatch = content.match(/@version\s+(\d+\.\d+\.\d+)/);
                    if (!versionMatch || !versionMatch[1]) {
                        if (showNoUpdateMsg) {
                            alert('无法获取最新版本信息');
                        }
                        return;
                    }
                    
                    const latestVersion = versionMatch[1];
                    const currentVersion = GM_info.script.version;
                    
                    // 比较版本
                    if (compareVersions(currentVersion, latestVersion)) {
                        if (confirm(`发现新版本 ${latestVersion}！当前版本 ${currentVersion}\n是否立即更新？`)) {
                            const rawUrl = `https://raw.githubusercontent.com/${githubConfig.user}/${githubConfig.repo}/main/${githubConfig.scriptPath}`;
                            // 在新标签页打开更新链接（Tampermonkey会自动提示安装）
                            window.open(rawUrl, '_blank');
                        }
                    } else if (showNoUpdateMsg) {
                        alert(`当前已是最新版本 (${currentVersion})`);
                    }
                } catch (e) {
                    console.error('更新检查失败:', e);
                    if (showNoUpdateMsg) {
                        alert('检查更新时发生错误');
                    }
                }
            },
            onerror: function() {
                console.error('更新检查请求失败');
                if (showNoUpdateMsg) {
                    alert('无法连接到更新服务器');
                }
            }
        });
    }

    // 点击过检按钮
    function clickSpecificSpan() {
        try {
            const spans = document.querySelectorAll('span.btn-3LStS');
            spans.forEach(span => {
                if (span.textContent.trim() === '点击通过检查') {
                    // 模拟真实点击
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    span.dispatchEvent(clickEvent);

                    stats.totalCheckCount++;
                    updateStatsDisplay();

                    // 播放提示音
                    playNotificationSound('check');
                }
            });
        } catch (e) {
            console.error('过检功能出错:', e);
        }
    }

    // 处理自动连播
    function handleRewatchElement() {
        try {
            // 检查视频是否已播放完成（通过进度条判断）
            const progressBar = document.querySelector('.video-progress-bar');
            if (progressBar) {
                const progress = parseFloat(progressBar.style.width) || 0;
                // 当视频播放完成度超过95%时才尝试切换
                if (progress < 95) return;
            }

            const rewatchElement = document.querySelector('.progress-action-ghost-1cxSL');
            if (!rewatchElement) return;

            const itemContainer = document.querySelector('.listCon-N9Rlm');
            if (!itemContainer) return;

            const activeItem = itemContainer.querySelector('.item-IPNWw.active-1MWMf');
            if (!activeItem) return;

            let nextItem = activeItem.nextElementSibling;
            while (nextItem) {
                if (nextItem.classList.contains('item-IPNWw')) {
                    // 模拟真实点击
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    nextItem.dispatchEvent(clickEvent);

                    stats.videoPlayCount++;
                    updateStatsDisplay();

                    // 播放提示音
                    playNotificationSound('next');
                    return;
                }
                nextItem = nextItem.nextElementSibling;
            }
        } catch (e) {
            console.error('连播功能出错:', e);
        }
    }

    // 处理题目，自动点击跳题按钮
    function handleSkipQuestions() {
        try {
            // 查找所有可能的"跳题"按钮
            const skipTexts = ['跳过', '跳题', '跳过题目', '暂不回答', '以后再说', '跳过本题'];
            let skipButton = null;

            // 尝试通过多种选择器查找跳题按钮
            skipTexts.forEach(text => {
                if (skipButton) return;

                // 检查按钮元素
                const buttons = document.querySelectorAll('button, a, span.btn, div.btn');
                buttons.forEach(btn => {
                    if (btn.textContent.trim() === text) {
                        skipButton = btn;
                    }
                });

                // 检查包含跳题文本的其他元素
                if (!skipButton) {
                    const elements = document.evaluate(
                        `//*[text()="${text}"]`,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    if (elements) {
                        skipButton = elements;
                    }
                }
            });

            // 如果找到跳题按钮且未被点击过，则点击它
            if (skipButton && !skipButton.dataset.skipClicked) {
                // 标记为已点击，避免重复点击
                skipButton.dataset.skipClicked = 'true';

                // 模拟真实点击
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                skipButton.dispatchEvent(clickEvent);

                stats.skippedQuestionCount++;
                updateStatsDisplay();

                // 播放提示音
                playNotificationSound('skip');

                // 5秒后清除标记，允许处理下一个题目
                setTimeout(() => {
                    delete skipButton.dataset.skipClicked;
                }, 5000);
            }
        } catch (e) {
            console.error('跳题功能出错:', e);
        }
    }

    // 播放通知音效
    function playNotificationSound(type) {
        try {
            // 使用不同频率的简单提示音区分不同操作
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // 根据类型设置不同音调
            oscillator.type = 'sine';
            switch(type) {
                case 'check':
                    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                    break;
                case 'next':
                    oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
                    break;
                case 'skip':
                    oscillator.frequency.setValueAtTime(1046, audioContext.currentTime);
                    break;
                default:
                    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            }
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.15);
        } catch (e) {
            // 音效非必需功能，出错时忽略
        }
    }

    // 清理函数
    function cleanup() {
        if (checkIntervalId) clearInterval(checkIntervalId);
        if (rewatchIntervalId) clearInterval(rewatchIntervalId);
        if (skipQuestionIntervalId) clearInterval(skipQuestionIntervalId);
        if (runTimeIntervalId) clearInterval(runTimeIntervalId);
        if (updateCheckIntervalId) clearInterval(updateCheckIntervalId);

        const panel = document.getElementById('ewt-helper-panel');
        if (panel) panel.remove();
    }

    // 初始化
    createControlPanel();
    toggleCheckInterval();
    toggleRewatchInterval();
    toggleSkipQuestionInterval();
    runTimeIntervalId = setInterval(updateRunTime, 1000);
    startUpdateCheckInterval(); // 启动更新检查
    updateStatsDisplay();

    // 监听页面卸载，清理资源
    window.addEventListener('beforeunload', cleanup);

})();
// Ciallo～(∠・ω< )⌒★
