// ==UserScript==
// @name         升学E网通助手 v2 Lite
// @namespace    https://github.com/ZNink/EWT360-Helper
// @version      2.1.0
// @description  用于帮助学生通过升学E网通更好学习知识(雾)
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        http://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       ZNink
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @supportURL   https://github.com/ZNink/EWT360-Helper/issues
// ==/UserScript==

/**
 * 调试日志工具模块 - 新增
 * 提供分级、带时间戳的日志输出，方便调试
 */
const DebugLogger = {
    // 新增：日志总开关，true 开启输出，false 关闭输出
    enabled: false,

    // 获取格式化时间戳
    getTimestamp() {
        const now = new Date();
        return `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}]`;
    },

    // 普通日志
    log(module, message, data = null) {
        // 检查开关是否开启
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [INFO] ${message}`;
        if (data) {
            console.log(logMsg, data);
        } else {
            console.log(logMsg);
        }
    },

    // 警告日志
    warn(module, message, data = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [WARN] ${message}`;
        if (data) {
            console.warn(logMsg, data);
        } else {
            console.warn(logMsg);
        }
    },

    // 错误日志
    error(module, message, error = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [ERROR] ${message}`;
        if (error) {
            console.error(logMsg, error);
        } else {
            console.error(logMsg);
        }
    },

    // 调试日志（更详细）
    debug(module, message, data = null) {
        if (!this.enabled) return;
        const logMsg = `${this.getTimestamp()} [${module}] [DEBUG] ${message}`;
        if (data) {
            console.debug(logMsg, data);
        } else {
            console.debug(logMsg);
        }
    },
};

/**
 * 配置常量
 */
const Config = {
    skipQuestionInterval: 1000, // 跳题检查间隔(ms)
    rewatchInterval: 2000,      // 连播检查间隔(ms)
    checkPassInterval: 1500,    // 过检检查间隔(ms)
    speedCheckInterval: 3000    // 倍速检查间隔(ms)
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
        if (this.intervalId) {
            DebugLogger.debug('AutoSkip', '自动跳题已在运行，无需重复启动');
            return;
        }

        this.intervalId = setInterval(() => {
            this.checkAndSkip();
        }, Config.skipQuestionInterval);
        DebugLogger.log('AutoSkip', '自动跳题已开启，检查间隔：' + Config.skipQuestionInterval + 'ms');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('AutoSkip', '自动跳题已关闭');
        } else {
            DebugLogger.debug('AutoSkip', '自动跳题未运行，无需停止');
        }
    },

    checkAndSkip() {
        try {
            DebugLogger.debug('AutoSkip', '开始检查是否有可跳过的题目');

            const skipTexts = ['跳过', '跳题', '跳过题目', '暂不回答', '以后再说', '跳过本题'];
            let targetButton = null;

            skipTexts.some(text => {
                // 调试日志：当前检查的文本
                DebugLogger.debug('AutoSkip', `查找包含文本"${text}"的按钮`);

                const buttons = document.querySelectorAll('button, a, span.btn, div.btn');
                DebugLogger.debug('AutoSkip', `找到按钮总数：${buttons.length}`);

                for (const btn of buttons) {
                    const btnText = btn.textContent.trim();
                    if (btnText === text) {
                        targetButton = btn;
                        DebugLogger.debug('AutoSkip', `通过CSS选择器找到目标按钮，文本：${btnText}`, btn);
                        return true;
                    }
                }

                if (!targetButton) {
                    DebugLogger.debug('AutoSkip', `CSS选择器未找到，尝试XPath查找文本"${text}"`);
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
                        DebugLogger.debug('AutoSkip', `通过XPath找到目标元素`, element);
                        return true;
                    }
                }
                return false;
            });

            if (targetButton) {
                // 检查是否已点击过
                if (targetButton.dataset.skipClicked) {
                    DebugLogger.debug('AutoSkip', '目标按钮已标记为已点击，跳过本次操作', targetButton);
                    return;
                }

                // 标记为已点击
                targetButton.dataset.skipClicked = 'true';
                DebugLogger.debug('AutoSkip', '标记按钮为已点击，防止重复操作');

                // 模拟点击
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                targetButton.dispatchEvent(clickEvent);
                DebugLogger.log('AutoSkip', '已自动跳过题目，按钮文本：' + targetButton.textContent.trim(), targetButton);

                // 5秒后清除标记
                setTimeout(() => {
                    delete targetButton.dataset.skipClicked;
                    DebugLogger.debug('AutoSkip', '清除按钮点击标记', targetButton);
                }, 5000);
            } else {
                DebugLogger.debug('AutoSkip', '未找到可跳过的按钮');
            }
        } catch (error) {
            DebugLogger.error('AutoSkip', '自动跳题功能出错', error);
        }
    }
};


/**
 * 自动连播模块
 * 已修复：适配实际页面结构，修正选择器
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
        if (this.intervalId) {
            DebugLogger.debug('AutoPlay', '自动连播已在运行，无需重复启动');
            return;
        }

        this.intervalId = setInterval(() => {
            this.checkAndSwitch();
        }, Config.rewatchInterval);
        DebugLogger.log('AutoPlay', '自动连播已开启，检查间隔：' + Config.rewatchInterval + 'ms');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('AutoPlay', '自动连播已关闭');
        } else {
            DebugLogger.debug('AutoPlay', '自动连播未运行，无需停止');
        }
    },

    checkAndSwitch() {
        try {
            DebugLogger.debug('AutoPlay', '开始检查是否需要切换视频');

            // 1. 检测特定图片元素作为连播触发条件
            const progressImage = document.querySelector('img.progress-img-vkUYM[src="//file.ewt360.com/file/1820894120067424424"]');
            if (!progressImage) {
                DebugLogger.debug('AutoPlay', '未检测到连播触发图片，不执行切换');
                return;
            }
            DebugLogger.debug('AutoPlay', '检测到连播触发图片', progressImage);

            // 2. 获取视频列表容器（根据提供的页面结构修正）
            const videoListContainer = document.querySelector('.listCon-zrsBh');
            if (!videoListContainer) {
                DebugLogger.warn('AutoPlay', '未找到视频列表容器');
                return;
            }
            DebugLogger.debug('AutoPlay', '找到视频列表容器', videoListContainer);

            // 3. 查找当前活跃视频（根据提供的页面结构，活跃视频有active-EI2Hl类）
            const activeVideo = videoListContainer.querySelector('.item-blpma.active-EI2Hl');
            if (!activeVideo) {
                DebugLogger.warn('AutoPlay', '未找到当前活跃视频');
                return;
            }
            const activeVideoTitle = activeVideo.querySelector('.lessontitle-G206y')?.textContent || '未知标题';
            DebugLogger.log('AutoPlay', '找到当前活跃视频: ' + activeVideoTitle, activeVideo);

            // 4. 查找下一个视频项
            let nextVideo = activeVideo.nextElementSibling;
            let foundNextVideo = false;

            while (nextVideo) {
                DebugLogger.debug('AutoPlay', '检查下一个视频项', nextVideo);

                // 检查是否为视频项且未完成
                if (nextVideo.classList.contains('item-blpma') &&
                    !nextVideo.querySelector('.finished-PsNX9')) {

                    const nextVideoTitle = nextVideo.querySelector('.lessontitle-G206y')?.textContent || '未知标题';
                    DebugLogger.log('AutoPlay', '找到下一个可播放视频: ' + nextVideoTitle, nextVideo);

                    // 触发点击事件
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    nextVideo.dispatchEvent(clickEvent);
                    DebugLogger.log('AutoPlay', '已自动切换到下一个视频: ' + nextVideoTitle);

                    // 视频切换后更新科目信息
                    if (SubjectInfo && typeof SubjectInfo.checkCurrentSubject === 'function') {
                        DebugLogger.debug('AutoPlay', '调用SubjectInfo.checkCurrentSubject()更新科目信息');
                        SubjectInfo.checkCurrentSubject();
                    }

                    foundNextVideo = true;
                    break;
                }
                nextVideo = nextVideo.nextElementSibling;
            }

            if (!foundNextVideo) {
                DebugLogger.log('AutoPlay', '未找到可播放的下一个视频');
            }
        } catch (error) {
            DebugLogger.error('AutoPlay', '自动连播功能出错', error);
        }
    }
};

/**
 * 过检模块 - 自动点击"点击通过检查"按钮
 */
const AutoCheckPass = {
    intervalId: null,

    toggle(isEnabled) {
        if (isEnabled) {
            this.start();
        } else {
            this.stop();
        }
    },

    start() {
        if (this.intervalId) {
            DebugLogger.debug('AutoCheckPass', '自动过检已在运行，无需重复启动');
            return;
        }

        this.intervalId = setInterval(() => {
            this.checkAndClick();
        }, Config.checkPassInterval);
        DebugLogger.log('AutoCheckPass', '过检功能已开启，检查间隔：' + Config.checkPassInterval + 'ms');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('AutoCheckPass', '过检功能已关闭');
        } else {
            DebugLogger.debug('AutoCheckPass', '自动过检未运行，无需停止');
        }
    },

    checkAndClick() {
        try {
            DebugLogger.debug('AutoCheckPass', '开始检查是否有过检按钮');

            // 查找"点击通过检查"按钮
            const checkButton = document.querySelector('span.btn-DOCWn');

            if (checkButton) {
                const buttonText = checkButton.textContent.trim();
                DebugLogger.debug('AutoCheckPass', '找到过检按钮，文本：' + buttonText, checkButton);

                if (buttonText === '点击通过检查') {
                    // 防止重复点击
                    if (checkButton.dataset.checkClicked) {
                        DebugLogger.debug('AutoCheckPass', '过检按钮已标记为已点击，跳过本次操作');
                        return;
                    }

                    checkButton.dataset.checkClicked = 'true';
                    DebugLogger.debug('AutoCheckPass', '标记过检按钮为已点击');

                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    checkButton.dispatchEvent(clickEvent);
                    DebugLogger.log('AutoCheckPass', '已自动通过检查', checkButton);

                    setTimeout(() => {
                        delete checkButton.dataset.checkClicked;
                        DebugLogger.debug('AutoCheckPass', '清除过检按钮点击标记');
                    }, 3000);
                } else {
                    DebugLogger.debug('AutoCheckPass', '按钮文本不是"点击通过检查"，跳过：' + buttonText);
                }
            } else {
                DebugLogger.debug('AutoCheckPass', '未找到过检按钮');
            }
        } catch (error) {
            DebugLogger.error('AutoCheckPass', '过检功能出错', error);
        }
    }
};

/**
 * 倍速控制模块
 */
const SpeedControl = {
    intervalId: null,
    targetSpeed: '1X', // 默认1倍速

    toggle(isEnabled) {
        if (isEnabled) {
            this.setSpeed('2X');
            this.start();
        } else {
            this.setSpeed('1X');
            this.stop();
        }
    },

    start() {
        if (this.intervalId) {
            DebugLogger.debug('SpeedControl', '倍速控制已在运行，无需重复启动');
            return;
        }

        // 定期检查是否保持目标速度
        this.intervalId = setInterval(() => {
            this.ensureSpeed();
        }, Config.speedCheckInterval);
        DebugLogger.log('SpeedControl', '2倍速已开启，检查间隔：' + Config.speedCheckInterval + 'ms');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            DebugLogger.log('SpeedControl', '2倍速已关闭，恢复1倍速');
        } else {
            DebugLogger.debug('SpeedControl', '倍速控制未运行，无需停止');
        }
    },

    setSpeed(speed) {
        DebugLogger.debug('SpeedControl', '设置目标倍速：' + speed);
        this.targetSpeed = speed;
        this.ensureSpeed();
    },

    ensureSpeed() {
        try {
            DebugLogger.debug('SpeedControl', `检查当前倍速是否为${this.targetSpeed}`);

            // 查找倍速菜单中的对应选项
            const speedItems = document.querySelectorAll('.vjs-menu-content .vjs-menu-item');
            DebugLogger.debug('SpeedControl', `找到倍速选项数量：${speedItems.length}`);

            let foundTargetSpeed = false;
            for (const item of speedItems) {
                const speedTextElement = item.querySelector('.vjs-menu-item-text');
                if (!speedTextElement) continue;

                const speedText = speedTextElement.textContent.trim();
                DebugLogger.debug('SpeedControl', `检查倍速选项：${speedText} (当前选中: ${item.classList.contains('vjs-selected')})`);

                if (speedText === this.targetSpeed) {
                    foundTargetSpeed = true;
                    // 检查当前是否已选中
                    if (!item.classList.contains('vjs-selected')) {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        item.dispatchEvent(clickEvent);
                        DebugLogger.log('SpeedControl', `已设置为${this.targetSpeed}速`, item);
                    } else {
                        DebugLogger.debug('SpeedControl', `当前已为${this.targetSpeed}速，无需调整`);
                    }
                    break;
                }
            }

            if (!foundTargetSpeed) {
                DebugLogger.warn('SpeedControl', `未找到${this.targetSpeed}倍速选项`);
            }
        } catch (error) {
            DebugLogger.error('SpeedControl', '倍速控制功能出错', error);
        }
    }
};

/**
 * 刷课模式控制模块
 */
const CourseBrushMode = {
    // 开启刷课模式 - 打开所有功能
    enable() {
        DebugLogger.log('CourseBrushMode', '开始开启刷课模式');

        // 启用所有功能
        GUI.setToggleState('autoSkip', true);
        GUI.setToggleState('autoPlay', true);
        GUI.setToggleState('autoCheckPass', true);
        GUI.setToggleState('speedControl', true);

        // 同步更新各个模块状态
        AutoSkip.toggle(true);
        AutoPlay.toggle(true);
        AutoCheckPass.toggle(true);
        SpeedControl.toggle(true);

        DebugLogger.log('CourseBrushMode', '刷课模式已完全开启');
    },

    // 关闭刷课模式 - 关闭所有功能
    disable() {
        DebugLogger.log('CourseBrushMode', '开始关闭刷课模式');

        // 禁用所有功能
        GUI.setToggleState('autoSkip', false);
        GUI.setToggleState('autoPlay', false);
        GUI.setToggleState('autoCheckPass', false);
        GUI.setToggleState('speedControl', false);

        // 同步更新各个模块状态
        AutoSkip.toggle(false);
        AutoPlay.toggle(false);
        AutoCheckPass.toggle(false);
        SpeedControl.toggle(false);

        DebugLogger.log('CourseBrushMode', '刷课模式已完全关闭');
    },

    // 切换刷课模式状态
    toggle(isEnabled) {
        if (isEnabled) {
            this.enable();
        } else {
            this.disable();
        }
    }
};

/**
 * GUI界面模块
 */
const GUI = {
    isMenuOpen: false,
    state: {
        autoSkip: false,
        autoPlay: false,
        autoCheckPass: false,
        speedControl: false,
        courseBrushMode: false // 刷课模式状态
    },

    init() {
        DebugLogger.log('GUI', '开始初始化GUI界面');
        this.createStyles();
        this.createMenuButton();
        this.createMenuPanel();
        DebugLogger.log('GUI', 'GUI界面初始化完成');
    },

    createStyles() {
        DebugLogger.debug('GUI', '创建GUI样式');
        const style = document.createElement('style');
        style.textContent = `
            .ewt-helper-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99999;
                font-family: Arial, sans-serif;
            }

            .ewt-menu-button {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background-color: #4CAF50;
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
            }

            .ewt-menu-button:hover {
                background-color: #45a049;
                transform: scale(1.05);
            }

            .ewt-menu-panel {
                position: absolute;
                bottom: 60px;
                right: 0;
                width: 250px;
                background-color: white;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                padding: 15px;
                display: none;
                flex-direction: column;
                gap: 10px;
            }

            .ewt-menu-panel.open {
                display: flex;
            }

            .ewt-menu-title {
                font-size: 18px;
                font-weight: bold;
                color: #333;
                margin-bottom: 10px;
                text-align: center;
                padding-bottom: 5px;
                border-bottom: 1px solid #eee;
            }

            .ewt-toggle-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #f5f5f5;
            }

            .ewt-toggle-label {
                font-size: 14px;
                color: #555;
            }

            .ewt-toggle-label.brush-mode {
                color: #2196F3;
                font-weight: bold;
            }

            /* 开关样式 */
            .ewt-switch {
                position: relative;
                display: inline-block;
                width: 40px;
                height: 24px;
            }

            .ewt-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .ewt-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 24px;
            }

            .ewt-slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }

            input:checked + .ewt-slider {
                background-color: #4CAF50;
            }

            input:checked + .ewt-slider:before {
                transform: translateX(16px);
            }

            /* 响应式调整 */
            @media (max-width: 768px) {
                .ewt-menu-panel {
                    width: 220px;
                }

                .ewt-menu-button {
                    width: 45px;
                    height: 45px;
                    font-size: 20px;
                }
            }
        `;
        document.head.appendChild(style);
        DebugLogger.debug('GUI', 'GUI样式创建完成并添加到页面');
    },

    createMenuButton() {
        DebugLogger.debug('GUI', '创建菜单按钮');
        const container = document.createElement('div');
        container.className = 'ewt-helper-container';

        const button = document.createElement('button');
        button.className = 'ewt-menu-button';
        button.innerHTML = '📚';
        button.title = '升学E网通助手';

        button.addEventListener('click', () => {
            DebugLogger.debug('GUI', '菜单按钮被点击，当前状态：' + (this.isMenuOpen ? '打开' : '关闭'));
            this.toggleMenu();
        });

        container.appendChild(button);
        document.body.appendChild(container);
        DebugLogger.debug('GUI', '菜单按钮创建完成并添加到页面');
    },

    createMenuPanel() {
        DebugLogger.debug('GUI', '创建菜单面板');
        const panel = document.createElement('div');
        panel.className = 'ewt-menu-panel';

        // 标题
        const title = document.createElement('div');
        title.className = 'ewt-menu-title';
        title.textContent = '升学E网通助手';
        panel.appendChild(title);

        // 自动跳题开关
        panel.appendChild(this.createToggleItem(
            'autoSkip',
            '自动跳题',
            (isChecked) => AutoSkip.toggle(isChecked)
        ));

        // 自动连播开关
        panel.appendChild(this.createToggleItem(
            'autoPlay',
            '自动连播',
            (isChecked) => AutoPlay.toggle(isChecked)
        ));

        // 过检开关
        panel.appendChild(this.createToggleItem(
            'autoCheckPass',
            '自动过检',
            (isChecked) => AutoCheckPass.toggle(isChecked)
        ));

        // 2倍速开关
        panel.appendChild(this.createToggleItem(
            'speedControl',
            '2倍速播放',
            (isChecked) => SpeedControl.toggle(isChecked)
        ));

        // 刷课模式toggle开关
        panel.appendChild(this.createToggleItem(
            'courseBrushMode',
            '刷课模式',
            (isChecked) => CourseBrushMode.toggle(isChecked),
            true // 标记为刷课模式，用于特殊样式
        ));

        document.querySelector('.ewt-helper-container').appendChild(panel);
        DebugLogger.debug('GUI', '菜单面板创建完成并添加到页面');
    },

    createToggleItem(id, labelText, onChange, isBrushMode = false) {
        DebugLogger.debug('GUI', `创建Toggle项：${id} (${labelText})`);
        const item = document.createElement('div');
        item.className = 'ewt-toggle-item';

        const label = document.createElement('label');
        label.className = `ewt-toggle-label ${isBrushMode ? 'brush-mode' : ''}`;
        label.textContent = labelText;

        const switchContainer = document.createElement('label');
        switchContainer.className = 'ewt-switch';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `ewt-toggle-${id}`;

        const slider = document.createElement('span');
        slider.className = 'ewt-slider';

        switchContainer.appendChild(input);
        switchContainer.appendChild(slider);

        item.appendChild(label);
        item.appendChild(switchContainer);

        // 添加事件监听
        input.addEventListener('change', (e) => {
            DebugLogger.debug('GUI', `Toggle项 ${id} 状态变更：${e.target.checked}`);
            this.state[id] = e.target.checked;
            onChange(e.target.checked);
        });

        return item;
    },

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        const panel = document.querySelector('.ewt-menu-panel');

        if (this.isMenuOpen) {
            panel.classList.add('open');
            DebugLogger.log('GUI', '菜单面板已打开');
        } else {
            panel.classList.remove('open');
            DebugLogger.log('GUI', '菜单面板已关闭');
        }
    },

    setToggleState(id, isChecked) {
        DebugLogger.debug('GUI', `设置Toggle项 ${id} 状态：${isChecked}`);
        this.state[id] = isChecked;
        const input = document.getElementById(`ewt-toggle-${id}`);
        if (input) {
            // 移除事件监听器防止循环触发
            const clone = input.cloneNode(true);
            input.parentNode.replaceChild(clone, input);
            DebugLogger.debug('GUI', `克隆Toggle输入框以移除旧事件监听器：${id}`);

            // 设置状态
            clone.checked = isChecked;
            DebugLogger.debug('GUI', `设置Toggle输入框状态：${id} = ${isChecked}`);

            // 重新添加事件监听器
            clone.addEventListener('change', (e) => {
                DebugLogger.debug('GUI', `Toggle项 ${id} 克隆后的状态变更：${e.target.checked}`);
                this.state[id] = e.target.checked;

                // 根据不同id调用相应的toggle方法
                switch(id) {
                    case 'autoSkip':
                        AutoSkip.toggle(e.target.checked);
                        break;
                    case 'autoPlay':
                        AutoPlay.toggle(e.target.checked);
                        break;
                    case 'autoCheckPass':
                        AutoCheckPass.toggle(e.target.checked);
                        break;
                    case 'speedControl':
                        SpeedControl.toggle(e.target.checked);
                        break;
                    case 'courseBrushMode':
                        CourseBrushMode.toggle(e.target.checked);
                        break;
                }
            });
        } else {
            DebugLogger.warn('GUI', `未找到Toggle输入框：${id}`);
        }
    }
};

/**
 * 初始化脚本
 */
(function() {
    'use strict';

    // 等待页面加载完成
    window.addEventListener('load', () => {
        DebugLogger.log('Main', '升学E网通助手已加载 (v2.3.0)');
        GUI.init();
    });

    // 额外的调试信息：DOMContentLoaded完成
    document.addEventListener('DOMContentLoaded', () => {
        DebugLogger.debug('Main', 'DOMContentLoaded 已完成，页面DOM结构加载完毕');
    });
})();