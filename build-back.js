const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('正在构建项目...');

// 清理构建目录
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 复制资源文件
const assetsDir = path.join(__dirname, 'assets');
if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(distDir, 'assets'), { recursive: true });
}

// 执行pkg打包
console.log('正在打包为EXE文件...');
try {
    execSync('npm run pkg', { stdio: 'inherit' });
    console.log('打包成功！');

    // 显示使用说明
    const exePath = path.join(distDir, 'model-edge-exporter.exe');
    console.log('\n使用说明:');
    console.log(`1. 将生成的可执行文件复制到目标位置: ${exePath}`);
    console.log('2. 在命令行中运行:');
    console.log('   model-edge-exporter.exe <输入文件> [输出目录]');
    console.log('\n示例:');
    console.log('   model-edge-exporter.exe model.db output');
    console.log('   model-edge-exporter.exe "C:\\models\\project.model"');
} catch (error) {
    console.error('打包失败:', error);
}