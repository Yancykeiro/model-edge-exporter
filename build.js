const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// 获取命令行参数
const args = process.argv.slice(2);
const platform = args[0] || 'current'; // current, windows, linux, docker-linux

console.log(`正在构建项目 (目标平台: ${platform})...`);

// 清理构建目录
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 复制资源文件
function copyAssets() {
    console.log('正在复制资源文件...');

    // 复制 WASM 文件
    const wasmFiles = [
        { src: 'zstd.wasm', dest: 'zstd.wasm' },
        { src: 'node_modules/sql.js/dist/sql-wasm.wasm', dest: 'sql-wasm.wasm' }
    ];

    wasmFiles.forEach(file => {
        const srcPath = path.join(__dirname, file.src);
        const destPath = path.join(distDir, file.dest);

        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`已复制: ${file.dest}`);
        } else {
            console.warn(`警告: 找不到文件 ${file.src}`);
        }
    });

    // 复制 assets 目录（如果存在）
    const assetsDir = path.join(__dirname, 'assets');
    if (fs.existsSync(assetsDir)) {
        fs.cpSync(assetsDir, path.join(distDir, 'assets'), { recursive: true });
        console.log('已复制 assets 目录');
    }
}

// 检查 pkg 是否支持目标平台
function checkPkgSupport(targetPlatform) {
    const currentPlatform = os.platform();

    // pkg 的交叉编译支持矩阵
    const supportMatrix = {
        'win32': ['node18-win-x64', 'node18-linux-x64'], // Windows 可以编译 Linux（有时）
        'linux': ['node18-linux-x64', 'node18-win-x64'],
        'darwin': ['node18-macos-x64', 'node18-linux-x64', 'node18-win-x64']
    };

    const supportedTargets = supportMatrix[currentPlatform] || [];

    return {
        supported: supportedTargets.includes(targetPlatform),
        currentPlatform,
        supportedTargets
    };
}

// 尝试强制使用 pkg 构建
function tryForceBuild(targetPlatform, outputName) {
    const support = checkPkgSupport(targetPlatform);

    if (!support.supported && os.platform() === 'win32' && targetPlatform === 'node18-linux-x64') {
        console.log('⚠️  警告: pkg 在 Windows 上编译 Linux 版本可能会失败');
        console.log('但我们仍然尝试...');
        console.log('如果失败，请考虑使用云端构建服务\n');
    }

    const pkgCommand = `pkg --targets ${targetPlatform} --output dist/${outputName} main.js`;

    console.log(`正在尝试打包为 ${targetPlatform}...`);
    console.log(`命令: ${pkgCommand}\n`);

    try {
        execSync(pkgCommand, { stdio: 'inherit' });
        console.log('✅ 打包成功！');
        return true;
    } catch (error) {
        console.error('❌ 打包失败:', error.message);
        return false;
    }
}

// 提供替代解决方案
function showAlternativeSolutions() {
    console.log('\n🔧 替代解决方案:');
    console.log('================');
    console.log('1. 使用 GitHub Actions (推荐)');
    console.log('   - 创建 GitHub 仓库');
    console.log('   - 推送代码');
    console.log('   - 使用云端自动构建');
    console.log('');
    console.log('2. 使用在线 Node.js 环境');
    console.log('   - CodeSandbox');
    console.log('   - Replit');
    console.log('   - Gitpod');
    console.log('');
    console.log('3. 寻找有 Linux 环境的朋友');
    console.log('   - 将项目发送给朋友');
    console.log('   - 在 Linux 系统上构建');
    console.log('');
    console.log('4. 使用虚拟机');
    console.log('   - VirtualBox + Ubuntu');
    console.log('   - VMware + Linux');
}

// 创建 GitHub Actions 配置
function createGitHubActions() {
    const workflowDir = path.join(__dirname, '.github', 'workflows');
    if (!fs.existsSync(workflowDir)) {
        fs.mkdirSync(workflowDir, { recursive: true });
    }

    const workflowContent = `name: Build Cross Platform

on:
  workflow_dispatch: # 手动触发
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: node18-linux-x64
            output: model-edge-exporter-linux
          - os: windows-latest
            target: node18-win-x64
            output: model-edge-exporter-win.exe

    runs-on: \${{ matrix.os }}

    steps:
    - name: Checkout
      uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Install pkg
      run: npm install -g pkg

    - name: Build
      run: pkg --targets \${{ matrix.target }} --output dist/\${{ matrix.output }} main.js

    - name: Copy WASM files
      shell: bash
      run: |
        mkdir -p dist
        cp zstd.wasm dist/ 2>/dev/null || echo "zstd.wasm not found"
        cp node_modules/sql.js/dist/sql-wasm.wasm dist/sql-wasm.wasm 2>/dev/null || echo "sql-wasm.wasm not found"

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: \${{ matrix.output }}
        path: |
          dist/\${{ matrix.output }}
          dist/*.wasm

    - name: Create Release (on tag)
      if: startsWith(github.ref, 'refs/tags/')
      uses: softprops/action-gh-release@v1
      with:
        files: |
          dist/\${{ matrix.output }}
          dist/*.wasm
`;

    const workflowPath = path.join(workflowDir, 'build.yml');
    fs.writeFileSync(workflowPath, workflowContent);

    console.log('✅ 已创建 GitHub Actions 配置文件:');
    console.log(`   ${workflowPath}`);
    console.log('\n📖 使用说明:');
    console.log('1. 将项目推送到 GitHub');
    console.log('2. 进入 GitHub 仓库的 Actions 页面');
    console.log('3. 点击 "Build Cross Platform" workflow');
    console.log('4. 点击 "Run workflow" 手动触发构建');
    console.log('5. 构建完成后下载 artifacts');
}

