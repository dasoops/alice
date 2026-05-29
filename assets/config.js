const fs = require("fs");
const path = require("path");
const {app} = require("electron");
const log = require("electron-log");

function Config(dir) {
    let dataPath;
    if (app.isPackaged) {
        dataPath = path.join(dir, "..", "data");
    } else {
        dataPath = path.join(dir, "data");
    }
    const configPath = path.join(dataPath, "config.json");

    let value = undefined;

    const defaultConfig = {
        windowBounds: {width: 800, height: 80, x: undefined, y: undefined},
        filePath: path.join(dataPath, "read.txt"),
        currentPage: 0,
        openDevTools: false,
        fileProgress: {}, // 记录不同文件的阅读进度 {文件路径: 当前页数}
        readingDirectory: undefined, // 阅读文件存放目录
    };

    function _writeFile(value) {
        // Ensure the directory exists before writing
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(value, null, 2), "utf-8");
    }

    function read() {
        if (!fs.existsSync(configPath)) {
            _writeFile(defaultConfig);
        }

        try {
            const fileContent = fs.readFileSync(configPath, 'utf-8');
            value = {
                path: configPath,
                dataPath: dataPath,
                ...JSON.parse(fileContent),
            };
        } catch (error) {
            log.error('Failed to read config file, using defaults:', error);
            value = {
                path: configPath,
                dataPath: dataPath,
                ...defaultConfig,
            };
            _writeFile(defaultConfig);
        }
    }

    function flush() {
        const {dataPath, path, ...saveValue} = value;
        _writeFile(saveValue);
        log.info('Flush config.', value, saveValue)
    }

    read();

    return {
        value,
        flush,
    };
}

module.exports = Config;