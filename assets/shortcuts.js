const { globalShortcut, ipcMain } = require('electron');
const log = require('electron-log');

class ShortcutManager {
    constructor(mainWindow, handlers) {
        this.mainWindow = mainWindow;
        this.handlers = handlers;
        this.shortcuts = [];
    }

    // 注册所有快捷键
    registerAll() {
        // 显示/隐藏窗口
        this.register('Ctrl+Q', this.handlers.hideOrShow);
        
        // 上一页
        this.register('Ctrl+1', () => {
            this.mainWindow.webContents.send('prev-page');
        });
        
        // 锁定/解锁窗口
        this.register('Ctrl+P', () => {
            this.mainWindow.webContents.send('lock-unlock-window');
        });
        
        // 下一页
        this.register('Ctrl+E', () => {
            log.info("next");
            this.mainWindow.webContents.send('next-page');
        });
        
        // 退出应用
        this.register('Ctrl+3', this.handlers.exit);
    }

    // 注册单个快捷键
    register(accelerator, callback) {
        const ret = globalShortcut.register(accelerator, callback);
        if (ret) {
            this.shortcuts.push(accelerator);
            log.info(`Registered shortcut: ${accelerator}`);
        } else {
            log.error(`Failed to register shortcut: ${accelerator}`);
        }
    }

    // 注销所有快捷键
    unregisterAll() {
        globalShortcut.unregisterAll();
        this.shortcuts = [];
        log.info('Unregistered all shortcuts');
    }

    // 注册 IPC 事件
    registerIpc() {
        ipcMain.on("hide-or-show", this.handlers.hideOrShow);
    }
}

module.exports = ShortcutManager;