// 构建函数
function buildForPlatform(targetPlatform) {
    copyAssets();

    let pkgTarget;
    let outputName;

    switch (targetPlatform) {
        case 'windows':
            pkgTarget = 'node18-win-x64';
            outputName = 'model-edge-exporter-win.exe';
            break;

        case 'linux':
            pkgTarget = 'node18-linux-x64';
            outputName = 'model-edge-exporter-linux';
            break;

        case 'current':
            if (os.platform() === 'win32') {
                return buildForPlatform('windows');
            } else if (os.platform() === 'linux') {
                return buildForPlatform('linux');
            } else {
                pkgTarget = 'node18-macos-x64';
                outputName = 'model-edge-exporter-macos';
            }
            break;

        case 'docker-linux':
            console.log('❌ Docker 方案需要安装 Docker');
            showAlternativeSolutions();
            return;

        case 'github-actions':
            createGitHubActions();
            return;

        default:
            console.error(`未知的平台: ${targetPlatform}`);
            process.exit(1);
    }

    // 尝试构建
    const success = tryForceBuild(pkgTarget, outputName);

    if (success) {
        showUsageInstructions(targetPlatform, outputName);
    } else {
        console.log('\n❌ 构建失败');

        if (targetPlatform === 'linux' && os.platform() === 'win32') {
            console.log('这是预期的结果，因为 pkg 在 Windows 上无法可靠地编译 Linux 版本');
            showAlternativeSolutions();

            console.log('\n💡 建议: 创建 GitHub Actions 配置');
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('是否创建 GitHub Actions 配置文件？(y/N): ', (answer) => {
                rl.close();

                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    createGitHubActions();
                } else {
                    console.log('构建已取消');
                }
            });
        }
    }
}

// 显示使用说明
function showUsageInstructions(platform, outputName) {
    const exePath = path.join(distDir, outputName);

    console.log('\n✅ 构建完成！');
    console.log('=================');
    console.log(`目标平台: ${platform}`);
    console.log(`输出文件: ${exePath}`);

    console.log('\n📖 使用说明:');

    if (platform === 'windows') {
        console.log('1. 将生成的 .exe 文件和 .wasm 文件复制到目标位置');
        console.log('2. 在命令行中运行:');
        console.log(`   ${outputName} <输入文件> [输出目录]`);
        console.log('\n💡 示例:');
        console.log(`   ${outputName} model.zstd output`);
        console.log(`   ${outputName} "C:\\models\\project.model"`);
    } else {
        console.log('1. 将生成的可执行文件和 .wasm 文件复制到 Linux 系统');
        console.log('2. 给可执行文件添加执行权限:');
        console.log(`   chmod +x ${outputName}`);
        console.log('3. 运行:');
        console.log(`   ./${outputName} <输入文件> [输出目录]`);
        console.log('\n💡 示例:');
        console.log(`   ./${outputName} model.zstd output`);
        console.log(`   ./${outputName} /path/to/project.model`);
    }

    console.log('\n📁 需要的文件:');
    console.log(`- ${outputName}`);
    console.log('- zstd.wasm');
    console.log('- sql-wasm.wasm');
}

// 显示帮助信息
function showHelp() {
    console.log('模型边缘导出工具 - 构建脚本');
    console.log('\n用法: node build.js [平台]');
    console.log('\n支持的平台:');
    console.log('  current         根据当前系统选择平台 (默认)');
    console.log('  windows         构建 Windows 版本');
    console.log('  linux           尝试构建 Linux 版本 (可能失败)');
    console.log('  github-actions  创建 GitHub Actions 配置文件');
    console.log('\n示例:');
    console.log('  node build.js windows');
    console.log('  node build.js linux');
    console.log('  node build.js github-actions');

    console.log('\n💡 提示:');
    console.log('- Windows 构建通常成功');
    console.log('- Linux 构建在 Windows 上可能失败');
    console.log('- 推荐使用 GitHub Actions 进行跨平台构建');
}

// 主程序
if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
}

buildForPlatform(platform);