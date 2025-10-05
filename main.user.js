// ==UserScript==
// @name         升学E网通助手 v2 Lite
// @namespace    https://github.com/ZNink/EWT360-Helper
// @version      2.0.0
// @description  用于帮助学生通过升学E网通更好学习知识(雾)
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @author       ZNink
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/ZNink/EWT360-Helper/main/main.user.js
// @supportURL   https://github.com/ZNink/EWT360-Helper/issues
// ==/UserScript==

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
        if (this.intervalId) return;

        this.intervalId = setInterval(() => {
            this.checkAndSkip();
        }, Config.skipQuestionInterval);
        console.log('自动跳题已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('自动跳题已关闭');
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
                console.log('已自动跳过题目');

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
        if (this.intervalId) return;

        this.intervalId = setInterval(() => {
            this.checkAndSwitch();
        }, Config.rewatchInterval);
        console.log('自动连播已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('自动连播已关闭');
    },

    checkAndSwitch() {
        try {
            // 1. 检测特定图片元素作为连播触发条件
            const progressImage = document.querySelector('img.progress-img-vkUYM[src="//file.ewt360.com/file/1820894120067424424"]');
            if (!progressImage) {
                console.log('未检测到连播触发图片，不执行切换');
                return;
            }

            // 2. 获取视频列表容器（根据提供的页面结构修正）
            const videoListContainer = document.querySelector('.listCon-zrsBh');
            if (!videoListContainer) {
                console.log('未找到视频列表容器');
                return;
            }

            // 3. 查找当前活跃视频（根据提供的页面结构，活跃视频有active-EI2Hl类）
            const activeVideo = videoListContainer.querySelector('.item-blpma.active-EI2Hl');
            if (!activeVideo) {
                console.log('未找到当前活跃视频');
                return;
            }
            console.log('找到当前活跃视频:', activeVideo.querySelector('.lessontitle-G206y')?.textContent);

            // 4. 查找下一个视频项
            let nextVideo = activeVideo.nextElementSibling;
            while (nextVideo) {
                // 检查是否为视频项且未完成
                if (nextVideo.classList.contains('item-blpma') &&
                    !nextVideo.querySelector('.finished-PsNX9')) {

                    console.log('找到下一个视频:', nextVideo.querySelector('.lessontitle-G206y')?.textContent);

                    // 触发点击事件
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    nextVideo.dispatchEvent(clickEvent);
                    console.log('已自动切换到下一个视频');

                    // 视频切换后更新科目信息
                    if (SubjectInfo && typeof SubjectInfo.checkCurrentSubject === 'function') {
                        SubjectInfo.checkCurrentSubject();
                    }

                    return;
                }
                nextVideo = nextVideo.nextElementSibling;
            }

            console.log('未找到可播放的下一个视频');
        } catch (error) {
            console.error('自动连播功能出错:', error);
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
        if (this.intervalId) return;

        this.intervalId = setInterval(() => {
            this.checkAndClick();
        }, Config.checkPassInterval);
        console.log('过检功能已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('过检功能已关闭');
    },

    checkAndClick() {
        try {
            // 查找"点击通过检查"按钮
            const checkButton = document.querySelector('span.btn-DOCWn');

            if (checkButton && checkButton.textContent.trim() === '点击通过检查') {
                // 防止重复点击
                if (!checkButton.dataset.checkClicked) {
                    checkButton.dataset.checkClicked = 'true';

                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    checkButton.dispatchEvent(clickEvent);
                    console.log('已自动通过检查');

                    setTimeout(() => {
                        delete checkButton.dataset.checkClicked;
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('过检功能出错:', error);
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
        if (this.intervalId) return;

        // 定期检查是否保持目标速度
        this.intervalId = setInterval(() => {
            this.ensureSpeed();
        }, Config.speedCheckInterval);
        console.log('2倍速已开启');
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('2倍速已关闭，恢复1倍速');
    },

    setSpeed(speed) {
        this.targetSpeed = speed;
        this.ensureSpeed();
    },

    ensureSpeed() {
        try {
            // 查找倍速菜单中的对应选项
            const speedItems = document.querySelectorAll('.vjs-menu-content .vjs-menu-item');

            for (const item of speedItems) {
                const speedText = item.querySelector('.vjs-menu-item-text');
                if (speedText && speedText.textContent.trim() === this.targetSpeed) {
                    // 检查当前是否已选中
                    if (!item.classList.contains('vjs-selected')) {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        item.dispatchEvent(clickEvent);
                        console.log(`已设置为${this.targetSpeed}速`);
                    }
                    break;
                }
            }
        } catch (error) {
            console.error('倍速控制功能出错:', error);
        }
    }
};

/**
 * 刷课模式控制模块
 */
const CourseBrushMode = {
    // 开启刷课模式 - 打开所有功能
    enable() {
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

        console.log('刷课模式已开启');
    },

    // 关闭刷课模式 - 关闭所有功能
    disable() {
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

        console.log('刷课模式已关闭');
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
        this.createStyles();
        this.createMenuButton();
        this.createMenuPanel();
    },

    createStyles() {
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
    },

    createMenuButton() {
        const container = document.createElement('div');
        container.className = 'ewt-helper-container';

        const button = document.createElement('button');
        button.className = 'ewt-menu-button';
        button.innerHTML = '📚';
        button.title = '升学E网通助手';

        button.addEventListener('click', () => this.toggleMenu());

        container.appendChild(button);
        document.body.appendChild(container);
    },

    createMenuPanel() {
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
    },

    createToggleItem(id, labelText, onChange, isBrushMode = false) {
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
        } else {
            panel.classList.remove('open');
        }
    },

    setToggleState(id, isChecked) {
        this.state[id] = isChecked;
        const input = document.getElementById(`ewt-toggle-${id}`);
        if (input) {
            // 移除事件监听器防止循环触发
            const clone = input.cloneNode(true);
            input.parentNode.replaceChild(clone, input);

            // 设置状态
            clone.checked = isChecked;

            // 重新添加事件监听器
            clone.addEventListener('change', (e) => {
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
        console.log('升学E网通助手已加载 (v2.3.0)');
        GUI.init();
    });
})();
