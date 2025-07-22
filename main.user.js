// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      1.0.3
// @description  自动通过随机检查、自动播放下一视频、自动跳题（仅作业页面生效），支持自动更新
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// 此脚本完全免费，倒卖的人绝对私募了XD
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 更新配置模块 - 管理GitHub更新相关参数
     */
    const UpdateConfig = {
        user: "Lirzh",                  // GitHub用户名
        repo: "EWT360-Helper",          // 仓库名称
        scriptPath: "main.user.js",     // 脚本路径
        checkInterval: 600000,        // 自动检查间隔(毫秒) - 10分钟
        lastCheckTimeKey: "ewtLastCheckTime" // 存储最后检查时间的键名
    };

    /**
     * 配置模块 - 存储脚本所有可配置参数
     */
    const Config = {
        // 功能检查间隔（毫秒）
        checkInterval: 1000,      // 自动过检检查间隔
        rewatchInterval: 2000,    // 视频连播检查间隔
        skipQuestionInterval: 1500, // 自动跳题检查间隔
        // 控制面板样式
        panelOpacity: 0.9,        // 常态透明度
        panelHoverOpacity: 1.0,   // hover时透明度
        // 目标路径匹配规则
        targetHashPath: '#/homework/' // 作业页面哈希路径前缀
    };

    /**
     * 统计模块 - 管理脚本运行数据
     */
    const Stats = {
        data: {
            videoPlayCount: 0,       // 累计连播视频数
            totalCheckCount: 0,      // 累计过检次数
            skippedQuestionCount: 0, // 累计跳题次数
            startTime: new Date(),   // 脚本启动时间
            runTime: '00:00:00'      // 累计运行时长
        },

        /**
         * 更新统计数据显示
         */
        updateDisplay() {
            document.getElementById('videoCount').textContent = this.data.videoPlayCount;
            document.getElementById('totalCheckCount').textContent = this.data.totalCheckCount;
            document.getElementById('skippedQuestionCount').textContent = this.data.skippedQuestionCount;
            document.getElementById('runTime').textContent = this.data.runTime;
        },

        /**
         * 更新运行时长
         */
        updateRunTime() {
            const now = new Date();
            const durationMs = now - this.data.startTime;
            const hours = Math.floor(durationMs / 3600000).toString().padStart(2, '0');
            const minutes = Math.floor((durationMs % 3600000) / 60000).toString().padStart(2, '0');
            const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
            this.data.runTime = `${hours}:${minutes}:${seconds}`;
            this.updateDisplay();
        },

        /**
         * 重置统计数据
         */
        reset() {
            this.data.videoPlayCount = 0;
            this.data.totalCheckCount = 0;
            this.data.skippedQuestionCount = 0;
            this.data.startTime = new Date();
            this.updateDisplay();
        }
    };

    /**
     * UI模块 - 管理控制面板
     */
    const UI = {
        panel: null,

        /**
         * 创建控制面板
         */
        createControlPanel() {
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
            panel.style.opacity = Config.panelOpacity;

            // 鼠标悬停效果
            panel.addEventListener('mouseenter', () => {
                panel.style.opacity = Config.panelHoverOpacity;
            });
            panel.addEventListener('mouseleave', () => {
                panel.style.opacity = Config.panelOpacity;
            });

            // 添加统计信息区和按钮区
            panel.appendChild(this.createStatsArea());
            panel.appendChild(this.createButtonArea());

            this.panel = panel;
            document.body.appendChild(panel);
        },

        /**
         * 创建统计信息区域
         */
        createStatsArea() {
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
            return statsDiv;
        },

        /**
         * 创建功能按钮区域
         */
        createButtonArea() {
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.alignItems = 'center';
            buttonsDiv.style.gap = '8px';

            // 添加功能按钮
            buttonsDiv.appendChild(this.createFunctionButton(
                '过检',
                (isEnabled) => AutoCheck.toggle(isEnabled)
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '连播',
                (isEnabled) => AutoPlay.toggle(isEnabled)
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '跳题',
                (isEnabled) => AutoSkip.toggle(isEnabled)
            ));
            buttonsDiv.appendChild(this.createResetButton());
            buttonsDiv.appendChild(this.createUpdateButton()); // 添加更新检查按钮

            return buttonsDiv;
        },

        /**
         * 创建功能开关按钮
         */
        createFunctionButton(name, toggleCallback) {
            const button = document.createElement('button');
            let isEnabled = true;

            const updateButton = () => {
                button.textContent = `${name}: ${isEnabled ? '开' : '关'}`;
                button.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            };
            updateButton();

            // 按钮样式
            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            // 点击事件
            button.addEventListener('click', () => {
                isEnabled = !isEnabled;
                updateButton();
                toggleCallback(isEnabled);
            });

            return button;
        },

        /**
         * 创建统计重置按钮
         */
        createResetButton() {
            const button = document.createElement('button');
            button.textContent = '重置统计';
            button.style.padding = '3px 8px';
            button.style.backgroundColor = '#555';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#777';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#555';
            });

            button.addEventListener('click', () => {
                if (confirm('确定要重置统计数据吗？')) {
                    Stats.reset();
                }
            });

            return button;
        },

        /**
         * 创建检查更新按钮
         */
        createUpdateButton() {
            const button = document.createElement('button');
            button.textContent = '检查更新';
            button.style.padding = '3px 8px';
            button.style.backgroundColor = '#2196F3';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#0b7dda';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#2196F3';
            });

            // 点击触发手动检查更新
            button.addEventListener('click', () => {
                UpdateChecker.checkForUpdates(true);
            });

            return button;
        },

        /**
         * 移除控制面板
         */
        removePanel() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
        }
    };

    /**
     * 自动过检模块
     */
    const AutoCheck = {
        intervalId: null,

        /**
         * 切换功能开关
         */
        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        /**
         * 启动自动过检
         */
        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndClick();
            }, Config.checkInterval);
        },

        /**
         * 停止自动过检
         */
        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        /**
         * 检查并点击过检按钮
         */
        checkAndClick() {
            try {
                const buttons = document.querySelectorAll('span.btn-3LStS');
                buttons.forEach(button => {
                    if (button.textContent.trim() === '点击通过检查') {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        button.dispatchEvent(clickEvent);

                        Stats.data.totalCheckCount++;
                        Stats.updateDisplay();
                        Utils.playSound('check');
                    }
                });
            } catch (error) {
                console.error('自动过检功能出错:', error);
            }
        }
    };

    /**
     * 自动连播模块
     */
    const AutoPlay = {
        intervalId: null,

        /**
         * 切换功能开关
         */
        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        /**
         * 启动自动连播
         */
        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndSwitch();
            }, Config.rewatchInterval);
        },

        /**
         * 停止自动连播
         */
        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        /**
         * 检查视频进度并切换到下一视频
         */
        checkAndSwitch() {
            try {
                const progressBar = document.querySelector('.video-progress-bar');
                if (progressBar) {
                    const progress = parseFloat(progressBar.style.width) || 0;
                    if (progress < 95) return;
                }

                const rewatchElement = document.querySelector('.progress-action-ghost-1cxSL');
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                if (!rewatchElement || !videoListContainer) return;

                const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                if (!activeVideo) return;

                let nextVideo = activeVideo.nextElementSibling;
                while (nextVideo) {
                    if (nextVideo.classList.contains('item-IPNWw')) {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        nextVideo.dispatchEvent(clickEvent);

                        Stats.data.videoPlayCount++;
                        Stats.updateDisplay();
                        Utils.playSound('next');
                        return;
                    }
                    nextVideo = nextVideo.nextElementSibling;
                }
            } catch (error) {
                console.error('自动连播功能出错:', error);
            }
        }
    };

    /**
     * 自动跳题模块
     */
    const AutoSkip = {
        intervalId: null,

        /**
         * 切换功能开关
         */
        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        /**
         * 启动自动跳题
         */
        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndSkip();
            }, Config.skipQuestionInterval);
        },

        /**
         * 停止自动跳题
         */
        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        /**
         * 检查并点击跳题按钮
         */
        checkAndSkip() {
            try {
                const skipTexts = ['跳过', '跳题', '跳过题目', '暂不回答', '以后再说', '跳过本题'];
                let targetButton = null;

                skipTexts.some(text => {
                    const buttons = document.querySelectorAll('button, a, span.btn, div.btn');
                    for (const btn of buttons) {
                        if (btn.textContent.trim() === text) {
                            targetButton = btn;
                            return true;
                        }
                    }

                    if (!targetButton) {
                        const xpathResult = document.evaluate(
                            `//*[text()="${text}"]`,
                            document,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null
                        );
                        const element = xpathResult.singleNodeValue;
                        if (element) {
                            targetButton = element;
                            return true;
                        }
                    }
                    return false;
                });

                if (targetButton && !targetButton.dataset.skipClicked) {
                    targetButton.dataset.skipClicked = 'true';

                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    targetButton.dispatchEvent(clickEvent);

                    Stats.data.skippedQuestionCount++;
                    Stats.updateDisplay();
                    Utils.playSound('skip');

                    setTimeout(() => {
                        delete targetButton.dataset.skipClicked;
                    }, 5000);
                }
            } catch (error) {
                console.error('自动跳题功能出错:', error);
            }
        }
    };

    /**
     * 工具模块
     */
    const Utils = {
        /**
         * 播放操作提示音
         */
        playSound(type) {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.type = 'sine';
                switch (type) {
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
            } catch (error) {
                console.warn('提示音播放失败:', error);
            }
        },

        /**
         * 检查当前路径是否为作业页面
         */
        isHomeworkPath() {
            return window.location.hash.startsWith(Config.targetHashPath);
        }
    };

    /**
     * 更新检查模块
     */
    const UpdateChecker = {
        updateCheckIntervalId: null,

        /**
         * 检查更新
         * @param {boolean} manualCheck - 是否为手动检查
         */
        checkForUpdates(manualCheck = false) {
            // 检查冷却时间（非手动检查时）
            const lastCheckTime = GM_getValue(UpdateConfig.lastCheckTimeKey, 0);
            const now = Date.now();

            if (!manualCheck && now - lastCheckTime < UpdateConfig.checkInterval) {
                return;
            }

            // 更新最后检查时间
            GM_setValue(UpdateConfig.lastCheckTimeKey, now);

            // 构建远程脚本URL
            const rawUrl = `https://raw.githubusercontent.com/${UpdateConfig.user}/${UpdateConfig.repo}/main/${UpdateConfig.scriptPath}`;

            // 获取本地版本
            const localVersion = GM_info.script.version;

            // 发送请求获取远程脚本
            GM_xmlhttpRequest({
                method: "GET",
                url: rawUrl,
                onload: function(response) {
                    if (response.status !== 200) {
                        if (manualCheck) alert("检查更新失败，无法连接到服务器");
                        return;
                    }

                    // 提取远程版本号
                    const remoteVersionMatch = response.responseText.match(/@version\s+(\d+\.\d+\.\d+)/);
                    if (!remoteVersionMatch) {
                        if (manualCheck) alert("无法获取远程版本信息");
                        return;
                    }

                    const remoteVersion = remoteVersionMatch[1];

                    // 比较版本
                    if (UpdateChecker.isNewVersion(remoteVersion, localVersion)) {
                        if (confirm(`发现新版本 ${remoteVersion}，当前版本 ${localVersion}，是否更新？`)) {
                            UpdateChecker.installUpdate(response.responseText);
                        }
                    } else if (manualCheck) {
                        alert(`当前已是最新版本 (${localVersion})`);
                    }
                },
                onerror: function() {
                    if (manualCheck) alert("检查更新时发生错误");
                }
            });
        },

        /**
         * 版本比较
         * @param {string} remote - 远程版本
         * @param {string} local - 本地版本
         * @returns {boolean} 是否有新版本
         */
        isNewVersion(remote, local) {
            const remoteParts = remote.split('.').map(Number);
            const localParts = local.split('.').map(Number);

            for (let i = 0; i < remoteParts.length; i++) {
                if (remoteParts[i] > (localParts[i] || 0)) return true;
                if (remoteParts[i] < (localParts[i] || 0)) return false;
            }
            return false;
        },

        /**
         * 安装更新
         * @param {string} scriptContent - 新脚本内容
         */
        installUpdate(scriptContent) {
            try {
                // 创建脚本标签执行更新逻辑
                const script = document.createElement('script');
                script.textContent = `
                    (function() {
                        if (typeof GM_info !== 'undefined' && typeof GM_setValue !== 'undefined') {
                            // 存储新脚本内容
                            GM_setValue('ewtHelperNewScript', \`${scriptContent.replace(/`/g, '\\`')}\`);

                            // 提示用户并刷新
                            if (confirm('更新成功！请点击确定刷新页面使更改生效。')) {
                                location.reload();
                            }
                        }
                    })();
                `;
                document.body.appendChild(script);
                document.body.removeChild(script);
            } catch (e) {
                alert(`更新安装失败: ${e.message}`);
            }
        },

        /**
         * 初始化更新检查
         */
        init() {
            // 检查是否有已下载的更新
            const newScript = GM_getValue('ewtHelperNewScript', null);
            if (newScript) {
                // 清除存储的脚本
                GM_deleteValue('ewtHelperNewScript');
                // 替换当前脚本
                eval(newScript);
                return;
            }

            // 立即检查一次
            this.checkForUpdates();

            // 设置定时检查
            this.updateCheckIntervalId = setInterval(() => {
                this.checkForUpdates();
            }, UpdateConfig.checkInterval);
        },

        /**
         * 停止更新检查
         */
        stop() {
            if (this.updateCheckIntervalId) {
                clearInterval(this.updateCheckIntervalId);
                this.updateCheckIntervalId = null;
            }
        }
    };

    /**
     * 核心控制模块
     */
    const ScriptController = {
        runTimeIntervalId: null,

        /**
         * 启动脚本
         */
        start() {
            if (!Utils.isHomeworkPath()) {
                console.log('当前页面不是作业页面，脚本未启动');
                return;
            }

            // 初始化UI
            UI.createControlPanel();

            // 启动功能模块
            AutoCheck.start();
            AutoPlay.start();
            AutoSkip.start();

            // 启动运行时长更新
            this.runTimeIntervalId = setInterval(() => {
                Stats.updateRunTime();
            }, 1000);

            console.log('升学E网通助手（增强版）已启动');
        },

        /**
         * 停止脚本
         */
        stop() {
            // 停止功能模块
            AutoCheck.stop();
            AutoPlay.stop();
            AutoSkip.stop();
            UpdateChecker.stop();

            // 停止运行时长更新
            if (this.runTimeIntervalId) {
                clearInterval(this.runTimeIntervalId);
                this.runTimeIntervalId = null;
            }

            // 移除UI
            UI.removePanel();

            console.log('升学E网通助手（增强版）已停止');
        },

        /**
         * 监听哈希变化
         */
        watchHashChange() {
            window.addEventListener('hashchange', () => {
                const isHomework = Utils.isHomeworkPath();
                const isRunning = !!this.runTimeIntervalId;

                if (isHomework && !isRunning) {
                    this.start();
                } else if (!isHomework && isRunning) {
                    this.stop();
                }
            });
        }
    };

    // 初始化
    UpdateChecker.init(); // 先初始化更新检查
    ScriptController.start();
    ScriptController.watchHashChange();

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
        ScriptController.stop();
    });

})();
// Ciallo～(∠・ω< )⌒★
