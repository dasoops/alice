const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('path');
const log = require('electron-log');
const prompt = require('electron-prompt');
const Config = require("./assets/config.js");
const TrayManager = require("./assets/tray.js");
const ShortcutManager = require("./assets/shortcuts.js");
const FileManager = require("./assets/fileManager.js");

let mainWindow;
let trayManager = null;
let shortcutManager = null;
let fileManager = null;
let configFlushTimer = null;

const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) {
    app.quit();
    return;
}

app.on("second-instance", event => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('ready', async () => {
    log.info('Log file location:', log.transports.file.getFile().path);

    const config = new Config(__dirname);
    log.info("Load config: ", config)
    ipcMain.handle("get-config", () => config.value);
    ipcMain.handle("update-config", (_, { field, value }) => {
        config.value[field] = value;
        log.info("update config.", config)
    });
    ipcMain.handle("jump-to-page", (_, pageNumber) => {
        if (mainWindow) {
            mainWindow.webContents.send('jump-to-page', pageNumber);
            return true;
        }
        return false;
    });
    
    // 显示页码输入对话框
    ipcMain.handle("show-page-prompt", async (_, options) => {
        try {
            const result = await prompt({
                title: options.title || '选择页码',
                label: options.label || '请输入页码:',
                value: options.value || '1',
                inputAttrs: {
                    type: 'number',
                    min: options.min || 1,
                    max: options.max || 9999
                },
                type: 'input',
                width: 400,
                height: 180,
            }, mainWindow);
            
            return result; // 返回用户输入的值，如果取消则返回 null
        } catch (error) {
            log.error('Error showing page prompt:', error);
            return null;
        }
    });
    
    // 显示错误对话框
    ipcMain.handle("show-error-dialog", async (_, options) => {
        try {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: options.title || '错误',
                message: options.message || '发生错误',
                buttons: ['确定']
            });
        } catch (error) {
            log.error('Error showing error dialog:', error);
        }
    });
    


    const windowBounds = config.value.windowBounds || {width: 800, height: 80, x: undefined, y: undefined};

    mainWindow = new BrowserWindow({
        width: windowBounds.width,
        height: windowBounds.height,
        x: windowBounds.x,
        y: windowBounds.y,
        frame: false, // 无边框
        transparent: true, // 透明背景
        alwaysOnTop: true, // 悬浮窗
        skipTaskbar: true, // 不显示在任务栏
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    log.info("Starting. loadFile");
    await mainWindow.loadFile(path.join(__dirname, "assets", "index.html"));
    log.info("Starting. register hotkey");

    // 切换窗口显示/隐藏状态
    function hideOrShow() {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
            // 隐藏窗口时同时隐藏托盘图标
            trayManager.destroy();
        } else {
            mainWindow.show();
            // 显示窗口时同时显示托盘图标
            if (!trayManager.tray) {
                trayManager.create();
            }
        }
    }

    // 退出应用
    function exit() {
        saveWindowBounds();
        fileManager.saveCurrentFileProgress();
        config.flush();
        app.quit();
    }

    // 选择页码处理函数
    function selectPage() {
        if (mainWindow && mainWindow.isVisible()) {
            mainWindow.webContents.send('show-page-input');
        } else {
            log.warn('Window is not visible, cannot show page input');
        }
    }

    // 初始化管理器
    fileManager = new FileManager(config, mainWindow, null);
    trayManager = new TrayManager(config, mainWindow, {
        hideOrShow,
        selectTextFile: (filePath) => fileManager.selectTextFile(filePath),
        selectReadingDirectory: () => trayManager.selectReadingDirectory(),
        openReadingDirectory: () => trayManager.openReadingDirectory(),
        openConfigFile: () => trayManager.openConfigFile(),
        selectPage,
        exit
    }, __dirname);
    fileManager.trayManager = trayManager; // 设置循环引用
    
    shortcutManager = new ShortcutManager(mainWindow, {
        hideOrShow,
        exit
    });

    // 初始化托盘图标
    trayManager.create();

    // 注册快捷键和 IPC 事件
    shortcutManager.registerAll();
    shortcutManager.registerIpc();

    // 定时保存配置
    configFlushTimer = setInterval(() => {
        config.flush();
    }, 1000 * 60);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (config.value.openDevTools) {
        mainWindow.webContents.openDevTools();
    }

    function saveWindowBounds() {
        if (mainWindow) {
            config.value.windowBounds = mainWindow.getBounds();
        }
    }
});

app.on('will-quit', () => {
    log.info('Application will-quit');
    if (shortcutManager) {
        shortcutManager.unregisterAll();
    }
    if (configFlushTimer) {
        clearInterval(configFlushTimer);
    }
});

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
