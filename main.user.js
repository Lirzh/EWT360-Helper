// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      1.2.0
// @description  自动通过随机检查、自动播放下一视频、自动跳题（仅作业页面生效），支持1x至16x倍速调节
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @grant        none
// 此脚本完全免费，倒卖的人绝对私募了XD
// ==/UserScript==

(function() {
    'use strict';

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

        updateDisplay() {
            document.getElementById('videoCount').textContent = this.data.videoPlayCount;
            document.getElementById('totalCheckCount').textContent = this.data.totalCheckCount;
            document.getElementById('skippedQuestionCount').textContent = this.data.skippedQuestionCount;
            document.getElementById('runTime').textContent = this.data.runTime;
        },

        updateRunTime() {
            const now = new Date();
            const durationMs = now - this.data.startTime;
            const hours = Math.floor(durationMs / 3600000).toString().padStart(2, '0');
            const minutes = Math.floor((durationMs % 3600000) / 60000).toString().padStart(2, '0');
            const seconds = Math.floor((durationMs % 60000) / 1000).toString().padStart(2, '0');
            this.data.runTime = `${hours}:${minutes}:${seconds}`;
            this.updateDisplay();
        },

        reset() {
            this.data.videoPlayCount = 0;
            this.data.totalCheckCount = 0;
            this.data.skippedQuestionCount = 0;
            this.data.startTime = new Date();
            this.updateDisplay();
        }
    };

    /**
     * 防干扰模块 - 处理视频倍速限制
     * 通过代理HTMLMediaElement阻止网站限制倍速修改
     */
    const AntiInterference = {
        /**
         * 初始化视频倍速保护
         */
        init() {
            this.proxyVideoElements();
            this.observeNewVideos();
        },

        /**
         * 代理已存在的video元素
         */
        proxyVideoElements() {
            document.querySelectorAll('video').forEach(video => {
                this.proxyVideo(video);
            });
        },

        /**
         * 监听页面新增的video元素并进行代理
         */
        observeNewVideos() {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'VIDEO') {
                            this.proxyVideo(node);
                        } else if (node.querySelectorAll) {
                            node.querySelectorAll('video').forEach(video => {
                                this.proxyVideo(video);
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        /**
         * 代理单个video元素
         * @param {HTMLVideoElement} video - 要代理的视频元素
         */
        proxyVideo(video) {
            if (video.__ewtProxied) return; // 避免重复代理
            video.__ewtProxied = true;

            // 保存原始属性和方法
            const originalPlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            const originalAddEventListener = video.addEventListener;
            const originalRemoveEventListener = video.removeEventListener;

            // 代理playbackRate属性
            Object.defineProperty(video, 'playbackRate', {
                get() {
                    return originalPlaybackRate.get.call(this);
                },
                set(value) {
                    // 强制设置倍速，忽略网站限制
                    originalPlaybackRate.set.call(this, value);
                    // 触发自定义事件通知倍速已更改
                    this.dispatchEvent(new Event('ewtRateChange'));
                },
                configurable: true
            });

            // 代理addEventListener方法，过滤ratechange事件
            video.addEventListener = function(type, listener, options) {
                if (type === 'ratechange') {
                    // 记录网站添加的ratechange监听器
                    this.__rateChangeListeners = this.__rateChangeListeners || [];
                    this.__rateChangeListeners.push({ listener, options });
                    return;
                }
                return originalAddEventListener.call(this, type, listener, options);
            };

            // 代理removeEventListener方法
            video.removeEventListener = function(type, listener, options) {
                if (type === 'ratechange' && this.__rateChangeListeners) {
                    this.__rateChangeListeners = this.__rateChangeListeners.filter(
                        item => !(item.listener === listener && item.options === options)
                    );
                    return;
                }
                return originalRemoveEventListener.call(this, type, listener, options);
            };

            console.log('视频倍速保护已启用');
        }
    };

    /**
     * 倍速控制模块 - 管理视频播放速度调节
     */
    const SpeedControl = {
        // 支持的倍速列表：1x至16x
        speeds: [1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
        currentSpeed: 1,

        /**
         * 设置视频播放速度
         * @param {number} speed - 播放速度倍数
         */
        setSpeed(speed) {
            try {
                // 查找所有视频元素并设置播放速度
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.playbackRate = speed;
                });
                this.currentSpeed = speed;
                // 更新UI显示
                const speedDisplay = document.getElementById('speedDisplay');
                if (speedDisplay) {
                    speedDisplay.textContent = `${speed}x`;
                }
            } catch (error) {
                console.error('设置倍速失败:', error);
            }
        },

        /**
         * 切换到下一个倍速
         */
        nextSpeed() {
            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const nextIndex = (currentIndex + 1) % this.speeds.length;
            this.setSpeed(this.speeds[nextIndex]);
        },

        /**
         * 切换到上一个倍速
         */
        prevSpeed() {
            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const prevIndex = (currentIndex - 1 + this.speeds.length) % this.speeds.length;
            this.setSpeed(this.speeds[prevIndex]);
        }
    };

    /**
     * UI模块 - 管理控制面板的创建与交互
     */
    const UI = {
        panel: null,

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

            panel.addEventListener('mouseenter', () => {
                panel.style.opacity = Config.panelHoverOpacity;
            });
            panel.addEventListener('mouseleave', () => {
                panel.style.opacity = Config.panelOpacity;
            });

            panel.appendChild(this.createStatsArea());
            panel.appendChild(this.createSpeedControlArea());
            panel.appendChild(this.createButtonArea());

            this.panel = panel;
            document.body.appendChild(panel);
        },

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
         * 创建倍速控制区域
         */
        createSpeedControlArea() {
            const speedDiv = document.createElement('div');
            speedDiv.style.display = 'flex';
            speedDiv.style.alignItems = 'center';
            speedDiv.style.padding = '0 10px';
            speedDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';
            
            // 倍速控制按钮和显示
            speedDiv.innerHTML = `
                <button id="speedDown" style="margin-right:5px; padding:2px 6px; border-radius:4px; border:none; background:#555; color:white; cursor:pointer;">-</button>
                <span style="color:#FFC107">倍速:</span>
                <span id="speedDisplay" style="margin:0 5px; color:#FFEB3B">1x</span>
                <button id="speedUp" style="margin-left:5px; padding:2px 6px; border-radius:4px; border:none; background:#555; color:white; cursor:pointer;">+</button>
            `;

            // 绑定倍速调节事件
            speedDiv.querySelector('#speedUp').addEventListener('click', () => {
                SpeedControl.nextSpeed();
            });
            speedDiv.querySelector('#speedDown').addEventListener('click', () => {
                SpeedControl.prevSpeed();
            });

            return speedDiv;
        },

        createButtonArea() {
            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.alignItems = 'center';
            buttonsDiv.style.gap = '8px';

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

            return buttonsDiv;
        },

        createFunctionButton(name, toggleCallback) {
            const button = document.createElement('button');
            let isEnabled = true;

            const updateButton = () => {
                button.textContent = `${name}: ${isEnabled ? '开' : '关'}`;
                button.style.backgroundColor = isEnabled ? '#4CAF50' : '#f44336';
            };
            updateButton();

            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            button.addEventListener('click', () => {
                isEnabled = !isEnabled;
                updateButton();
                toggleCallback(isEnabled);
            });

            return button;
        },

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

        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndClick();
            }, Config.checkInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

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

        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndSwitch();
            }, Config.rewatchInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

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

        toggle(isEnabled) {
            if (isEnabled) {
                this.start();
            } else {
                this.stop();
            }
        },

        start() {
            if (this.intervalId) return;

            this.intervalId = setInterval(() => {
                this.checkAndSkip();
            }, Config.skipQuestionInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

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

        isHomeworkPath() {
            return window.location.hash.startsWith(Config.targetHashPath);
        }
    };

    /**
     * 核心控制模块
     */
    const ScriptController = {
        runTimeIntervalId: null,

        start() {
            if (!Utils.isHomeworkPath()) {
                console.log('当前页面不是作业页面（路径不匹配#/homework/*），脚本未启动');
                return;
            }

            UI.createControlPanel();
            // 初始化倍速为1x并启用防干扰
            AntiInterference.init();
            SpeedControl.setSpeed(1);

            AutoCheck.start();
            AutoPlay.start();
            AutoSkip.start();

            this.runTimeIntervalId = setInterval(() => {
                Stats.updateRunTime();
            }, 1000);

            console.log('升学E网通助手（增强版）已启动');
        },

        stop() {
            AutoCheck.stop();
            AutoPlay.stop();
            AutoSkip.stop();

            if (this.runTimeIntervalId) {
                clearInterval(this.runTimeIntervalId);
                this.runTimeIntervalId = null;
            }

            UI.removePanel();

            console.log('升学E网通助手（增强版）已停止');
        },

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

    window.addEventListener('beforeunload', () => {
        ScriptController.stop();
    });

})();
// Ciallo～(∠・ω< )⌒★
    