// ==UserScript==
// @name         升学E网通助手（增强版）
// @namespace    https://www.yuzu-soft.com/products.html
// @version      2.0.6
// @description  自动通过随机检查、自动播放下一视频、自动跳题，精准识别并处理date参数
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       仅供学习交流，严禁用于商业用途，请于24小时内删除
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 配置管理模块
     */
    const ConfigManager = {
        defaultConfig: {
            speed: 1,
            autoCheckEnabled: true,
            autoPlayEnabled: true,
            autoSkipEnabled: true,
            speedControlEnabled: true,
            mode: 'normal',
            hangupModeEnabled: false,
            lastVolume: 1
        },

        config: {},

        init() {
            try {
                const savedConfig = localStorage.getItem('ewtHelperConfig');
                this.config = savedConfig ? { ...this.defaultConfig, ...JSON.parse(savedConfig) } : { ...this.defaultConfig };
            } catch (e) {
                console.warn('无法读取配置:', e);
                this.config = { ...this.defaultConfig };
            }
            return this.config;
        },

        save() {
            try {
                localStorage.setItem('ewtHelperConfig', JSON.stringify(this.config));
            } catch (e) {
                console.warn('无法保存配置:', e);
            }
        },

        update(key, value) {
            if (Object.keys(this.defaultConfig).includes(key)) {
                this.config[key] = value;
                this.save();
            } else {
                console.warn(`未知配置项: ${key}`);
            }
        },

        get(key) {
            return this.config[key];
        }
    };

    /**
     * 配置参数
     */
    const Config = {
        checkInterval: 1000,
        rewatchInterval: 1000,
        skipQuestionInterval: 1000,
        speedReapplyInterval: 1000,
        subjectCheckInterval: 1000,
        hangupCheckInterval: 1000,
        playCheckInterval: 500,
        panelOpacity: 0.9,
        panelHoverOpacity: 1.0,
        targetHashPath: '#/homework/',
        hangupSkipSubjects: ['语文', '英语', '数学', '历史', '政治', '生物', '地理', '物理', '化学'],
        redirectDelay: 3000,      // 跳转等待时间（毫秒）
        dateParamIncrement: 86400000 // date参数增加值（24小时的毫秒数）
    };

    /**
     * 统计模块
     */
    const Stats = {
        data: {
            videoPlayCount: 0,
            totalCheckCount: 0,
            skippedQuestionCount: 0,
            skippedVideoCount: 0,
            redirectCount: 0,
            startTime: new Date(),
            runTime: '00:00:00',
            currentSubject: '未播放'
        },

        updateDisplay() {
            document.getElementById('videoCount').textContent = this.data.videoPlayCount;
            document.getElementById('totalCheckCount').textContent = this.data.totalCheckCount;
            document.getElementById('skippedQuestionCount').textContent = this.data.skippedQuestionCount;
            document.getElementById('redirectCount').textContent = this.data.redirectCount;
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

        updateSubject(subject) {
            if (subject && subject !== this.data.currentSubject) {
                this.data.currentSubject = subject;
            }
        }
    };

    /**
     * 防干扰模块
     */
    const AntiInterference = {
        originalProperties: new Map(),

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
            if (this.originalProperties.has(video)) return;

            const originalPlaybackRate = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            const originalAddEventListener = video.addEventListener;
            const originalRemoveEventListener = video.removeEventListener;

            this.originalProperties.set(video, {
                playbackRate: originalPlaybackRate,
                addEventListener: originalAddEventListener,
                removeEventListener: originalRemoveEventListener
            });

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
        },

        restoreVideo(video) {
            if (!this.originalProperties.has(video)) return;

            const originals = this.originalProperties.get(video);
            Object.defineProperty(video, 'playbackRate', originals.playbackRate);
            video.addEventListener = originals.addEventListener;
            video.removeEventListener = originals.removeEventListener;
            this.originalProperties.delete(video);
        },

        restoreAllVideos() {
            this.originalProperties.forEach((_, video) => {
                this.restoreVideo(video);
            });
        },

        reProxyAllVideos() {
            this.restoreAllVideos();
            this.proxyVideoElements();
        }
    };

    /**
     * 倍速控制模块
     */
    const SpeedControl = {
        speeds: [1, 1.25, 1.5, 1.75, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16],
        currentSpeed: 1,
        reapplyIntervalId: null,
        isEnabled: true,
        preHangupSpeed: 1,

        init() {
            const savedSpeed = ConfigManager.get('speed');
            this.isEnabled = ConfigManager.get('speedControlEnabled');

            if (this.speeds.includes(savedSpeed)) {
                this.currentSpeed = savedSpeed;
                this.preHangupSpeed = savedSpeed;
            }

            if (this.isEnabled) {
                this.startReapply();
            } else {
                this.disableSpeedControl();
            }

            this.updateSpeedControlUI();
        },

        startReapply() {
            if (this.reapplyIntervalId) return;
            this.reapplyIntervalId = setInterval(() => {
                this.reapplySpeed();
            }, Config.speedReapplyInterval);
        },

        stopReapply() {
            if (this.reapplyIntervalId) {
                clearInterval(this.reapplyIntervalId);
                this.reapplyIntervalId = null;
            }
        },

        toggle(isEnabled) {
            if (ConfigManager.get('hangupModeEnabled')) return;
            
            this.isEnabled = isEnabled;

            if (isEnabled) {
                this.enableSpeedControl();
            } else {
                this.disableSpeedControl();
            }

            ConfigManager.update('speedControlEnabled', isEnabled);
            this.updateSpeedControlUI();
        },

        enableSpeedControl() {
            AntiInterference.reProxyAllVideos();
            this.setSpeed(this.currentSpeed);
            this.startReapply();
        },

        disableSpeedControl() {
            this.stopReapply();
            AntiInterference.restoreAllVideos();
            this.resetToNormalSpeed();
        },

        resetToNormalSpeed() {
            try {
                document.querySelectorAll('video').forEach(video => {
                    video.playbackRate = 1;
                });
            } catch (error) {
                console.error('重置速度失败:', error);
            }
        },

        updateSpeedControlUI() {
            const speedControlArea = document.getElementById('speedControlArea');
            if (speedControlArea) {
                speedControlArea.style.display = this.isEnabled ? 'flex' : 'none';
            }
        },

        reapplySpeed() {
            if (!this.isEnabled) return;
            
            const targetSpeed = ConfigManager.get('hangupModeEnabled') ? 1.0 : this.currentSpeed;
            
            try {
                document.querySelectorAll('video').forEach(video => {
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
            if (ConfigManager.get('hangupModeEnabled')) return;
            if (!this.isEnabled) return;

            try {
                document.querySelectorAll('video').forEach(video => {
                    video.playbackRate = speed;
                });
                this.currentSpeed = speed;
                this.preHangupSpeed = speed;
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
            if (ConfigManager.get('hangupModeEnabled')) return;
            if (!this.isEnabled) return;

            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const nextIndex = (currentIndex + 1) % this.speeds.length;
            this.setSpeed(this.speeds[nextIndex]);
        },

        prevSpeed() {
            if (ConfigManager.get('hangupModeEnabled')) return;
            if (!this.isEnabled) return;

            const currentIndex = this.speeds.indexOf(this.currentSpeed);
            const prevIndex = (currentIndex - 1 + this.speeds.length) % this.speeds.length;
            this.setSpeed(this.speeds[prevIndex]);
        },
        
        activateHangupMode() {
            this.preHangupSpeed = this.currentSpeed;
            this.setSpeed(1.0);
        },
        
        deactivateHangupMode() {
            this.setSpeed(this.preHangupSpeed);
        }
    };

    /**
     * 模式控制模块
     */
    const ModeControl = {
        currentMode: 'normal',

        init() {
            this.currentMode = ConfigManager.get('mode');
            this.applyMode();
        },

        toggleMode() {
            this.currentMode = this.currentMode === 'normal' ? 'minimal' : 'normal';
            ConfigManager.update('mode', this.currentMode);
            this.applyMode();
        },

        applyMode() {
            const statsArea = document.getElementById('statsArea');
            const speedControlArea = document.getElementById('speedControlArea');
            const modeButton = document.getElementById('modeToggleButton');

            if (this.currentMode === 'minimal') {
                if (statsArea) statsArea.style.display = 'none';
                if (modeButton) modeButton.textContent = '极简';
            } else {
                if (statsArea) statsArea.style.display = 'flex';
                if (modeButton) modeButton.textContent = '普通';
            }

            if (speedControlArea) {
                speedControlArea.style.display = SpeedControl.isEnabled ? 'flex' : 'none';
            }
        }
    };

    /**
     * 科目信息模块
     */
    const SubjectInfo = {
        intervalId: null,

        start() {
            if (this.intervalId) return;

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

                const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                if (!activeVideo) {
                    Stats.updateSubject('未播放');
                    return;
                }

                const subjectElement = activeVideo.querySelector('.left-SRI55');
                if (subjectElement) {
                    Stats.updateSubject(subjectElement.textContent.trim());
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
        lastVolume: 1,
        
        start() {
            if (this.intervalId) return;
            
            this.intervalId = setInterval(() => {
                this.checkAndSkipSubjectVideos();
            }, Config.hangupCheckInterval);
            
            this.playCheckIntervalId = setInterval(() => {
                this.checkPlayState();
            }, Config.playCheckInterval);
        },
        
        stop() {
            if (this.intervalId) clearInterval(this.intervalId);
            if (this.playCheckIntervalId) clearInterval(this.playCheckIntervalId);
            this.intervalId = null;
            this.playCheckIntervalId = null;
        },
        
        checkPlayState() {
            if (!ConfigManager.get('hangupModeEnabled')) return;
            
            try {
                document.querySelectorAll('video').forEach(video => {
                    if (video.readyState > 0 && video.paused) {
                        console.log('挂机模式：检测到视频暂停，自动继续播放');
                        video.play().catch(e => {
                            console.log('挂机模式：自动播放失败，尝试点击播放按钮', e);
                            this.clickPlayButton();
                        });
                    }
                    
                    if (video.volume !== 0) {
                        video.volume = 0;
                        console.log('挂机模式：已将音量设置为0');
                    }
                });
            } catch (error) {
                console.error('挂机模式检查播放状态出错:', error);
            }
        },
        
        clickPlayButton() {
            try {
                const playButtons = document.querySelectorAll(
                    '.play-button, .video-play-btn, .icon-play, [class*="play"]'
                );
                
                playButtons.forEach(button => {
                    if (button && !button.disabled) {
                        button.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }));
                        console.log('挂机模式：已尝试点击播放按钮');
                    }
                });
            } catch (error) {
                console.error('挂机模式点击播放按钮出错:', error);
            }
        },
        
        checkAndSkipSubjectVideos() {
            if (!ConfigManager.get('hangupModeEnabled')) return;
            
            try {
                const currentSubject = Stats.data.currentSubject;
                const videoListContainer = document.querySelector('.listCon-N9Rlm');
                
                if (!videoListContainer || currentSubject === '未播放' || currentSubject === '未知科目') {
                    return;
                }
                
                if (Config.hangupSkipSubjects.includes(currentSubject)) {
                    console.log(`挂机模式：检测到${currentSubject}视频，准备跳过`);
                    
                    const activeVideo = videoListContainer.querySelector('.item-IPNWw.active-1MWMf');
                    if (!activeVideo) return;
                    
                    let nextVideo = activeVideo.nextElementSibling;
                    while (nextVideo) {
                        if (nextVideo.classList.contains('item-IPNWw')) {
                            nextVideo.dispatchEvent(new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            }));
                            
                            Stats.data.skippedVideoCount++;
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
        
        activate() {
            const currentSettings = {
                speed: SpeedControl.currentSpeed,
                autoCheckEnabled: ConfigManager.get('autoCheckEnabled'),
                autoPlayEnabled: ConfigManager.get('autoPlayEnabled'),
                autoSkipEnabled: ConfigManager.get('autoSkipEnabled'),
                speedControlEnabled: ConfigManager.get('speedControlEnabled')
            };
            
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                this.lastVolume = videos[0].volume;
                ConfigManager.update('lastVolume', this.lastVolume);
            }
            
            localStorage.setItem('ewtPreHangupSettings', JSON.stringify(currentSettings));
            
            SpeedControl.activateHangupMode();
            ConfigManager.update('autoCheckEnabled', true);
            ConfigManager.update('autoPlayEnabled', true);
            ConfigManager.update('autoSkipEnabled', true);
            ConfigManager.update('speedControlEnabled', false);
            
            AutoCheck.start();
            AutoPlay.start();
            AutoSkip.start();
            SpeedControl.disableSpeedControl();
            
            videos.forEach(video => {
                video.volume = 0;
            });
            
            this.start();
            console.log('挂机模式已激活');
        },
        
        deactivate() {
            this.stop();
            
            try {
                const preHangupSettings = JSON.parse(localStorage.getItem('ewtPreHangupSettings'));
                if (preHangupSettings) {
                    SpeedControl.deactivateHangupMode();
                    
                    ConfigManager.update('autoCheckEnabled', preHangupSettings.autoCheckEnabled);
                    ConfigManager.update('autoPlayEnabled', preHangupSettings.autoPlayEnabled);
                    ConfigManager.update('autoSkipEnabled', preHangupSettings.autoSkipEnabled);
                    ConfigManager.update('speedControlEnabled', preHangupSettings.speedControlEnabled);
                    
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
                
                const lastVolume = ConfigManager.get('lastVolume');
                document.querySelectorAll('video').forEach(video => {
                    video.volume = lastVolume;
                });
                console.log(`已恢复音量至 ${lastVolume}`);
            } catch (e) {
                console.warn('恢复挂机前设置失败:', e);
            }
            
            console.log('挂机模式已停用');
        },
        
        toggle(isEnabled) {
            ConfigManager.update('hangupModeEnabled', isEnabled);
            
            if (isEnabled) {
                this.activate();
            } else {
                this.deactivate();
            }
            
            const hangupButton = document.getElementById('hangupButton');
            if (hangupButton) {
                hangupButton.textContent = `挂机: ${isEnabled ? '开' : '关'}`;
                hangupButton.style.backgroundColor = isEnabled ? '#FF9800' : '#f44336';
            }
            
            this.updateOtherButtonsState(isEnabled);
        },
        
        updateOtherButtonsState(isHangupMode) {
            const buttons = [
                document.querySelector('[textContent="过检: 开"], [textContent="过检: 关"]'),
                document.querySelector('[textContent="连播: 开"], [textContent="连播: 关"]'),
                document.querySelector('[textContent="跳题: 开"], [textContent="跳题: 关"]'),
                document.querySelector('[textContent="倍速: 开"], [textContent="倍速: 关"]'),
                document.getElementById('speedUp'),
                document.getElementById('speedDown')
            ];
            
            buttons.forEach(button => {
                if (button) {
                    button.disabled = isHangupMode;
                    button.style.opacity = isHangupMode ? '0.6' : '1';
                    button.style.cursor = isHangupMode ? 'not-allowed' : 'pointer';
                }
            });
        }
    };

    /**
     * URL处理模块 - 精准定位并处理hash中的date参数
     */
    const URLHandler = {
        /**
         * 处理URL中hash部分的date参数，增加86400000后刷新页面
         * 仅处理一次，刷新后由页面重新加载逻辑接管
         */
        incrementDateParamAndRefresh() {
            try {
                const currentUrl = window.location.href;
                console.log(`[URL处理] 连播结束：当前URL为 ${currentUrl}`);
                
                // 分离URL的基础部分和hash部分
                const [baseUrl, hashPart] = currentUrl.split('#');
                if (!hashPart) {
                    console.log('[URL处理] URL中未找到hash部分，无法进行刷新');
                    return false;
                }
                
                // 查找hash部分中的date参数
                const dateParamRegex = /(date=)(\d+)/;
                const match = hashPart.match(dateParamRegex);
                
                if (!match) {
                    console.log('[URL处理] 在hash部分未找到date参数，无法进行刷新');
                    return false;
                }
                
                // 提取参数名和当前值
                const paramName = match[1]; // "date="
                const currentDateValue = parseInt(match[2], 10);
                const incrementValue = Config.dateParamIncrement;
                const newDateValue = currentDateValue + incrementValue;
                
                // 记录参数变化
                console.log(`[URL处理] date参数变化: ${currentDateValue} + ${incrementValue} = ${newDateValue}`);
                
                // 替换hash部分中的date参数值
                const newHashPart = hashPart.replace(dateParamRegex, `${paramName}${newDateValue}`);
                const newUrl = `${baseUrl}#${newHashPart}`;
                console.log(`[URL处理] ${Config.redirectDelay/1000}秒后将刷新至: ${newUrl}`);
                
                // 更新统计信息
                Stats.data.redirectCount++;
                Stats.updateDisplay();
                
                // 播放提示音
                Utils.playSound('next');
                
                // 创建刷新提示
                this.showRefreshMessage(newDateValue);
                
                // 等待指定时间后更新URL并刷新页面
                setTimeout(() => {
                    console.log(`[URL处理] 执行刷新至: ${newUrl}`);
                    // 先更新当前URL的hash部分（不跳转）
                    window.location.hash = newHashPart;
                    // 再刷新页面，使新参数生效
                    window.location.reload();
                }, Config.redirectDelay);
                
                return true;
            } catch (error) {
                console.error('[URL处理] 处理URL刷新时出错:', error);
                return false;
            }
        },
        
        /**
         * 显示包含精确date参数信息的刷新提示
         */
        showRefreshMessage(newDateValue) {
            // 移除已存在的提示
            const existingNotice = document.getElementById('redirect-notice');
            if (existingNotice) {
                existingNotice.remove();
            }
            
            // 创建提示元素
            const notice = document.createElement('div');
            notice.id = 'redirect-notice';
            notice.style.position = 'fixed';
            notice.style.top = '50%';
            notice.style.left = '50%';
            notice.style.transform = 'translate(-50%, -50%)';
            notice.style.zIndex = '99999';
            notice.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            notice.style.color = 'white';
            notice.style.padding = '20px 30px';
            notice.style.borderRadius = '8px';
            notice.style.fontSize = '16px';
            notice.style.textAlign = 'center';
            notice.style.maxWidth = '90%';
            
            // 格式化日期显示（便于用户理解）
            const date = new Date(newDateValue);
            const formattedDate = date.toLocaleString();
            
            // 显示倒计时和date参数信息
            let seconds = Config.redirectDelay / 1000;
            notice.innerHTML = `
                <div>当前视频列表已播放完毕</div>
                <div>date参数已更新为: <strong>${newDateValue}</strong></div>
                <div>对应日期: ${formattedDate}</div>
                <div>${seconds}秒后自动刷新...</div>
            `;
            
            document.body.appendChild(notice);
            
            // 更新倒计时
            const countdownInterval = setInterval(() => {
                seconds--;
                notice.querySelector('div:last-child').textContent = 
                    `${seconds}秒后自动刷新...`;
                
                if (seconds <= 0) {
                    clearInterval(countdownInterval);
                }
            }, 1000);
        }
    };

    /**
     * UI模块
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

            ModeControl.applyMode();
            SpeedControl.updateSpeedControlUI();
            
            const isHangupMode = ConfigManager.get('hangupModeEnabled');
            HangupMode.updateOtherButtonsState(isHangupMode);

            return panel;
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
                <div>累计跳转: <span id="redirectCount" style="color:#FF9800">0</span></div>
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

            const modeButton = this.createModeButton();
            buttonsDiv.appendChild(modeButton);

            buttonsDiv.appendChild(this.createHangupButton());

            buttonsDiv.appendChild(this.createFunctionButton(
                '倍速',
                ConfigManager.get('speedControlEnabled'),
                (isEnabled) => {
                    SpeedControl.toggle(isEnabled);
                    ModeControl.applyMode();
                }
            ));

            buttonsDiv.appendChild(this.createFunctionButton(
                '过检',
                ConfigManager.get('autoCheckEnabled'),
                (isEnabled) => {
                    if (ConfigManager.get('hangupModeEnabled')) return;
                    AutoCheck.toggle(isEnabled);
                    ConfigManager.update('autoCheckEnabled', isEnabled);
                }
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '连播',
                ConfigManager.get('autoPlayEnabled'),
                (isEnabled) => {
                    if (ConfigManager.get('hangupModeEnabled')) return;
                    AutoPlay.toggle(isEnabled);
                    ConfigManager.update('autoPlayEnabled', isEnabled);
                }
            ));
            buttonsDiv.appendChild(this.createFunctionButton(
                '跳题',
                ConfigManager.get('autoSkipEnabled'),
                (isEnabled) => {
                    if (ConfigManager.get('hangupModeEnabled')) return;
                    AutoSkip.toggle(isEnabled);
                    ConfigManager.update('autoSkipEnabled', isEnabled);
                }
            ));

            return buttonsDiv;
        },
        
        createHangupButton() {
            const button = document.createElement('button');
            button.id = 'hangupButton';
            const isEnabled = ConfigManager.get('hangupModeEnabled');
            
            button.textContent = `挂机: ${isEnabled ? '开' : '关'}`;
            button.style.padding = '3px 8px';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '12px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';
            button.style.backgroundColor = isEnabled ? '#FF9800' : '#f44336';

            button.addEventListener('click', () => {
                const newState = !ConfigManager.get('hangupModeEnabled');
                HangupMode.toggle(newState);
                ConfigManager.update('hangupModeEnabled', newState);
            });

            return button;
        },

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
                document.querySelectorAll('span.btn-3LStS').forEach(button => {
                    if (button.textContent.trim() === '点击通过检查') {
                        button.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }));

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

                // 查找下一个视频
                let nextVideo = activeVideo.nextElementSibling;
                let foundNextVideo = false;
                
                while (nextVideo) {
                    if (nextVideo.classList.contains('item-IPNWw')) {
                        nextVideo.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }));

                        Stats.data.videoPlayCount++;
                        Stats.updateDisplay();
                        SubjectInfo.checkCurrentSubject();
                        Utils.playSound('next');
                        foundNextVideo = true;
                        break;
                    }
                    nextVideo = nextVideo.nextElementSibling;
                }
                
                // 如果没有找到下一个视频，执行URL刷新
                if (!foundNextVideo) {
                    console.log('未找到下一个视频，准备执行URL刷新');
                    // 修复：使用重命名后的方法
                    URLHandler.incrementDateParamAndRefresh();
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
                    targetButton.dispatchEvent(new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }));

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
                console.log('当前页面不是作业页面，脚本未启动');
                return;
            }

            ConfigManager.init();
            ModeControl.init();
            UI.createControlPanel();
            AntiInterference.init();
            SpeedControl.init();
            SubjectInfo.start();

            if (ConfigManager.get('autoCheckEnabled')) {
                AutoCheck.start();
            }
            if (ConfigManager.get('autoPlayEnabled')) {
                AutoPlay.start();
            }
            if (ConfigManager.get('autoSkipEnabled')) {
                AutoSkip.start();
            }
            
            if (ConfigManager.get('hangupModeEnabled')) {
                HangupMode.activate();
            } else {
                HangupMode.stop();
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
            SubjectInfo.stop();
            HangupMode.stop();
            SpeedControl.disableSpeedControl();

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