const fs = require('fs');
const path = require('path');
const { loadDatabase } = require('./database');
const { GLTFExporter } = require('./node_export.js');

// "pkg": "pkg . --out-path=dist --targets=node18-win-x64"
function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log('模型边缘导出工具');
        console.log('用法: model-edge-exporter <输入文件> [输出目录] ');
        console.log('选项:');
        console.log('  --help     显示帮助信息');
        console.log('  --version  显示版本信息');
        process.exit(0);
    }

    if (args.includes('--version')) {
        console.log('模型边缘导出工具 v1.0.0');
        process.exit(0);
    }

    const inFile = path.resolve(args[0]);
    const outDir = args[1] ? path.resolve(args[1]) : path.dirname(inFile);

    if (!fs.existsSync(inFile)) {
        console.error(`错误: 输入文件不存在 - ${inFile}`);
        process.exit(1);
    }

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    return { inFile, outDir };
}

async function main() {
    console.time("总执行时间");

    try {
        const { inFile, outDir } = parseArgs();
        const { dir, base, name } = path.parse(inFile);
        // const [name, fileType] = base.split('.');
        const outFile = outDir ? `${outDir}/${name}.edge` : `${dir}/${name}.edge`;

        // 加载数据库并提取边缘
        console.log('正在处理模型数据...');
        const edges = await loadDatabase(inFile);

        if (!edges || edges.length === 0) {
            console.error('错误: 未找到线框数据');
            process.exit(1);
        }

        console.log(`找到 ${edges.length} 条线框`);

        // 导出为GLB
        console.log('正在导出为GLB文件...');
        const exporter = new GLTFExporter();

        await new Promise((resolve, reject) => {
            exporter.parse(edges,
                (gltf) => {
                    fs.writeFileSync(outFile, gltf);
                    console.log(`已保存: ${outFile}`);
                    resolve();
                },
                (error) => {
                    console.error('导出错误:', error);
                    reject(error);
                }
            );
        });

        console.timeEnd("总执行时间");
        console.log('处理完成!');
    } catch (error) {
        console.error('处理失败:', error);
        process.exit(1);
    }
}

//启动应用
main();



