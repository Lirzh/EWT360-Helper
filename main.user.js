// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      1.1.0
// @description  自动通过随机检查、自动播放下一视频、自动跳题（仅作业页面生效）
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @grant        none
// 此脚本完全免费，倒卖的人绝对私募了XD
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 配置模块 - 存储脚本所有可配置参数
     * 包含定时器间隔、UI样式等基础设置
     */
    const Config = {
        // 功能检查间隔（毫秒）
        checkInterval: 1000,      // 自动过检检查间隔
        rewatchInterval: 2000,    // 视频连播检查间隔
        skipQuestionInterval: 1500, // 自动跳题检查间隔
        tipsUpdateInterval: 10000, // 小贴士更新间隔(毫秒)
        // 控制面板样式
        panelOpacity: 0.9,        // 常态透明度
        panelHoverOpacity: 1.0,   // hover时透明度
        // 目标路径匹配规则（仅在该路径下生效）
        targetHashPath: '#/homework/' // 作业页面哈希路径前缀
    };

    /**
     * 统计模块 - 管理脚本运行数据
     * 包含数据存储、更新、重置功能
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
         * 作用：同步页面上的统计数字与内存数据
         */
        updateDisplay() {
            document.getElementById('videoCount').textContent = this.data.videoPlayCount;
            document.getElementById('totalCheckCount').textContent = this.data.totalCheckCount;
            document.getElementById('skippedQuestionCount').textContent = this.data.skippedQuestionCount;
            document.getElementById('runTime').textContent = this.data.runTime;
        },

        /**
         * 更新运行时长
         * 计算：当前时间 - 启动时间，转换为时分秒格式
         */
        updateRunTime() {
            const now = new Date();
            const durationMs = now - this.data.startTime; // 毫秒差
            const hours = Math.floor(durationMs / 3600000).toString().padStart(2, '0'); // 小时
            const minutes = Math.floor((durationMs % 3600000) / 60000).toString().padStart(2, '0'); // 分钟
            const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0'); // 秒
            this.data.runTime = `${hours}:${minutes}:${seconds}`;
            this.updateDisplay();
        },

        /**
         * 重置统计数据
         * 触发：用户点击"重置统计"按钮时
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
     * 小贴士模块 - 管理随机小贴士的获取和显示
     * 小贴士内容已内置在脚本中，无需外部请求
     */
    const Tips = {
        // 内置小贴士列表
        tipsList: [
            "学习时保持规律的作息，效率会更高哦",
            "每学习45分钟，建议休息5-10分钟",
            "做好笔记是巩固知识的有效方法",
            "主动思考比被动接受信息更重要",
            "制定明确的学习目标能提高动力",
            "遇到难题可以先标记，稍后集中解决",
            "理解概念比死记硬背更有效",
            "尝试用自己的话解释学到的知识",
            "保持积极心态，学习会更轻松",
            "适当运动有助于提高学习效率",
            "整理错题本是查漏补缺的好方法",
            "睡前复习能帮助巩固记忆",
            "多喝水，保持大脑良好状态",
            "将大任务分解成小步骤，更容易完成",
            "定期回顾已学内容，防止遗忘",
            "找到适合自己的学习环境很重要",
            "不要害怕提问，提问是进步的开始",
            "合理规划时间，平衡各科学习",
            "学习时尽量远离手机等干扰源",
            "相信自己的能力，保持自信心",
            "这个脚本是免费的！",
            "开发者有两位哦！",
            "初衷是为了记笔记时不用打卡",
            "给颗 star 吧！！",
            "眼保健操不要跳过哦！"

        ],
        currentTip: '加载中小贴士...',
        intervalId: null,

        /**
         * 显示随机一条小贴士
         */
        showRandomTip() {
            if (this.tipsList.length === 0) return;

            const randomIndex = Math.floor(Math.random() * this.tipsList.length);
            this.currentTip = this.tipsList[randomIndex];
            this.updateDisplay();
        },

        /**
         * 更新页面显示
         */
        updateDisplay() {
            const tipElement = document.getElementById('tipDisplay');
            if (tipElement) {
                tipElement.textContent = this.currentTip;
            }
        },

        /**
         * 启动定时更新小贴士
         */
        start() {
            // 立即显示一条小贴士
            this.showRandomTip();

            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.showRandomTip();
            }, Config.tipsUpdateInterval);
        },

        /**
         * 停止定时更新
         */
        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        }
    };

    /**
     * UI模块 - 管理控制面板的创建与交互
     * 包含面板DOM生成、按钮事件绑定等
     */
    const UI = {
        // 面板元素缓存（避免重复查询DOM）
        panel: null,

        /**
         * 创建控制面板
         * 作用：生成固定在顶部的控制栏，包含统计信息和功能按钮
         */
        createControlPanel() {
            // 创建面板容器
            const panel = document.createElement('div');
            panel.id = 'ewt-helper-panel';
            // 基础样式：固定顶部居中，高优先级显示
            panel.style.position = 'fixed';
            panel.style.top = '0';
            panel.style.left = '50%';
            panel.style.transform = 'translateX(-50%)'; // 水平居中
            panel.style.zIndex = '9999'; // 确保在页面最上层
            panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // 半透黑背景
            panel.style.padding = '8px 15px';
            panel.style.color = 'white';
            panel.style.fontSize = '12px';
            panel.style.display = 'inline-flex';
            panel.style.alignItems = 'center';
            panel.style.gap = '15px'; // 内部元素间距
            panel.style.borderRadius = '0 0 8px 8px'; // 底部圆角
            panel.style.whiteSpace = 'nowrap'; // 防止内容换行
            panel.style.transition = 'all 0.3s ease'; // 过渡动画
            panel.style.opacity = Config.panelOpacity; // 默认透明度

            // 鼠标悬停时提高透明度（增强可见性）
            panel.addEventListener('mouseenter', () => {
                panel.style.opacity = Config.panelHoverOpacity;
            });
            panel.addEventListener('mouseleave', () => {
                panel.style.opacity = Config.panelOpacity;
            });

            // 添加统计信息区
            panel.appendChild(this.createStatsArea());
            // 添加小贴士区域
            panel.appendChild(this.createTipsArea());
            // 添加功能按钮区
            panel.appendChild(this.createButtonArea());

            // 缓存面板元素并添加到页面
            this.panel = panel;
            document.body.appendChild(panel);
        },

        /**
         * 创建统计信息区域
         * 作用：显示累计连播、过检、跳题次数及运行时长
         */
        createStatsArea() {
            const statsDiv = document.createElement('div');
            statsDiv.style.display = 'flex';
            statsDiv.style.alignItems = 'center';
            statsDiv.style.gap = '15px';
            // 统计项HTML：使用ID绑定后续数据更新
            statsDiv.innerHTML = `
                <div>累计连播: <span id="videoCount" style="color:#4CAF50">0</span></div>
                <div>累计过检: <span id="totalCheckCount" style="color:#2196F3">0</span></div>
                <div>累计跳题: <span id="skippedQuestionCount" style="color:#9C27B0">0</span></div>
                <div>时长: <span id="runTime">00:00:00</span></div>
            `;
            return statsDiv;
        },

        /**
         * 创建小贴士显示区域
         */
        createTipsArea() {
            const tipsDiv = document.createElement('div');
            tipsDiv.style.display = 'flex';
            tipsDiv.style.alignItems = 'center';
            tipsDiv.style.padding = '0 10px';
            tipsDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';
            tipsDiv.innerHTML = `
                <span style="margin-right: 5px; color:#FFC107">小贴士:</span>
                <span id="tipDisplay" style="color:#FFEB3B; max-width: 300px; overflow: hidden; text-overflow: ellipsis;"></span>
            `;
            return tipsDiv;
        },

        /**
         * 创建功能按钮区域
         * 作用：生成过检、连播、跳题的开关按钮及重置按钮
         */
        createButtonArea() {
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.alignItems = 'center';
            buttonsDiv.style.gap = '8px'; // 按钮间距

            // 添加过检开关按钮
            buttonsDiv.appendChild(this.createFunctionButton(
                '过检',
                (isEnabled) => AutoCheck.toggle(isEnabled)
            ));
            // 添加连播开关按钮
            buttonsDiv.appendChild(this.createFunctionButton(
                '连播',
                (isEnabled) => AutoPlay.toggle(isEnabled)
            ));
            // 添加跳题开关按钮
            buttonsDiv.appendChild(this.createFunctionButton(
                '跳题',
                (isEnabled) => AutoSkip.toggle(isEnabled)
            ));
            // 添加统计重置按钮
            buttonsDiv.appendChild(this.createResetButton());

            return buttonsDiv;
        },

        /**
         * 创建功能开关按钮（通用方法）
         * @param {string} name - 按钮名称（如"过检"）
         * @param {function} toggleCallback - 开关状态变化时的回调
         */
        createFunctionButton(name, toggleCallback) {
            const button = document.createElement('button');
            let isEnabled = true; // 默认开启

            // 初始化按钮样式与文本
            const updateButton = () => {
                button.textContent = `${name}: ${isEnabled ? '开' : '关'}`;
                button.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336'; // 开-绿，关-红
            };
            updateButton();

            // 按钮基础样式
            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px'; // 圆角按钮
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s'; // 颜色过渡

            // 点击切换开关状态
            button.addEventListener('click', () => {
                isEnabled = !isEnabled;
                updateButton();
                toggleCallback(isEnabled); // 触发功能模块的开关切换
            });

            return button;
        },

        /**
         * 创建统计重置按钮
         * 作用：点击时重置所有统计数据（需确认）
         */
        createResetButton() {
            const button = document.createElement('button');
            button.textContent = '重置统计';
            // 按钮样式
            button.style.padding = '3px 8px';
            button.style.backgroundColor = '#555';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            // 鼠标悬停时变亮
            button.addEventListener('mouseover', () => {
                button.style.backgroundColor = '#777';
            });
            button.addEventListener('mouseout', () => {
                button.style.backgroundColor = '#555';
            });

            // 点击事件：确认后重置统计
            button.addEventListener('click', () => {
                if (confirm('确定要重置统计数据吗？')) {
                    Stats.reset();
                }
            });

            return button;
        },

        /**
         * 移除控制面板
         * 作用：脚本停止时清理DOM元素
         */
        removePanel() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
        }
    };

    /**
     * 自动过检模块 - 处理"点击通过检查"功能
     */
    const AutoCheck = {
        intervalId: null, // 定时器ID（用于停止定时器）

        /**
         * 切换功能开关
         * @param {boolean} isEnabled - 是否启用自动过检
         */
        toggle(isEnabled) {
            if (isEnabled) {
                this.start(); // 启用：启动定时器
            } else {
                this.stop(); // 禁用：停止定时器
            }
        },

        /**
         * 启动自动过检
         * 作用：定时检查页面中是否有"点击通过检查"按钮，有则自动点击
         */
        start() {
            // 避免重复启动定时器
            if (this.intervalId) return;

            // 每隔指定时间检查一次（Config.checkInterval）
            this.intervalId = setInterval(() => {
                this.checkAndClick();
            }, Config.checkInterval);
        },

        /**
         * 停止自动过检
         * 作用：清除定时器，停止检查
         */
        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        /**
         * 检查并点击过检按钮
         * 作用：查找"点击通过检查"按钮，模拟真实点击并更新统计
         */
        checkAndClick() {
            try {
                // 查询所有可能的按钮（通过类名匹配）
                const buttons = document.querySelectorAll('span.btn-3LStS');
                buttons.forEach(button => {
                    // 匹配按钮文本（精确匹配"点击通过检查"）
                    if (button.textContent.trim() === '点击通过检查') {
                        // 模拟真实鼠标点击
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        button.dispatchEvent(clickEvent);

                        // 更新统计：过检次数+1
                        Stats.data.totalCheckCount++;
                        Stats.updateDisplay();

                        // 播放提示音
                        Utils.playSound('check');
                    }
                });
            } catch (error) {
                console.error('自动过检功能出错:', error);
            }
        }
    };

    /**
     * 自动连播模块 - 处理视频播放完成后自动切换到下一视频
     */
    const AutoPlay = {
        intervalId: null, // 定时器ID

        /**
         * 切换功能开关
         * @param {boolean} isEnabled - 是否启用自动连播
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
         * 作用：定时检查当前视频是否播放完成，完成则切换到下一视频
         */
        start() {
            if (this.intervalId) return;

            // 每隔指定时间检查一次
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
                // 1. 检查视频进度：通过进度条宽度判断
                const progressBar = document.querySelector('.video-progress-bar');
                if (progressBar) {
                    // 进度条宽度通常以百分比表示
                    const progress = parseFloat(progressBar.style.width) || 0;
                    // 视频播放进度超过95%才认为是播放完成
                    if (progress < 95) return;
                }

                // 2. 验证连播相关元素是否存在
                const rewatchElement = document.querySelector('.progress-action-ghost-1cxSL');
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                if (!rewatchElement || !videoListContainer) return;

                // 3. 查找当前播放的视频项
                const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                if (!activeVideo) return;

                // 4. 查找下一个视频项
                let nextVideo = activeVideo.nextElementSibling;
                while (nextVideo) {
                    if (nextVideo.classList.contains('item-IPNWw')) {
                        // 模拟点击下一个视频
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        nextVideo.dispatchEvent(clickEvent);

                        // 更新统计：连播次数+1
                        Stats.data.videoPlayCount++;
                        Stats.updateDisplay();

                        // 播放提示音
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
     * 自动跳题模块 - 处理题目页面自动跳过功能
     */
    const AutoSkip = {
        intervalId: null, // 定时器ID

        /**
         * 切换功能开关
         * @param {boolean} isEnabled - 是否启用自动跳题
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

            // 每隔指定时间检查一次
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
                // 可能的跳题按钮文本
                const skipTexts = ['跳过', '跳题', '跳过题目', '暂不回答', '以后再说', '跳过本题'];
                let targetButton = null;

                // 遍历所有可能的文本，查找匹配的按钮
                skipTexts.some(text => {
                    // 1. 先检查常见按钮元素
                    const buttons = document.querySelectorAll('button, a, span.btn, div.btn');
                    for (const btn of buttons) {
                        if (btn.textContent.trim() === text) {
                            targetButton = btn;
                            return true;
                        }
                    }

                    // 2. 若未找到，用XPath查询
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

                // 若找到跳题按钮且未标记为已点击
                if (targetButton && !targetButton.dataset.skipClicked) {
                    // 标记为已点击
                    targetButton.dataset.skipClicked = 'true';

                    // 模拟真实点击
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    targetButton.dispatchEvent(clickEvent);

                    // 更新统计：跳题次数+1
                    Stats.data.skippedQuestionCount++;
                    Stats.updateDisplay();

                    // 播放提示音
                    Utils.playSound('skip');

                    // 5秒后清除标记
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
     * 工具模块 - 提供通用工具函数
     */
    const Utils = {
        /**
         * 播放操作提示音
         * @param {string} type - 操作类型（check/next/skip）
         */
        playSound(type) {
            try {
                // 创建音频上下文
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                // 连接音频节点
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // 设置声音类型为正弦波
                oscillator.type = 'sine';
                // 根据操作类型设置不同频率
                switch (type) {
                    case 'check': // 过检：880Hz
                        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                        break;
                    case 'next': // 连播：660Hz
                        oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
                        break;
                    case 'skip': // 跳题：1046Hz
                        oscillator.frequency.setValueAtTime(1046, audioContext.currentTime);
                        break;
                    default:
                        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                }
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

                // 启动声音并在0.15秒后停止
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.15);
            } catch (error) {
                console.warn('提示音播放失败:', error);
            }
        },

        /**
         * 检查当前路径是否为作业页面
         * @returns {boolean} 是否为作业页面
         */
        isHomeworkPath() {
            return window.location.hash.startsWith(Config.targetHashPath);
        }
    };

    /**
     * 核心控制模块 - 管理脚本的启动与停止
     */
    const ScriptController = {
        runTimeIntervalId: null, // 运行时长定时器ID

        /**
         * 启动脚本
         */
        start() {
            // 检查是否为目标路径
            if (!Utils.isHomeworkPath()) {
                console.log('当前页面不是作业页面（路径不匹配#/homework/*），脚本未启动');
                return;
            }

            // 初始化UI
            UI.createControlPanel();

            // 启动所有功能
            AutoCheck.start();
            AutoPlay.start();
            AutoSkip.start();
            Tips.start();

            // 启动运行时长更新定时器
            this.runTimeIntervalId = setInterval(() => {
                Stats.updateRunTime();
            }, 1000);

            console.log('升学E网通助手（增强版）已启动');
        },

        /**
         * 停止脚本
         */
        stop() {
            // 停止所有功能定时器
            AutoCheck.stop();
            AutoPlay.stop();
            AutoSkip.stop();
            Tips.stop();

            // 停止运行时长更新
            if (this.runTimeIntervalId) {
                clearInterval(this.runTimeIntervalId);
                this.runTimeIntervalId = null;
            }

            // 移除控制面板
            UI.removePanel();

            console.log('升学E网通助手（增强版）已停止');
        },

        /**
         * 监听哈希路径变化
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

    // 初始化脚本
    ScriptController.start();
    ScriptController.watchHashChange();

    // 页面卸载时停止脚本
    window.addEventListener('beforeunload', () => {
        ScriptController.stop();
    });

})();
// Ciallo～(∠・ω< )⌒★
