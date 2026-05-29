const { Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

class TrayManager {
    constructor(config, mainWindow, handlers, appDir) {
        this.config = config;
        this.mainWindow = mainWindow;
        this.handlers = handlers;
        this.appDir = appDir;
        this.tray = null;
    }

    // 创建托盘图标
    create() {
        if (this.tray) {
            this.tray.destroy();
        }
        const iconPath = path.join(this.appDir, 'assets', 'icon.png');
        const icon = nativeImage.createFromPath(iconPath);
        this.tray = new Tray(icon);
        this.tray.setToolTip('Alice');
        this.tray.on('click', this.handlers.hideOrShow);
        this.updateMenu();
    }

    // 销毁托盘图标
    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }

    // 获取目录下的文本文件列表
    getDirectoryTextFiles() {
        const { readingDirectory } = this.config.value;
        if (!readingDirectory || !fs.existsSync(readingDirectory)) {
            return [];
        }
        
        try {
            return fs.readdirSync(readingDirectory, { withFileTypes: true })
                .filter(dirent => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.txt')
                .map(dirent => ({
                    name: dirent.name,
                    path: path.join(readingDirectory, dirent.name)
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            log.error('Failed to read directory:', readingDirectory, error);
            return [];
        }
    }

    // 更新托盘菜单
    updateMenu() {
        if (!this.tray) return;
        
        const menuItems = [
            { label: '显示/隐藏窗口', click: this.handlers.hideOrShow }
        ];
        
        // 构建"阅读文件"子菜单
        const files = this.getDirectoryTextFiles();
        const readingFilesSubmenu = files.length > 0
            ? files.map(file => ({
                label: this.config.value.filePath === file.path ? `✓ ${file.name}` : file.name,
                click: () => this.handlers.selectTextFile(file.path)
            }))
            : [{ label: '暂无文件', enabled: false }];
        
        readingFilesSubmenu.push(
            { type: 'separator' },
            { label: '打开阅读目录', click: this.handlers.openReadingDirectory, enabled: !!this.config.value.readingDirectory },
            { label: '选择阅读目录', click: this.handlers.selectReadingDirectory }
        );
        
        menuItems.push(
            { label: '阅读文件', submenu: readingFilesSubmenu },
            { label: '选择页码', click: this.handlers.selectPage },
            { label: '打开配置文件', click: this.handlers.openConfigFile },
            { label: '退出', click: this.handlers.exit }
        );
        
        this.tray.setContextMenu(Menu.buildFromTemplate(menuItems));
    }

    // 处理选择阅读目录
    async selectReadingDirectory() {
        const result = await dialog.showOpenDialog(this.mainWindow, {
            title: '选择阅读文件存放目录',
            properties: ['openDirectory']
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            const selectedDir = result.filePaths[0];
            this.config.value.readingDirectory = selectedDir;
            this.config.flush();
            this.updateMenu();
            return selectedDir;
        }
        return null;
    }

    // 打开阅读目录
    openReadingDirectory() {
        const { readingDirectory } = this.config.value;
        if (readingDirectory && fs.existsSync(readingDirectory)) {
            shell.openPath(readingDirectory).catch(err => {
                log.error('Failed to open reading directory:', err);
            });
        } else {
            log.error('Reading directory not found:', readingDirectory);
        }
    }

    // 打开配置文件
    openConfigFile() {
        const configPath = this.config.value.path;
        if (configPath && fs.existsSync(configPath)) {
            shell.openPath(configPath).catch(err => {
                log.error('Failed to open config file:', err);
            });
        } else {
            log.error('Config file not found:', configPath);
        }
    }
}

module.exports = TrayManager;

