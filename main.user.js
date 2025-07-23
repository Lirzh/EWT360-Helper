// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      1.3.0
// @description  自动通过随机检查、自动播放下一视频、自动跳题（仅作业页面生效），支持1x至16x倍速调节，倍速自动维持，新增模式切换功能
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @grant        none
// 此脚本完全免费，倒卖的人绝对私募了XD
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 配置管理模块 - 处理配置的加载和保存
     */
    const ConfigManager = {
        // 默认配置
        defaultConfig: {
            speed: 1,
            autoCheckEnabled: true,
            autoPlayEnabled: true,
            autoSkipEnabled: true,
            mode: 'normal'
        },

        // 当前配置
        config: {},

        // 初始化配置
        init() {
            try {
                // 从本地存储加载配置
                const savedConfig = localStorage.getItem('ewtHelperConfig');
                if (savedConfig) {
                    const parsedConfig = JSON.parse(savedConfig);
                    // 合并保存的配置和默认配置，确保所有必要配置项都存在
                    this.config = { ...this.defaultConfig, ...parsedConfig };
                } else {
                    this.config = { ...this.defaultConfig };
                }
            } catch (e) {
                console.warn('无法读取或解析本地存储的配置:', e);
                this.config = { ...this.defaultConfig };
            }
            return this.config;
        },

        // 保存配置到本地存储
        save() {
            try {
                localStorage.setItem('ewtHelperConfig', JSON.stringify(this.config));
            } catch (e) {
                console.warn('无法保存配置到本地存储:', e);
            }
        },

        // 更新特定配置项
        update(key, value) {
            if (Object.keys(this.defaultConfig).includes(key)) {
                this.config[key] = value;
                this.save();
            } else {
                console.warn(`未知的配置项: ${key}`);
            }
        },

        // 获取配置
        get(key) {
            return this.config[key];
        }
    };

    /**
     * 配置模块 - 存储脚本所有可配置参数
     */
    const Config = {
        // 功能检查间隔（毫秒）
        checkInterval: 1000,      // 自动过检检查间隔
        rewatchInterval: 2000,    // 视频连连播检查间隔
        skipQuestionInterval: 1500, // 自动跳题检查间隔
        speedReapplyInterval: 1000, // 倍速自动重应用间隔（1秒）
        // 控制面板样式
        panelOpacity: 0.9,        // 常态透明度
        panelHoverOpacity: 1.0,   // hover时透明度
        // 目标路径匹配规则
        targetHashPath: '#/homework/', // 作业页面哈希路径前缀
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
        }
    };

    /**
     * 防干扰模块 - 处理视频倍速限制
     */
    const AntiInterference = {
        init() {
            this.proxyVideoElements();
            this.observeNewVideos();
        },

        proxyVideoElements() {
            document.querySelectorAll('video').forEach(video => {
                this.proxyVideo(video);
            });
        },

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

        proxyVideo(video) {
            if (video.__ewtProxied) return;
            video.__ewtProxied = true;

            const originalPlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            const originalAddEventListener = video.addEventListener;
            const originalRemoveEventListener = video.removeEventListener;

            Object.defineProperty(video, 'playbackRate', {
                get() {
                    return originalPlaybackRate.get.call(this);
                },
                set(value) {
                    originalPlaybackRate.set.call(this, value);
                    this.dispatchEvent(new Event('ewtRateChange'));
                },
                configurable: true
            });

            video.addEventListener = function(type, listener, options) {
                if (type === 'ratechange') {
                    this.__rateChangeListeners = this.__rateChangeListeners || [];
                    this.__rateChangeListeners.push({ listener, options });
                    return;
                }
                return originalAddEventListener.call(this, type, listener, options);
            };

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
     * 倍速控制模块
     */
    const SpeedControl = {
        speeds: [1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
        currentSpeed: 1,
        reapplyIntervalId: null,

        init() {
            // 从配置加载保存的倍速
            const savedSpeed = ConfigManager.get('speed');
            if (this.speeds.includes(savedSpeed)) {
                this.currentSpeed = savedSpeed;
            }

            this.reapplyIntervalId = setInterval(() => {
                this.reapplySpeed();
            }, Config.speedReapplyInterval);
        },

        stop() {
            if (this.reapplyIntervalId) {
                clearInterval(this.reapplyIntervalId);
                this.reapplyIntervalId = null;
            }
        },

        reapplySpeed() {
            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    if (Math.abs(video.playbackRate - this.currentSpeed) > 0.1) {
                        video.playbackRate = this.currentSpeed;
                        console.log(`已重新应用倍速: ${this.currentSpeed}x`);
                    }
                });
            } catch (error) {
                console.error('倍速重应用失败:', error);
            }
        },

        setSpeed(speed) {
            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.playbackRate = speed;
                });
                this.currentSpeed = speed;
                // 保存倍速到配置
                ConfigManager.update('speed', speed);
                const speedDisplay = document.getElementById('speedDisplay');
                if (speedDisplay) {
                    speedDisplay.textContent = `${speed}x`;
                }
            } catch (error) {
                console.error('设置倍速失败:', error);
            }
        },

        nextSpeed() {
            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const nextIndex = (currentIndex + 1) % this.speeds.length;
            this.setSpeed(this.speeds[nextIndex]);
        },

        prevSpeed() {
            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const prevIndex = (currentIndex - 1 + this.speeds.length) % this.speeds.length;
            this.setSpeed(this.speeds[prevIndex]);
        }
    };

    /**
     * 模式控制模块 - 管理不同显示模式
     */
    const ModeControl = {
        currentMode: 'normal',

        /**
         * 初始化模式控制
         * 从配置管理器加载用户偏好的模式
         */
        init() {
            this.currentMode = ConfigManager.get('mode');
            this.applyMode();
        },

        /**
         * 切换显示模式
         */
        toggleMode() {
            this.currentMode = this.currentMode === 'normal' ? 'minimal' : 'normal';
            // 保存模式到配置
            ConfigManager.update('mode', this.currentMode);
            this.applyMode();
        },

        /**
         * 应用当前模式
         * 根据模式显示或隐藏相应的UI元素
         * 极简模式保留倍速控制，仅隐藏统计信息
         */
        applyMode() {
            const statsArea = document.getElementById('statsArea');
            const speedControlArea = document.getElementById('speedControlArea');
            const modeButton = document.getElementById('modeToggleButton');

            if (this.currentMode === 'minimal') {
                // 极简模式: 显示功能按钮和倍速控制，隐藏统计信息
                if (statsArea) statsArea.style.display = 'none';
                if (speedControlArea) speedControlArea.style.display = 'flex';
                if (modeButton) modeButton.textContent = '极简';
            } else {
                // 普通模式: 显示所有元素
                if (statsArea) statsArea.style.display = 'flex';
                if (speedControlArea) speedControlArea.style.display = 'flex';
                if (modeButton) modeButton.textContent = '普通';
            }
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

            // 应用当前模式
            ModeControl.applyMode();
        },

        createStatsArea() {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'statsArea';
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

        createSpeedControlArea() {
            const speedDiv = document.createElement('div');
            speedDiv.id = 'speedControlArea';
            speedDiv.style.display = 'flex';
            speedDiv.style.alignItems = 'center';
            speedDiv.style.padding = '0 10px';
            speedDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';

            speedDiv.innerHTML = `
                <button id="speedDown" style="margin-right:5px; padding:2px 6px; border-radius:4px; border:none; background:#555; color:white; cursor:pointer;">-</button>
                <span style="color:#FFC107">倍速:</span>
                <span id="speedDisplay" style="margin:0 5px; color:#FFEB3B">${ConfigManager.get('speed')}x</span>
                <button id="speedUp" style="margin-left:5px; padding:2px 6px; border-radius:4px; border:none; background:#555; color:white; cursor:pointer;">+</button>
            `;

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
            buttonsDiv.style.paddingLeft = '10px';
            buttonsDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';

            // 添加模式切换按钮
            const modeButton = this.createModeButton();
            buttonsDiv.appendChild(modeButton);

            buttonsDiv.appendChild(this.createFunctionButton(
                '过检',
                ConfigManager.get('autoCheckEnabled'),
                (isEnabled) => {
                    AutoCheck.toggle(isEnabled);
                    ConfigManager.update('autoCheckEnabled', isEnabled);
                }
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '连播',
                ConfigManager.get('autoPlayEnabled'),
                (isEnabled) => {
                    AutoPlay.toggle(isEnabled);
                    ConfigManager.update('autoPlayEnabled', isEnabled);
                }
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '跳题',
                ConfigManager.get('autoSkipEnabled'),
                (isEnabled) => {
                    AutoSkip.toggle(isEnabled);
                    ConfigManager.update('autoSkipEnabled', isEnabled);
                }
            ));

            return buttonsDiv;
        },

        /**
         * 创建模式切换按钮
         */
        createModeButton() {
            const button = document.createElement('button');
            button.id = 'modeToggleButton';
            button.textContent = ModeControl.currentMode === 'normal' ? '普通' : '极简';

            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';
            button.style.backgroundColor = '#2196F3';

            button.addEventListener('click', () => {
                ModeControl.toggleMode();
            });

            return button;
        },

        createFunctionButton(name, initialState, toggleCallback) {
            const button = document.createElement('button');
            let isEnabled = initialState;

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

            // 初始化配置
            ConfigManager.init();

            // 初始化模式控制
            ModeControl.init();
            UI.createControlPanel();

            // 初始化倍速为保存的值并启用防干扰
            AntiInterference.init();
            SpeedControl.setSpeed(ConfigManager.get('speed'));
            // 启动倍速自动重应用
            SpeedControl.init();

            // 根据保存的配置状态启动各功能
            if (ConfigManager.get('autoCheckEnabled')) {
                AutoCheck.start();
            }
            if (ConfigManager.get('autoPlayEnabled')) {
                AutoPlay.start();
            }
            if (ConfigManager.get('autoSkipEnabled')) {
                AutoSkip.start();
            }

            this.runTimeIntervalId = setInterval(() => {
                Stats.updateRunTime();
            }, 1000);

            console.log('升学E网通助手（增强版）已启动');
        },

        stop() {
            AutoCheck.stop();
            AutoPlay.stop();
            AutoSkip.stop();

            // 停止倍速自动重应用
            SpeedControl.stop();

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