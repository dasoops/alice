const log = require('electron-log');

class FileManager {
    constructor(config, mainWindow, trayManager) {
        this.config = config;
        this.mainWindow = mainWindow;
        this.trayManager = trayManager;
    }

    // 确保 fileProgress 对象存在
    ensureFileProgress() {
        if (!this.config.value.fileProgress) {
            this.config.value.fileProgress = {};
        }
    }

    // 保存当前文件的阅读进度
    saveCurrentFileProgress() {
        if (this.config.value.filePath) {
            this.ensureFileProgress();
            this.config.value.fileProgress[this.config.value.filePath] = this.config.value.currentPage || 0;
        }
    }

    // 处理文件选择（从阅读文件菜单调用）
    async selectTextFile(filePath) {
        if (!filePath) {
            log.error("selectTextFile called without filePath");
            return null;
        }
        
        log.info("Selected file:", filePath);
        
        // 保存当前文件的阅读进度
        this.saveCurrentFileProgress();
        
        // 切换到新文件
        this.config.value.filePath = filePath;
        this.ensureFileProgress();
        
        // 恢复新文件的阅读进度（如果存在）
        this.config.value.currentPage = this.config.value.fileProgress[filePath] ?? 0;
        this.config.flush();
        
        // 确保窗口显示并获得焦点
        if (!this.mainWindow.isVisible()) {
            this.mainWindow.show();
        }
        this.mainWindow.focus();
        
        // 更新托盘菜单并通知渲染进程
        this.trayManager.updateMenu();
        this.mainWindow.webContents.send('file-changed', filePath);
        
        return filePath;
    }
}

module.exports = FileManager;

