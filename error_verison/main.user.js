// ==UserScript==
// @name         升学E网通助手
// @namespace    https://github.com/ZNink/EWT360-Helper
// @version      1.7.0
// @description  自动通过随机检查、自动播放下一视频、自动跳题（仅作业页面生效）、1x至16x倍速调节、挂机模式、自定义跳过科目、小屏设备适配
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       ZNink & Lirzh
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @supportURL   https://github.com/ZNink/EWT360-Helper/issues
// ==/UserScript==

(function() {
    'use strict';

    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }

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
            speedControlEnabled: true, // 倍速功能是否启用
            hangupModeEnabled: false, // 挂机模式状态
            lastVolume: 1, // 保存最后一次音量设置
            hangupSkipSubjects: [],
            showSpeedWarning: true, // 是否显示倍速提醒
            soundEnabled: true, // 是否播放提示音
            sidebarPosition: null,
            sidebarShrunk: false
        },

        // 当前配置
        config: {},

        // 初始化配置
        init() {
            try {
                const savedConfig = localStorage.getItem('ewtHelperConfig');
                if (savedConfig) {
                    const parsedConfig = JSON.parse(savedConfig);
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
            if (Object.keys(this.defaultConfig).includes(key) || key === 'sidebarPosition') {
                this.config[key] = value;
                this.save();
            } else {
                console.warn(`未知的配置项: ${key}`);
            }
        },

        // 获取配置
        get(key) {
            return this.config[key];
        },

        // 重置配置到默认
        reset() {
            this.config = { ...this.defaultConfig };
            this.save();
            localStorage.removeItem('ewtPreHangupSettings');
        }
    };

    /**
     * 配置模块 - 存储脚本所有可配置参数
     */
    const Config = {
        // 功能检查间隔（毫秒）
        checkInterval: 1000,      // 自动过检检查间隔
        rewatchInterval: 1000,    // 视频连连播检查间隔
        skipQuestionInterval: 1000, // 自动跳题检查间隔
        speedReapplyInterval: 1000, // 倍速自动重应用间隔（1秒）
        subjectCheckInterval: 1000, // 科目信息检查间隔（3秒）
        hangupCheckInterval: 1000, // 挂机模式检查间隔（1秒）
        playCheckInterval: 500,   // 播放状态检查间隔（0.5秒）
        // 控制面板样式
        panelOpacity: 0.9,        // 常态透明度
        panelHoverOpacity: 1.0,   // hover时透明度
        // 目标路径匹配规则
        targetHashPath: '#/homework/', // 作业页面哈希路径前缀
        // 所有可能的科目列表（用于设置弹窗）
        allSubjects: ['语文', '英语', '数学', '历史', '政治', '生物', '地理', '物理', '化学', '信息技术', '通用技术', '音乐', '美术', '体育', '科学', '品德']
    };

    /**
     * 统计模块 - 管理脚本运行数据
     */
    const Stats = {
        data: {
            videoPlayCount: 0,       // 累计连播视频数
            totalCheckCount: 0,      // 累计过检次数
            skippedQuestionCount: 0, // 累计跳题次数
            skippedVideoCount: 0,    // 累计跳过视频数（挂机模式，不显示）
            startTime: new Date(),   // 脚本启动时间
            runTime: '00:00:00',     // 累计运行时长
            currentSubject: '未播放' // 当前播放视频的科目（不显示）
        },

        boundElements: {
            videoPlayCount: [],
            totalCheckCount: [],
            skippedQuestionCount: [],
            runTime: []
        },

        bindElement(key, element) {
            if (this.boundElements[key]) {
                this.boundElements[key].push(element);
            }
        },

        updateDisplay() {
            Object.keys(this.boundElements).forEach(key => {
                this.boundElements[key].forEach(el => {
                    if (el) el.textContent = this.data[key];
                });
            });
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

        updateSubject(subject) {
            if (subject && subject !== this.data.currentSubject) {
                this.data.currentSubject = subject;
            }
        }
    };

    /**
     * 防干扰模块 - 处理视频倍速限制
     */
    const AntiInterference = {
        // 保存原始的视频事件和属性，用于恢复
        originalProperties: new Map(),

        init() {
            this.proxyVideoElements();
            this.observeNewVideos();
        },

        // 代理所有现有视频元素
        proxyVideoElements() {
            document.querySelectorAll('video').forEach(video => {
                this.proxyVideo(video);
            });
        },

        // 监听新添加的视频元素
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

        // 代理视频元素以控制倍速
        proxyVideo(video) {
            if (this.originalProperties.has(video)) return;

            // 保存原始属性和方法
            const originalPlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            const originalAddEventListener = video.addEventListener;
            const originalRemoveEventListener = video.removeEventListener;

            this.originalProperties.set(video, {
                playbackRate: originalPlaybackRate,
                addEventListener: originalAddEventListener,
                removeEventListener: originalRemoveEventListener
            });

            // 重写playbackRate属性
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

            // 重写事件监听方法以过滤ratechange事件
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
        },

        // 恢复视频元素原始状态
        restoreVideo(video) {
            if (!this.originalProperties.has(video)) return;

            const originals = this.originalProperties.get(video);

            // 恢复playbackRate属性
            Object.defineProperty(video, 'playbackRate', originals.playbackRate);

            // 恢复事件监听方法
            video.addEventListener = originals.addEventListener;
            video.removeEventListener = originals.removeEventListener;

            // 移除保存的属性
            this.originalProperties.delete(video);

            console.log('视频原始倍速控制已恢复');
        },

        // 恢复所有视频元素的原始状态
        restoreAllVideos() {
            this.originalProperties.forEach((_, video) => {
                this.restoreVideo(video);
            });
        },

        // 重新代理所有视频元素
        reProxyAllVideos() {
            this.restoreAllVideos();
            this.proxyVideoElements();
        }
    };

    /**
     * 倍速控制模块
     */
    const SpeedControl = {
        speeds: [0.1, 0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
        currentSpeed: 1,
        reapplyIntervalId: null,
        isEnabled: true,
        // 保存挂机模式激活前的倍速设置
        preHangupSpeed: 1,
        boundSpeedDisplays: [],

        bindSpeedDisplay(element) {
            this.boundSpeedDisplays.push(element);
        },

        updateSpeedDisplay() {
            this.boundSpeedDisplays.forEach(el => {
                if (el) el.textContent = `${this.currentSpeed}x`;
            });
        },

        init() {
            // 从配置加载保存的倍速和开关状态
            const savedSpeed = ConfigManager.get('speed');
            this.isEnabled = ConfigManager.get('speedControlEnabled');

            if (this.speeds.includes(savedSpeed)) {
                this.currentSpeed = savedSpeed;
                this.preHangupSpeed = savedSpeed; // 初始化挂机前的速度
            }

            // 根据开关状态决定初始化行为
            if (this.isEnabled) {
                this.startReapply();
            } else {
                this.disableSpeedControl();
            }

            // 更新UI显示状态
            this.updateSpeedControlUI();
        },

        // 启动倍速重应用定时器
        startReapply() {
            if (this.reapplyIntervalId) return;
            this.reapplyIntervalId = setInterval(() => {
                this.reapplySpeed();
            }, Config.speedReapplyInterval);
        },

        // 停止倍速重应用定时器
        stopReapply() {
            if (this.reapplyIntervalId) {
                clearInterval(this.reapplyIntervalId);
                this.reapplyIntervalId = null;
            }
        },

        // 切换倍速功能开关
        toggle(isEnabled) {
            // 如果在挂机模式下，不允许修改倍速开关
            if (ConfigManager.get('hangupModeEnabled')) return;

            this.isEnabled = isEnabled;

            if (isEnabled) {
                this.enableSpeedControl();
            } else {
                this.disableSpeedControl();
            }

            // 保存开关状态
            ConfigManager.update('speedControlEnabled', isEnabled);
            // 更新UI
            this.updateSpeedControlUI();
            UIHelpers.updateUIStates();
        },

        // 启用倍速控制
        enableSpeedControl() {
            // 重新代理视频元素
            AntiInterference.reProxyAllVideos();
            // 应用保存的倍速
            this.setSpeed(this.currentSpeed);
            // 启动重应用定时器
            this.startReapply();
        },

        // 禁用倍速控制
        disableSpeedControl() {
            // 停止重应用定时器
            this.stopReapply();
            // 恢复视频原始控制
            AntiInterference.restoreAllVideos();
            // 恢复为1x倍速
            this.resetToNormalSpeed();
        },

        // 重置为正常速度
        resetToNormalSpeed() {
            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.playbackRate = 1;
                });
            } catch (error) {
                console.error('重置为正常速度失败:', error);
            }
        },

        // 更新倍速控制UI显示
        updateSpeedControlUI() {
            document.querySelectorAll('#speedControlArea').forEach(area => {
                if (area) area.style.display = this.isEnabled ? 'flex' : 'none';
            });
        },

        reapplySpeed() {
            if (!this.isEnabled) return;

            // 挂机模式下强制维持1.0倍速
            const targetSpeed = ConfigManager.get('hangupModeEnabled') ? 1.0 : this.currentSpeed;

            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    if (Math.abs(video.playbackRate - targetSpeed) > 0.1) {
                        video.playbackRate = targetSpeed;
                        console.log(`已重新应用倍速: ${targetSpeed}x`);
                    }
                });
            } catch (error) {
                console.error('倍速重应用失败:', error);
            }
        },

        setSpeed(speed) {
            // 挂机模式下不允许修改倍速
            if (ConfigManager.get('hangupModeEnabled')) return;

            if (!this.isEnabled) return;

            // 如果不是1x倍速且需要显示提醒
            if (speed !== 1 && ConfigManager.get('showSpeedWarning')) {
                this.showSpeedWarning();
            }

            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.playbackRate = speed;
                });
                this.currentSpeed = speed;
                this.preHangupSpeed = speed; // 更新挂机前的速度
                // 保存倍速到配置
                ConfigManager.update('speed', speed);
                this.updateSpeedDisplay();
            } catch (error) {
                console.error('设置倍速失败:', error);
            }
        },

        // 显示倍速提醒弹窗
        showSpeedWarning() {
            // 检查是否已有弹窗，避免重复显示
            if (document.getElementById('speedWarningDialog')) return;

            const dialog = document.createElement('div');
            dialog.id = 'speedWarningDialog';
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.backgroundColor = 'white';
            dialog.style.borderRadius = '8px';
            dialog.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
            dialog.style.padding = '20px';
            dialog.style.zIndex = '10000';
            dialog.style.width = '300px';

            dialog.innerHTML = `
                <div style="margin-bottom: 15px; color: #333; font-weight: bold; font-size: 16px;">提示</div>
                <div style="margin-bottom: 15px; color: #666; font-size: 14px;">倍速播放可能不计入有效看课时长,请勿重复汇报issue!</div>
                <div style="display: flex; align-items: center; margin-bottom: 20px;">
                    <input type="checkbox" id="dontShowAgain" style="margin-right: 8px;">
                    <label for="dontShowAgain" style="color: #666; font-size: 13px;">不再提醒</label>
                </div>
                <div style="text-align: right;">
                    <button id="closeWarning" style="padding: 6px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">确定</button>
                </div>
            `;

            document.body.appendChild(dialog);

            // 添加关闭按钮事件
            dialog.querySelector('#closeWarning').addEventListener('click', () => {
                // 检查是否勾选了不再提醒
                const dontShowAgain = dialog.querySelector('#dontShowAgain').checked;
                if (dontShowAgain) {
                    ConfigManager.update('showSpeedWarning', false);
                }
                dialog.remove();
            });

            // 点击外部关闭
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                }
            });
        },

        nextSpeed() {
            // 挂机模式下不允许修改倍速
            if (ConfigManager.get('hangupModeEnabled')) return;

            if (!this.isEnabled) return;

            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const nextIndex = (currentIndex + 1) % this.speeds.length;
            this.setSpeed(this.speeds[nextIndex]);
        },

        prevSpeed() {
            // 挂机模式下不允许修改倍速
            if (ConfigManager.get('hangupModeEnabled')) return;

            if (!this.isEnabled) return;

            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const prevIndex = (currentIndex - 1 + this.speeds.length) % this.speeds.length;
            this.setSpeed(this.speeds[prevIndex]);
        },

        // 挂机模式激活时调用，保存当前速度并设置为1.0
        activateHangupMode() {
            this.preHangupSpeed = this.currentSpeed;
            this.setSpeed(1.0);
        },

        // 挂机模式关闭时调用，恢复之前的速度
        deactivateHangupMode() {
            this.setSpeed(this.preHangupSpeed);
        }
    };

    /**
     * 科目信息模块 - 获取并更新当前播放视频的科目（不显示，仅内部使用）
     */
    const SubjectInfo = {
        intervalId: null,

        start() {
            if (this.intervalId) return;

            // 立即检查一次，然后定时检查
            this.checkCurrentSubject();
            this.intervalId = setInterval(() => {
                this.checkCurrentSubject();
            }, Config.subjectCheckInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        checkCurrentSubject() {
            try {
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                if (!videoListContainer) return;

                // 获取当前正在播放的视频项
                const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                if (!activeVideo) {
                    Stats.updateSubject('未播放');
                    return;
                }

                // 获取科目信息元素（left-SRI55）
                const subjectElement = activeVideo.querySelector('.left-SRI55');
                if (subjectElement) {
                    const subject = subjectElement.textContent.trim();
                    Stats.updateSubject(subject);
                } else {
                    Stats.updateSubject('未知科目');
                }
            } catch (error) {
                console.error('获取科目信息出错:', error);
            }
        }
    };

    /**
     * 挂机模式模块
     */
    const HangupMode = {
        intervalId: null,
        playCheckIntervalId: null,
        lastVolume: 1, // 保存挂机前的音量

        start() {
            if (this.intervalId) return;

            // 启动定时检查
            this.intervalId = setInterval(() => {
                this.checkAndSkipSubjectVideos();
            }, Config.hangupCheckInterval);

            // 启动播放状态检查（更频繁）
            this.playCheckIntervalId = setInterval(() => {
                this.checkPlayState();
            }, Config.playCheckInterval);
        },

        stop() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            if (this.playCheckIntervalId) {
                clearInterval(this.playCheckIntervalId);
                this.playCheckIntervalId = null;
            }
        },

        // 检查视频播放状态，如暂停则继续播放
        checkPlayState() {
            // 如果挂机模式未开启，则不执行
            if (!ConfigManager.get('hangupModeEnabled')) return;

            try {
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    // 确保视频已加载且处于暂停状态
                    if (video.readyState > 0 && video.paused) {
                        console.log('挂机模式：检测到视频暂停，自动继续播放');
                        video.play().catch(e => {
                            console.log('挂机模式：自动播放失败，尝试其他方式', e);
                            // 尝试通过点击播放按钮
                            this.clickPlayButton();
                        });
                    }

                    // 确保音量为0
                    if (video.volume !== 0) {
                        video.volume = 0;
                        console.log('挂机模式：已将音量设置为0');
                    }
                });
            } catch (error) {
                console.error('挂机模式检查播放状态出错:', error);
            }
        },

        // 尝试点击页面上的播放按钮
        clickPlayButton() {
            try {
                // 尝试常见的播放按钮选择器
                const playButtons = document.querySelectorAll(
                    '.play-button, .video-play-btn, .icon-play, [class*="play"]'
                );

                playButtons.forEach(button => {
                    if (button && !button.disabled) {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        button.dispatchEvent(clickEvent);
                        console.log('挂机模式：已尝试点击播放按钮');
                    }
                });
            } catch (error) {
                console.error('挂机模式点击播放按钮出错:', error);
            }
        },

        // 检查当前视频科目，如果是需要跳过的科目则跳过
        checkAndSkipSubjectVideos() {
            // 如果挂机模式未开启，则不执行
            if (!ConfigManager.get('hangupModeEnabled')) return;

            try {
                const currentSubject = Stats.data.currentSubject;
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                const skipSubjects = ConfigManager.get('hangupSkipSubjects');

                if (!videoListContainer || currentSubject === '未播放' || currentSubject === '未知科目') {
                    return;
                }

                // 检查当前科目是否在需要跳过的列表中
                if (skipSubjects.includes(currentSubject)) {
                    console.log(`挂机模式：检测到${currentSubject}视频，准备跳过`);

                    // 获取当前正在播放的视频项
                    const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                    if (!activeVideo) return;

                    // 查找下一个视频
                    let nextVideo = activeVideo.nextElementSibling;
                    while (nextVideo) {
                        if (nextVideo.classList.contains('item-IPNWw')) {
                            // 触发点击事件，跳转到下一个视频
                            const clickEvent = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            nextVideo.dispatchEvent(clickEvent);

                            // 更新跳过视频计数（不显示）
                            Stats.data.skippedVideoCount++;

                            // 播放提示音
                            Utils.playSound('skip');

                            console.log(`挂机模式：已跳过${currentSubject}视频`);
                            return;
                        }
                        nextVideo = nextVideo.nextElementSibling;
                    }
                }
            } catch (error) {
                console.error('挂机模式跳过视频出错:', error);
            }
        },

        // 打开科目设置弹窗
        openSubjectSettings() {
            // 检查是否已有弹窗，避免重复显示
            if (document.getElementById('subjectSettingsDialog')) return;

            const dialog = document.createElement('div');
            dialog.id = 'subjectSettingsDialog';
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.backgroundColor = 'white';
            dialog.style.borderRadius = '8px';
            dialog.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
            dialog.style.padding = '20px';
            dialog.style.zIndex = '10000';
            dialog.style.width = '400px';
            dialog.style.maxHeight = '70vh';
            dialog.style.overflowY = 'auto';

            // 获取当前跳过的科目列表
            const skipSubjects = ConfigManager.get('hangupSkipSubjects');

            // 构建科目复选框列表
            let subjectsHtml = '';
            Config.allSubjects.forEach(subject => {
                const isChecked = skipSubjects.includes(subject);
                subjectsHtml += `
                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                        <input type="checkbox" id="subject-${subject}" value="${subject}" ${isChecked ? 'checked' : ''} style="margin-right: 8px;">
                        <label for="subject-${subject}" style="color: #333; font-size: 14px;">${subject}</label>
                    </div>
                `;
            });

            dialog.innerHTML = `
                <div style="margin-bottom: 15px; color: #333; font-weight: bold; font-size: 16px;">设置跳过科目</div>
                <div style="margin-bottom: 20px; color: #666; font-size: 13px;">勾选需要在挂机模式下自动跳过的科目</div>
                <div class="subjects-container">
                    ${subjectsHtml}
                </div>
                <div style="margin-top: 20px; text-align: right;">
                    <button id="cancelSubjectSettings" style="padding: 6px 15px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">取消</button>
                    <button id="saveSubjectSettings" style="padding: 6px 15px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存设置</button>
                </div>
            `;

            document.body.appendChild(dialog);

            // 添加保存按钮事件
            dialog.querySelector('#saveSubjectSettings').addEventListener('click', () => {
                const checkedSubjects = [];
                dialog.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
                    checkedSubjects.push(checkbox.value);
                });

                // 保存设置
                ConfigManager.update('hangupSkipSubjects', checkedSubjects);
                dialog.remove();

                // 显示保存成功提示
                this.showSettingsSavedMessage();
            });

            // 添加取消按钮事件
            dialog.querySelector('#cancelSubjectSettings').addEventListener('click', () => {
                dialog.remove();
            });

            // 点击外部关闭
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                }
            });
        },

        // 显示设置保存成功提示
        showSettingsSavedMessage() {
            const message = document.createElement('div');
            message.style.position = 'fixed';
            message.style.bottom = '20px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.backgroundColor = 'rgba(76, 175, 80, 0.9)';
            message.style.color = 'white';
            message.style.padding = '10px 20px';
            message.style.borderRadius = '4px';
            message.style.zIndex = '10001';
            message.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
            message.textContent = '科目设置已保存';

            document.body.appendChild(message);

            // 3秒后自动消失
            setTimeout(() => {
                message.style.opacity = '0';
                message.style.transition = 'opacity 0.5s';
                setTimeout(() => message.remove(), 500);
            }, 3000);
        },

        // 激活挂机模式
        activate() {
            // 保存当前功能状态
            const currentSettings = {
                speed: SpeedControl.currentSpeed,
                autoCheckEnabled: ConfigManager.get('autoCheckEnabled'),
                autoPlayEnabled: ConfigManager.get('autoPlayEnabled'),
                autoSkipEnabled: ConfigManager.get('autoSkipEnabled'),
                speedControlEnabled: ConfigManager.get('speedControlEnabled'),
                soundEnabled: ConfigManager.get('soundEnabled')
            };

            // 保存当前音量
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                this.lastVolume = videos[0].volume;
                ConfigManager.update('lastVolume', this.lastVolume);
            }

            // 存储当前设置，用于退出挂机模式时恢复
            localStorage.setItem('ewtPreHangupSettings', JSON.stringify(currentSettings));

            // 应用挂机模式设置
            SpeedControl.activateHangupMode();
            ConfigManager.update('autoCheckEnabled', true);
            ConfigManager.update('autoPlayEnabled', true);
            ConfigManager.update('autoSkipEnabled', true);
            ConfigManager.update('speedControlEnabled', false); // 倍速功能关闭
            ConfigManager.update('soundEnabled', false); // 提示音关闭

            // 更新功能状态
            AutoCheck.start();
            AutoPlay.start();
            AutoSkip.start();
            SpeedControl.disableSpeedControl(); // 禁用倍速控制，实际强制1x

            // 强制设置所有视频音量为0
            videos.forEach(video => {
                video.volume = 0;
            });

            // 启动挂机模式检查
            this.start();

            console.log('挂机模式已激活');
        },

        // 停用挂机模式，恢复之前的设置
        deactivate() {
            // 停止挂机模式检查
            this.stop();

            // 恢复之前的设置
            try {
                const preHangupSettings = JSON.parse(localStorage.getItem('ewtPreHangupSettings'));
                if (preHangupSettings) {
                    // 恢复倍速
                    SpeedControl.deactivateHangupMode();

                    // 恢复各功能开关状态
                    ConfigManager.update('autoCheckEnabled', preHangupSettings.autoCheckEnabled);
                    ConfigManager.update('autoPlayEnabled', preHangupSettings.autoPlayEnabled);
                    ConfigManager.update('autoSkipEnabled', preHangupSettings.autoSkipEnabled);
                    ConfigManager.update('speedControlEnabled', preHangupSettings.speedControlEnabled);
                    ConfigManager.update('soundEnabled', preHangupSettings.soundEnabled);

                    // 更新功能状态
                    if (preHangupSettings.autoCheckEnabled) {
                        AutoCheck.start();
                    } else {
                        AutoCheck.stop();
                    }

                    if (preHangupSettings.autoPlayEnabled) {
                        AutoPlay.start();
                    } else {
                        AutoPlay.stop();
                    }

                    if (preHangupSettings.autoSkipEnabled) {
                        AutoSkip.start();
                    } else {
                        AutoSkip.stop();
                    }

                    if (preHangupSettings.speedControlEnabled) {
                        SpeedControl.enableSpeedControl();
                    } else {
                        SpeedControl.disableSpeedControl();
                    }
                }

                // 恢复音量
                const lastVolume = ConfigManager.get('lastVolume');
                const videos = document.querySelectorAll('video');
                videos.forEach(video => {
                    video.volume = lastVolume;
                });
                console.log(`已恢复音量至 ${lastVolume}`);
            } catch (e) {
                console.warn('恢复挂机前设置失败:', e);
            }

            console.log('挂机模式已停用');
        },

        // 切换挂机模式状态
        toggle(isEnabled) {
            ConfigManager.update('hangupModeEnabled', isEnabled);
            if (isEnabled) {
                this.activate();
            } else {
                this.deactivate(); // ✅ 必须改成这样
            }

            // 更新UI
            UIHelpers.updateUIStates();
            this.updateOtherButtonsState(isEnabled);
        },

        // 更新其他按钮的状态（在挂机模式下禁用）
        updateOtherButtonsState(isHangupMode) {
            document.querySelectorAll('.toggle-container, #speedUp, #speedDown, #subjectSettingsButton').forEach(el => {
                if (isHangupMode) {
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.6';
                } else {
                    el.style.pointerEvents = '';
                    el.style.opacity = '1';
                }
            });
        }
    };

    /**
     * 统一弹窗模块
     */
    const MessageBox = {
        /**
         * 显示确认弹窗
         * @param {string} title - 标题
         * @param {string} content - 内容，支持HTML
         * @param {function} confirmCallback - 确认回调
         */
        confirm(title, content, confirmCallback) {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.style.zIndex = '9999';

            const dialog = document.createElement('div');
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -45%)';
            dialog.style.background = '#ffffff';
            dialog.style.borderRadius = '12px';
            dialog.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
            dialog.style.width = '360px';
            dialog.style.opacity = '0';
            dialog.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

            setTimeout(() => {
                dialog.style.opacity = '1';
                dialog.style.transform = 'translate(-50%, -50%)';
            }, 10);

            const titleDiv = document.createElement('div');
            titleDiv.style.height = '48px';
            titleDiv.style.lineHeight = '48px';
            titleDiv.style.paddingLeft = '20px';
            titleDiv.style.fontSize = '18px';
            titleDiv.style.fontWeight = 'bold';
            titleDiv.style.color = '#1f2937';
            titleDiv.textContent = title;

            const contentDiv = document.createElement('div');
            contentDiv.style.padding = '20px';
            contentDiv.style.fontSize = '16px';
            contentDiv.style.color = '#4b5563';
            contentDiv.style.lineHeight = '1.5';
            contentDiv.innerHTML = content;

            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.padding = '0 20px 20px';
            buttonsDiv.style.textAlign = 'right';

            const cancelBtn = UIHelpers.createButton('取消', '#6b7280', '#4b5563', () => {});
            cancelBtn.style.marginRight = '12px';
            const confirmBtn = UIHelpers.createButton('确认', '#f97316', '#ea580c', () => {});

            buttonsDiv.appendChild(cancelBtn);
            buttonsDiv.appendChild(confirmBtn);

            dialog.appendChild(titleDiv);
            dialog.appendChild(contentDiv);
            dialog.appendChild(buttonsDiv);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const close = () => {
                dialog.style.opacity = '0';
                dialog.style.transform = 'translate(-50%, -45%)';
                setTimeout(() => overlay.remove(), 300);
            };

            cancelBtn.addEventListener('click', close);
            confirmBtn.addEventListener('click', () => {
                confirmCallback();
                close();
            });
        },

        /**
         * 显示提示弹窗
         * @param {string} title - 标题
         * @param {string} content - 内容，支持HTML
         * @param {function} [closeCallback] - 关闭回调
         */
        alert(title, content, closeCallback = () => {}) {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.style.zIndex = '9999';

            const dialog = document.createElement('div');
            dialog.style.position = 'fixed';
            dialog.style.top = '50%';
            dialog.style.left = '50%';
            dialog.style.transform = 'translate(-50%, -45%)';
            dialog.style.background = '#ffffff';
            dialog.style.borderRadius = '12px';
            dialog.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
            dialog.style.width = '360px';
            dialog.style.opacity = '0';
            dialog.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

            setTimeout(() => {
                dialog.style.opacity = '1';
                dialog.style.transform = 'translate(-50%, -50%)';
            }, 10);

            const titleDiv = document.createElement('div');
            titleDiv.style.height = '48px';
            titleDiv.style.lineHeight = '48px';
            titleDiv.style.paddingLeft = '20px';
            titleDiv.style.fontSize = '18px';
            titleDiv.style.fontWeight = 'bold';
            titleDiv.style.color = '#1f2937';
            titleDiv.textContent = title;

            const contentDiv = document.createElement('div');
            contentDiv.style.padding = '20px';
            contentDiv.style.fontSize = '16px';
            contentDiv.style.color = '#4b5563';
            contentDiv.style.lineHeight = '1.5';
            contentDiv.innerHTML = content;

            const buttonsDiv = document.createElement('div');
            buttonsDiv.style.padding = '0 20px 20px';
            buttonsDiv.style.textAlign = 'right';

            const okBtn = UIHelpers.createButton('确认', '#3b82f6', '#2563eb', () => {});

            buttonsDiv.appendChild(okBtn);

            dialog.appendChild(titleDiv);
            dialog.appendChild(contentDiv);
            dialog.appendChild(buttonsDiv);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const close = () => {
                dialog.style.opacity = '0';
                dialog.style.transform = 'translate(-50%, -45%)';
                setTimeout(() => overlay.remove(), 300);
            };

            okBtn.addEventListener('click', () => {
                closeCallback();
                close();
            });
        }
    };

    /**
     * UI 辅助模块 - 提供创建 UI 元素的公共方法
     */
    const UIHelpers = {
        createStatsArea(isVertical = false) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'statsArea';
            statsDiv.style.display = 'flex';
            statsDiv.style.flexDirection = isVertical ? 'column' : 'row';
            statsDiv.style.alignItems = 'center';
            statsDiv.style.gap = '15px';

            const videoCountDiv = document.createElement('div');
            videoCountDiv.textContent = '累计连播: ';
            const videoSpan = document.createElement('span');
            videoSpan.style.color = '#4CAF50';
            videoSpan.textContent = '0';
            videoCountDiv.appendChild(videoSpan);
            Stats.bindElement('videoPlayCount', videoSpan);

            const checkCountDiv = document.createElement('div');
            checkCountDiv.textContent = '累计过检: ';
            const checkSpan = document.createElement('span');
            checkSpan.style.color = '#2196F3';
            checkSpan.textContent = '0';
            checkCountDiv.appendChild(checkSpan);
            Stats.bindElement('totalCheckCount', checkSpan);

            const skipCountDiv = document.createElement('div');
            skipCountDiv.textContent = '累计跳题: ';
            const skipSpan = document.createElement('span');
            skipSpan.style.color = '#9C27B0';
            skipSpan.textContent = '0';
            skipCountDiv.appendChild(skipSpan);
            Stats.bindElement('skippedQuestionCount', skipSpan);

            const runTimeDiv = document.createElement('div');
            runTimeDiv.textContent = '时长: ';
            const runSpan = document.createElement('span');
            runSpan.textContent = '00:00:00';
            runTimeDiv.appendChild(runSpan);
            Stats.bindElement('runTime', runSpan);

            statsDiv.appendChild(videoCountDiv);
            statsDiv.appendChild(checkCountDiv);
            statsDiv.appendChild(skipCountDiv);
            statsDiv.appendChild(runTimeDiv);

            return statsDiv;
        },

        createSpeedControlArea(isVertical = false) {
            const speedDiv = document.createElement('div');
            speedDiv.id = 'speedControlArea';
            speedDiv.style.display = 'flex';
            speedDiv.style.alignItems = 'center';
            speedDiv.style.gap = '6px';
            speedDiv.style.padding = '0 10px';
            speedDiv.style.borderLeft = '1px solid rgba(255,255,255,0.3)';
            Object.assign(speedDiv.style, {
                display: 'flex',
                alignItems: 'center',     // 垂直居中
                justifyContent: 'center', // 水平居中
                gap: '6px',
                padding: '4px 8px'
            });

            const downBtn = document.createElement('button');
            downBtn.id = 'speedDown';
            downBtn.textContent = '−';
            Object.assign(downBtn.style, {
                width: '20px', height: '20px',
                borderRadius: '4px', border: 'none',
                background: '#555', color: '#fff',
                cursor: 'pointer', lineHeight: 1
            });
            downBtn.onclick = () => SpeedControl.prevSpeed();

            const display = document.createElement('span');
            display.id = 'speedDisplay';
            display.style.color = '#FFEB3B';
            display.style.minWidth = '32px';
            display.style.textAlign = 'center';
            SpeedControl.bindSpeedDisplay(display);

            const upBtn = document.createElement('button');
            upBtn.id = 'speedUp';
            upBtn.textContent = '+';
            Object.assign(upBtn.style, {
                width: '20px', height: '20px',
                borderRadius: '4px', border: 'none',
                background: '#555', color: '#fff',
                cursor: 'pointer', lineHeight: 1
            });
            upBtn.onclick = () => SpeedControl.nextSpeed();

            speedDiv.append(downBtn, display, upBtn);
            return speedDiv;
        },

        createButtonArea(isVertical = false) {
            const buttonsDiv = document.createElement('div');
            buttonsDiv.id = 'buttonArea';
            buttonsDiv.style.display = 'flex';
            buttonsDiv.style.flexDirection = isVertical ? 'column' : 'row';
            buttonsDiv.style.alignItems = 'center';
            buttonsDiv.style.gap = '8px';
            buttonsDiv.style.paddingLeft = '10px';
            buttonsDiv.style.borderLeft = '1px solid rgba(255, 255, 255, 0.3)';

            // 科目设置按钮
            const subjectButton = this.createCardButton('科目设置', '#3b82f6', '#2563eb', () => HangupMode.openSubjectSettings());
            subjectButton.id = 'subjectSettingsButton';
            buttonsDiv.appendChild(subjectButton);

            // 挂机模式按钮
            const hangupEnabled = ConfigManager.get('hangupModeEnabled');
            const hangupButton = this.createCardButton(
                `挂机`,
                ConfigManager.get('hangupModeEnabled') ? '#FF9800' : '#f4a836ff',
                ConfigManager.get('hangupModeEnabled') ? '#f57c00' : '#f4a836ff',
                () => {
                    const isCurrentlyEnabled = ConfigManager.get('hangupModeEnabled');
                    HangupMode.toggle(!isCurrentlyEnabled);
                }
            );
            hangupButton.id = 'hangupButton';
            buttonsDiv.appendChild(hangupButton);

            // 倍速开关
            buttonsDiv.appendChild(this.createToggle('倍速', '#3b82f6', ConfigManager.get('speedControlEnabled'), (enabled) => SpeedControl.toggle(enabled)));

            // 过检开关
            buttonsDiv.appendChild(this.createToggle('过检', '#3b82f6', ConfigManager.get('autoCheckEnabled'), (enabled) => {
                if (ConfigManager.get('hangupModeEnabled')) return;
                AutoCheck.toggle(enabled);
                ConfigManager.update('autoCheckEnabled', enabled);
            }));

            // 连播开关
            buttonsDiv.appendChild(this.createToggle('连播', '#3b82f6', ConfigManager.get('autoPlayEnabled'), (enabled) => {
                if (ConfigManager.get('hangupModeEnabled')) return;
                AutoPlay.toggle(enabled);
                ConfigManager.update('autoPlayEnabled', enabled);
            }));

            // 跳题开关
            buttonsDiv.appendChild(this.createToggle('跳题', '#3b82f6', ConfigManager.get('autoSkipEnabled'), (enabled) => {
                if (ConfigManager.get('hangupModeEnabled')) return;
                AutoSkip.toggle(enabled);
                ConfigManager.update('autoSkipEnabled', enabled);
            }));

            // 提示音开关
            buttonsDiv.appendChild(this.createToggle('提示音', '#3b82f6', ConfigManager.get('soundEnabled'), (enabled) => {
                if (ConfigManager.get('hangupModeEnabled')) return;
                ConfigManager.update('soundEnabled', enabled);
            }));

            return buttonsDiv;
        },

        createCardButton(labelText, color, hoverColor, callback) {
            const button = document.createElement('button');
            button.style.width = '80px';
            button.style.height = '40px';
            button.style.borderRadius = '8px';
            button.style.backgroundColor = color;
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.cursor = 'pointer';
            button.style.display = 'flex';
            button.style.alignItems = 'center';
            button.style.justifyContent = 'center';
            button.style.gap = '4px';
            button.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease';
            button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = labelText;

            button.appendChild(label);

            button.addEventListener('mouseenter', () => {
                button.style.transform = 'scale(1.05)';
                button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                button.style.backgroundColor = hoverColor;
            });
            button.addEventListener('mouseleave', () => {
                button.style.transform = '';
                button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                button.style.backgroundColor = color;
            });
            button.addEventListener('click', callback);

            return button;
        },

        createToggle(labelText, onColor, initialState, toggleCallback) {
            const container = document.createElement('div');
            container.className = 'toggle-container';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.gap = '4px';
            container.style.transition = 'all 0.2s ease';

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = labelText;
            label.style.color = 'white';

            const switchDiv = document.createElement('div');
            switchDiv.className = 'switch';
            switchDiv.style.position = 'relative';
            switchDiv.style.width = '40px';
            switchDiv.style.height = '20px';
            switchDiv.style.backgroundColor = initialState ? onColor : '#d1d5db';
            switchDiv.style.borderRadius = '10px';
            switchDiv.style.cursor = 'pointer';
            switchDiv.style.transition = 'background-color 0.2s ease';

            const slider = document.createElement('div');
            slider.className = 'slider';
            slider.style.position = 'absolute';
            slider.style.width = '18px';
            slider.style.height = '18px';
            slider.style.backgroundColor = '#ffffff';
            slider.style.borderRadius = '50%';
            slider.style.top = '1px';
            slider.style.left = initialState ? '21px' : '1px';
            slider.style.transition = 'left 0.2s ease';

            switchDiv.appendChild(slider);
            container.appendChild(label);
            container.appendChild(switchDiv);

            switchDiv.addEventListener('click', () => {
                const newState = !initialState;
                toggleCallback(newState);
                initialState = newState; // Update local state
                switchDiv.style.backgroundColor = newState ? onColor : '#d1d5db';
                slider.style.left = newState ? '21px' : '1px';
            });

            // Add class for identification
            switchDiv.classList.add(`toggle-${labelText}`);

            return container;
        },

        createButton(text, color, hoverColor, callback) {
            const button = document.createElement('button');
            button.textContent = text;
            button.style.padding = '8px 16px';
            button.style.backgroundColor = color;
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '6px';
            button.style.cursor = 'pointer';
            button.style.transition = 'background-color 0.2s ease';

            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = hoverColor;
            });
            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = color;
            });
            button.addEventListener('click', callback);

            return button;
        },

        updateUIStates() {
            const toggles = [
                { selector: '.toggle-倍速', key: 'speedControlEnabled', color: '#3b82f6' },
                { selector: '.toggle-过检', key: 'autoCheckEnabled', color: '#3b82f6' },
                { selector: '.toggle-连播', key: 'autoPlayEnabled', color: '#3b82f6' },
                { selector: '.toggle-跳题', key: 'autoSkipEnabled', color: '#3b82f6' },
                { selector: '.toggle-提示音', key: 'soundEnabled', color: '#3b82f6' }
            ];

            toggles.forEach(t => {
                document.querySelectorAll(t.selector).forEach(switchDiv => {
                    if (switchDiv) {
                        const enabled = ConfigManager.get(t.key);
                        switchDiv.style.backgroundColor = enabled ? t.color : '#d1d5db';
                        switchDiv.querySelector('.slider').style.left = enabled ? '21px' : '1px';
                    }
                });
            });

            // Update hangup button
            const hangupEnabled = ConfigManager.get('hangupModeEnabled');
            document.querySelectorAll('#hangupButton').forEach(hangupBtn => {
                if (hangupBtn) {
                    hangupBtn.querySelector('.label').textContent = `挂机: ${hangupEnabled ? '开' : '关'}`;
                    hangupBtn.style.backgroundColor = hangupEnabled ? '#FF9800' : '#f4a836ff';
                }
            });
        }
    };

    /**
     * 极简侧边栏模块 - 管理极简模式下的侧边栏
     */
    const SidebarModule = {
        panel: null,
        content: null,
        dragging: false,
        offsetX: 0,
        offsetY: 0,
        rafId: null,

        init() {
            if (this.panel) return;

            // 添加样式
            if (!document.getElementById('ewt-styles')) {
                const style = document.createElement('style');
                style.id = 'ewt-styles';
                style.innerHTML = `
                    #ewt-helper-sidebar.shrunk .label { display: none; }
                    #ewt-helper-sidebar.shrunk #statsArea { display: none; }
                    #ewt-helper-sidebar.shrunk #speedControlArea > span:not(#speedDisplay) { display: none; }
                    #ewt-helper-sidebar.shrunk .toggle-container { justify-content: center; }
                    #ewt-helper-sidebar.shrunk button { width: 40px; height: 40px; justify-content: center; }
                    #ewt-helper-sidebar.shrunk button .label { display: none; }
                `;
                document.head.appendChild(style);
            }

            const panel = document.createElement('div');
            panel.id = 'ewt-helper-sidebar';
            panel.style.position = 'fixed';
            panel.style.top = '0';
            panel.style.right = '0';
            panel.style.height = 'auto';
            panel.style.width = '15vw';
            panel.style.maxHeight = '60vh';
            panel.style.minWidth = '20px';
            panel.style.zIndex = '10000';
            panel.style.backgroundColor = 'rgba(17, 24, 39, 0.9)';
            panel.style.color = 'white';
            panel.style.fontSize = '12px';
            panel.style.borderRadius = '8px 0 0 8px';
            panel.style.transition = 'width 0.2s ease, opacity 0.2s ease';
            panel.style.opacity = Config.panelOpacity;
            panel.addEventListener('mouseenter', () => panel.style.opacity = Config.panelHoverOpacity);
            panel.addEventListener('mouseleave', () => panel.style.opacity = Config.panelOpacity);

            const titleBar = document.createElement('div');
            titleBar.style.height = '30px';
            titleBar.style.lineHeight = '30px';
            titleBar.style.padding = '0 10px';
            titleBar.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            titleBar.style.cursor = 'move';
            titleBar.style.display = 'flex';
            titleBar.style.alignItems = 'center';
            titleBar.style.justifyContent = 'space-between';

            const title = document.createElement('span');
            title.textContent = '升学E网通助手';
            title.style.fontWeight = 'bold';

            const shrinkBtn = document.createElement('button');
            shrinkBtn.textContent = '-';
            shrinkBtn.style.background = 'none';
            shrinkBtn.style.border = 'none';
            shrinkBtn.style.color = 'white';
            shrinkBtn.style.cursor = 'pointer';
            shrinkBtn.addEventListener('click', () => {
                const isShrunk = content.style.display !== 'none';
                content.style.display = isShrunk ? 'none' : 'flex';
                shrinkBtn.textContent = isShrunk ? '+' : '-';
                panel.style.height = isShrunk ? 'auto' : '100vh';
                ConfigManager.update('sidebarShrunk', !isShrunk);
            });

            titleBar.appendChild(title);
            titleBar.appendChild(shrinkBtn);

            const content = document.createElement('div');
            content.style.padding = '10px';
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.alignItems = 'stretch';
            content.style.gap = '15px';

            content.appendChild(UIHelpers.createStatsArea(true));
            content.appendChild(UIHelpers.createSpeedControlArea(true));
            content.appendChild(UIHelpers.createButtonArea(true));

            panel.appendChild(titleBar);
            panel.appendChild(content);

            document.body.appendChild(panel);

            this.panel = panel;
            this.content = content;

            // 设置收缩状态
            if (ConfigManager.get('sidebarShrunk')) {
                this.toggleShrink(true);
            }

            // 设置位置
            let savedPosition = ConfigManager.get('sidebarPosition');
            if (!savedPosition) {
                panel.style.top = '0px';
                panel.style.right = '0px';
                savedPosition = { top: panel.style.top, right: panel.style.right };
                ConfigManager.update('sidebarPosition', savedPosition);
            } else {
                panel.style.top = savedPosition.top;
                panel.style.right = savedPosition.right;
            }

            // 拖拽事件
            titleBar.addEventListener('mousedown', (e) => {
                this.dragging = true;
                const rect = panel.getBoundingClientRect();
                this.offsetX = e.clientX - rect.left;
                this.offsetY = e.clientY - rect.top;
            });

            document.addEventListener('mousemove', (e) => {
                if (!this.dragging) return;
                if (this.rafId) cancelAnimationFrame(this.rafId);
                this.rafId = requestAnimationFrame(() => {
                    let newLeft = e.clientX - this.offsetX;
                    let newTop = e.clientY - this.offsetY;
                    const rect = panel.getBoundingClientRect();
                    const winWidth = document.documentElement.clientWidth;
                    const winHeight = document.documentElement.clientHeight;
                    newLeft = Math.max(10, Math.min(newLeft, winWidth - rect.width - 10));
                    newTop = Math.max(10, Math.min(newTop, winHeight - rect.height - 10));
                    panel.style.left = `${newLeft}px`;
                    panel.style.top = `${newTop}px`;
                    panel.style.right = 'auto';
                });
            });

            document.addEventListener('mouseup', () => {
                if (this.dragging) {
                    this.dragging = false;
                    if (this.rafId) cancelAnimationFrame(this.rafId);
                    ConfigManager.update('sidebarPosition', { top: this.panel.style.top, right: this.panel.style.right });
                }
            });
        },

        toggleShrink(force = null) {
            const shrinkBtn = this.panel.querySelector('button');
            const isShrunk = force !== null ? force : this.panel.classList.contains('shrunk');
            if (isShrunk) {
                this.panel.classList.remove('shrunk');
                this.panel.style.width = '15vw';
                shrinkBtn.textContent = '-';
            } else {
                this.panel.classList.add('shrunk');
                this.panel.style.width = '50px';
                shrinkBtn.textContent = '+';
            }
            ConfigManager.update('sidebarShrunk', !isShrunk);
        },

        show() {
            if (this.panel) this.panel.style.display = 'block';
        },

        hide() {
            if (this.panel) this.panel.style.display = 'none';
        }
    };

    /**
     * 移动端UI模块 - 管理小屏下的浮动按钮和弹出菜单
     */
    const MobileUIModule = {
        button: null,
        popup: null,
        isOpen: false,
        handleOutsideClick: null,
        handleEsc: null,

        init() {
            if (this.button) return;

            // 创建浮动按钮
            this.button = document.createElement('button');
            this.button.style.position = 'fixed';
            this.button.style.bottom = '20px';
            this.button.style.right = '20px';
            this.button.style.width = '48px';
            this.button.style.height = '48px';
            this.button.style.borderRadius = '50%';
            this.button.style.backgroundColor = 'rgba(17,24,39,0.9)';
            this.button.style.color = 'white';
            this.button.style.fontSize = '24px';
            this.button.style.border = 'none';
            this.button.style.cursor = 'pointer';
            this.button.style.zIndex = '10001';
            this.button.style.display = 'none';
            this.button.textContent = '⚙';
            this.button.setAttribute('aria-label', 'Open assistant settings');
            this.button.setAttribute('role', 'button');
            this.button.addEventListener('click', debounce(() => this.togglePopup(), 200));
            document.body.appendChild(this.button);

            // 创建弹出菜单
            this.popup = document.createElement('div');
            this.popup.style.position = 'fixed';
            this.popup.style.bottom = '80px';
            this.popup.style.right = '20px';
            this.popup.style.width = '240px';
            this.popup.style.maxHeight = '70vh';
            this.popup.style.overflowY = 'auto';
            this.popup.style.backgroundColor = 'rgba(17,24,39,0.95)';
            this.popup.style.color = 'white';
            this.popup.style.borderRadius = '8px';
            this.popup.style.padding = '10px';
            this.popup.style.zIndex = '10002';
            this.popup.style.display = 'none';
            this.popup.setAttribute('role', 'menu');
            this.popup.setAttribute('aria-label', 'Settings menu');

            // 构建弹出菜单内容
            const speedControl = UIHelpers.createSpeedControlArea();
            speedControl.style.marginBottom = '10px';

            const buttonArea = UIHelpers.createButtonArea(true);
            buttonArea.style.marginBottom = '10px';
            buttonArea.style.borderLeft = 'none';
            buttonArea.style.paddingLeft = '0';

            const statsArea = UIHelpers.createStatsArea(true);

            this.popup.appendChild(speedControl);
            this.popup.appendChild(buttonArea);
            this.popup.appendChild(statsArea);

            document.body.appendChild(this.popup);

            // 定义事件处理函数
            this.handleOutsideClick = (e) => {
                if (!this.popup.contains(e.target) && e.target !== this.button) {
                    this.closePopup();
                }
            };

            this.handleEsc = (e) => {
                if (e.key === 'Escape') {
                    this.closePopup();
                }
            };
        },

        showButton() {
            if (this.button) this.button.style.display = 'block';
        },

        hideButton() {
            if (this.button) this.button.style.display = 'none';
        },

        openPopup() {
            this.popup.style.display = 'block';
            this.isOpen = true;
            UIHelpers.updateUIStates();
            SpeedControl.updateSpeedControlUI();
            document.addEventListener('click', this.handleOutsideClick);
            document.addEventListener('keydown', this.handleEsc);
        },

        closePopup() {
            this.popup.style.display = 'none';
            this.isOpen = false;
            document.removeEventListener('click', this.handleOutsideClick);
            document.removeEventListener('keydown', this.handleEsc);
        },

        togglePopup() {
            if (this.isOpen) {
                this.closePopup();
            } else {
                this.openPopup();
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
            UIHelpers.updateUIStates();
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
            UIHelpers.updateUIStates();
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

                        // 视频切换后立即更新科目信息
                        SubjectInfo.checkCurrentSubject();

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
            UIHelpers.updateUIStates();
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
            // 检查是否启用提示音
            if (!ConfigManager.get('soundEnabled')) return;

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
     * 响应式处理模块
     */
    const ResponsiveHandler = {
        currentMode: null,

        init() {
            this.checkWidth();
            window.addEventListener('resize', () => this.checkWidth());
        },

        checkWidth() {
            const width = window.innerWidth;
            if (width <= 768) {
                if (this.currentMode !== 'mobile') {
                    SidebarModule.hide();
                    MobileUIModule.showButton();
                    this.currentMode = 'mobile';
                }
            } else {
                if (this.currentMode !== 'mobile') {
                    MobileUIModule.hideButton();
                    MobileUIModule.closePopup();
                    SidebarModule.show();
                    this.currentMode = 'desktop';
                }
            }
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

            // 初始化 UI 模块
            SidebarModule.init();
            MobileUIModule.init();

            // 初始化防干扰和倍速控制
            AntiInterference.init();
            SpeedControl.init();

            // 启动科目信息检查（内部使用，不显示）
            SubjectInfo.start();

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

            // 如果挂机模式是开启状态，则激活挂机模式
            if (ConfigManager.get('hangupModeEnabled')) {
                HangupMode.activate();
            } else {
                HangupMode.stop();
            }

            this.runTimeIntervalId = setInterval(() => {
                Stats.updateRunTime();
            }, 1000);

            // 初始化响应式处理
            ResponsiveHandler.init();

            // 更新 UI 状态
            UIHelpers.updateUIStates();
            HangupMode.updateOtherButtonsState(ConfigManager.get('hangupModeEnabled'));

            console.log('升学E网通助手（增强版）已启动');
        },

        stop() {
            AutoCheck.stop();
            AutoPlay.stop();
            AutoSkip.stop();
            SubjectInfo.stop();
            HangupMode.stop(); // 停止挂机模式

            // 停止倍速自动重应用并恢复原始控制
            SpeedControl.disableSpeedControl();

            if (this.runTimeIntervalId) {
                clearInterval(this.runTimeIntervalId);
                this.runTimeIntervalId = null;
            }

            SidebarModule.hide();
            MobileUIModule.hideButton();
            MobileUIModule.closePopup();

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

