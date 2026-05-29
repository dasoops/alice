const log = require('electron-log');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {ipcRenderer} = require('electron');

log.info("Load renderer.js");

window.onerror = (message, source, lineno, colno, error) => {
    log.error('Unhandled error:', message, source, lineno, colno, error);
};

window.addEventListener('unhandledrejection', (event) => {
    log.error('Unhandled promise rejection:', event.reason);
});

// 工具函数：计算文件 MD5
function digestFile(filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('md5').update(fileContent).digest('hex');
}

// 工具函数：根据文件路径生成cache文件名（使用文件路径的hash）
function getCacheFileName(filePath) {
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    return hash;
}

// 工具函数：检查缓存 MD5 是否匹配
function cacheMd5Ensure(filePath, cacheMd5Path) {
    if (!fs.existsSync(cacheMd5Path)) {
        return false;
    }
    if (!fs.existsSync(filePath)) {
        return false;
    }
    const cacheHash = fs.readFileSync(cacheMd5Path, 'utf-8').trim();
    const currentHash = digestFile(filePath);
    return cacheHash === currentHash;
}

// 工具函数：缓存文件（按最大字符数分割）
async function cacheFile(filePath, cachePath, cacheMd5Path) {
    if (fs.existsSync(cachePath)) {
        fs.rmSync(cachePath);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const writeStream = fs.createWriteStream(cachePath);

    const maxSize = 40; // 每次最多展示的字符数

    let currentSize = 0;
    let currentLine = '';

    function writeAndReset() {
        if (currentLine.length > 0) {
            writeStream.write(currentLine + "\n");
        }

        // Reset
        currentSize = 0;
        currentLine = '';
    }

    for (let i = 0; i < fileContent.length; i++) {
        const char = fileContent.charAt(i);

        if (currentSize >= maxSize) {
            writeAndReset();
        }
        // 修复：单个字符不会等于 '\r\n'
        if (char === '\r' || char === '\n') {
            writeAndReset();
            continue;
        }

        currentLine += char;
        currentSize += 1;
    }
    if (currentSize !== 0) {
        writeStream.write(currentLine);
    }

    writeStream.end();
    await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
    fs.writeFileSync(cacheMd5Path, digestFile(filePath));
}

document.addEventListener('DOMContentLoaded', async () => {
    const config = await ipcRenderer.invoke("get-config");
    const updatePage = async (value) => {
        config.currentPage = value;
        await ipcRenderer.invoke("update-config", { field: "currentPage", value: config.currentPage });
        
        // 同时更新当前文件的阅读进度记录
        if (config.filePath && config.fileProgress) {
            config.fileProgress[config.filePath] = value;
            await ipcRenderer.invoke("update-config", { field: "fileProgress", value: config.fileProgress });
        }
    };

    const dataPath = config.dataPath;
    const cacheDir = path.join(dataPath, 'cache');
    const contentDiv = document.getElementById('content');

    let readFileContent = [];

    // 确保cache目录存在
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 确保 fileProgress 存在
    async function ensureFileProgress() {
        if (!config.fileProgress) {
            config.fileProgress = {};
            await ipcRenderer.invoke("update-config", { field: "fileProgress", value: config.fileProgress });
        }
    }

    // 恢复文件的阅读进度
    async function restoreFileProgress(filePath, totalPages) {
        await ensureFileProgress();
        
        const savedPage = config.fileProgress[filePath];
        if (savedPage !== undefined && savedPage >= 0 && savedPage < totalPages) {
            config.currentPage = savedPage;
            await ipcRenderer.invoke("update-config", { field: "currentPage", value: config.currentPage });
        } else if (config.currentPage === undefined || config.currentPage < 0 || config.currentPage >= totalPages) {
            await updatePage(0);
        }
    }

    async function loadFileContent() {
        const currentFilePath = config.filePath || path.join(dataPath, "read.txt");
        const cacheFileName = getCacheFileName(currentFilePath);
        const cachePath = path.join(cacheDir, `${cacheFileName}.cache`);
        const cacheMd5Path = path.join(cacheDir, `${cacheFileName}.md5`);
        
        // 检查是否需要重新生成cache
        if (!fs.existsSync(cachePath) || !fs.existsSync(cacheMd5Path) || !cacheMd5Ensure(currentFilePath, cacheMd5Path)) {
            log.info("Regenerating cache for file:", currentFilePath);
            await cacheFile(currentFilePath, cachePath, cacheMd5Path);
        } else {
            log.info("Using cached file:", currentFilePath);
        }

        readFileContent = fs.readFileSync(cachePath, 'utf-8').split("\n");
        log.info("Load success.", readFileContent.length, "pages from file:", currentFilePath);
        
        // 恢复文件的阅读进度
        await restoreFileProgress(currentFilePath, readFileContent.length);
    }

    async function renderPage() {
        const currentPage = config.currentPage;
        log.debug("currentPage: ", currentPage);
        contentDiv.innerHTML = readFileContent[currentPage]?.replace(/\n/g, '<br>') || 'No content';
    }

    // 封装翻页逻辑，添加边界检查
    async function changePage(offset) {
        const newPage = config.currentPage + offset;
        if (newPage < 0 || newPage >= readFileContent.length) {
            log.debug(`Page ${newPage} out of bounds (0-${readFileContent.length - 1})`);
            return;
        }
        await updatePage(newPage);
        await renderPage();
    }

    // 跳转到指定页码
    async function jumpToPage(pageNumber) {
        const pageNum = parseInt(pageNumber);
        if (isNaN(pageNum) || pageNum < 0 || pageNum >= readFileContent.length) {
            log.warn(`Invalid page number: ${pageNumber}, valid range: 0-${readFileContent.length - 1}`);
            return false;
        }
        await updatePage(pageNum);
        await renderPage();
        return true;
    }

    // 显示页码输入框
    async function showPageInput() {
        const totalPages = readFileContent.length;
        const currentPage = config.currentPage || 0;
        
        const pageInput = await ipcRenderer.invoke("show-page-prompt", {
            title: `选择页码 (当前: ${currentPage + 1} / 总共: ${totalPages})`,
            label: '请输入页码:',
            value: String(currentPage + 1),
            min: 1,
            max: totalPages
        });
        
        if (pageInput !== null && pageInput !== undefined) {
            const pageNumber = parseInt(pageInput);
            if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
                await jumpToPage(pageNumber - 1); // 转换为0索引
            } else {
                // 显示错误信息
                await ipcRenderer.invoke("show-error-dialog", {
                    title: '页码无效',
                    message: `请输入 1 到 ${totalPages} 之间的数字。`
                });
            }
        }
    }

    // 监听主进程发送的事件
    ipcRenderer.on('next-page', async () => {
        await changePage(1);
    });
    ipcRenderer.on('prev-page', async () => {
        await changePage(-1);
    });
    ipcRenderer.on('lock-unlock-window', async () => {
        const modal = document.getElementById("modal");
        if (modal.style.display === "none") {
            modal.style.display = "flex";
        } else {
            modal.style.display = "none";
        }
    });
    ipcRenderer.on('show-page-input', () => {
        showPageInput();
    });
    ipcRenderer.on('jump-to-page', async (event, pageNumber) => {
        await jumpToPage(pageNumber);
    });
    
    // 监听文件切换事件
    ipcRenderer.on('file-changed', async (event, newFilePath) => {
        log.info("File changed to:", newFilePath);
        const newConfig = await ipcRenderer.invoke("get-config");
        Object.assign(config, newConfig);
        await loadFileContent();
        await renderPage();
    });

    // 初次加载内容
    await loadFileContent();
    await renderPage();

    document.getElementById("content").addEventListener("wheel", async event => {
        if (event.deltaY < 0) {
            // 上滑操作
            await changePage(-1);
        } else if (event.deltaY > 0) {
            // 下滑操作
            await changePage(1);
        }
    });

    document.getElementById("content").addEventListener("contextmenu", async event => {
        ipcRenderer.send('hide-or-show');
    });
});
