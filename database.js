const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const LZMA = require('./node_lzma.js');
const { init, decompress } = require('@bokuweb/zstd-wasm');
const {
    BufferGeometry,
    BufferAttribute,
    EdgesGeometry,
    LineSegments,
    MeshBasicMaterial,
} = require('three');
// const ZstdCodec = require('zstd-codec').ZstdCodec;
// const { Decoder } = require('@toondepauw/node-zstd');
// const decoder = new Decoder();

let decoder;
try {
    const { Decoder } = require('@toondepauw/node-zstd');
    decoder = new Decoder();
} catch (error) {
    console.warn('Warning: @toondepauw/node-zstd not available, falling back to other decompression methods');
    decoder = null;
}


let SQL = null;
let isZstdInitialized = false;

async function initializeWasm() {
    if (!SQL) {
        let wasmPath;
        let wasmBinary;

        if (process.pkg) {
            // 打包后的环境，WASM 文件应该在可执行文件同一目录
            wasmPath = path.join(path.dirname(process.execPath), 'sql-wasm.wasm');

            // 如果外部文件不存在，尝试从打包的资源中读取
            if (fs.existsSync(wasmPath)) {
                wasmBinary = fs.readFileSync(wasmPath);
            } else {
                // 从打包的资源中读取
                try {
                    wasmBinary = fs.readFileSync(path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'));
                } catch (error) {
                    throw new Error('找不到 sql-wasm.wasm 文件。请确保 sql-wasm.wasm 文件与可执行文件在同一目录。');
                }
            }
        } else {
            // 开发环境
            wasmPath = path.join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
            wasmBinary = fs.readFileSync(wasmPath);
        }

        SQL = await initSqlJs({ wasmBinary });
    }

    if (!isZstdInitialized) {
        let zstdWasmPath;

        if (process.pkg) {
            // 打包后的环境
            zstdWasmPath = path.join(path.dirname(process.execPath), 'zstd.wasm');

            if (!fs.existsSync(zstdWasmPath)) {
                throw new Error('找不到 zstd.wasm 文件。请确保 zstd.wasm 文件与可执行文件在同一目录。');
            }
        } else {
            // 开发环境
            zstdWasmPath = path.join(__dirname, 'zstd.wasm');
        }

        await init(zstdWasmPath);
        isZstdInitialized = true;
    }
}

const m = new MeshBasicMaterial({
    color: 0xbbbbbb,
    depthTest: false

});

// let _mergeVertices;
// let _SimplifyModifier;
async function loadDatabase(filePath, isEncrypted = false) {
    await initializeWasm();

    // const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
    // const { SimplifyModifier } = await import('three/examples/jsm/modifiers/SimplifyModifier.js');

    // _mergeVertices = mergeVertices;
    // _SimplifyModifier = SimplifyModifier;


    const buffer = fs.readFileSync(filePath);
    let uintArray;
    if (filePath.endsWith('.osdz')) {
        let mergedArray1;

        if (isEncrypted) {

            const arrayTwo = new Uint8Array(buffer);
            const spliceArray = arrayTwo.subarray(16);

            mergedArray1 = new Uint8Array(arrayTwo.length - 16);
            mergedArray1.set(spliceArray);
        } else {
            mergedArray1 = new Uint8Array(buffer);
        }
        const inStream = new LZMA.iStream(mergedArray1);
        const outStream = LZMA.decompressFile(inStream);
        const bytes = outStream.toUint8Array();

        uintArray = new Uint8Array(bytes);


    } else if (filePath.endsWith('.zstd')) {
        if (decoder) {
            const compressed = new Uint8Array(buffer);
            const res = decoder.decodeSync(compressed);
            uintArray = new Uint8Array(res);
        } else {
            // 使用 @bokuweb/zstd-wasm 作为备选方案
            await init('./zstd.wasm');
            const compressed = new Uint8Array(buffer);
            const res = decompress(compressed);
            uintArray = new Uint8Array(res);
        }

        // // await init('./zstd.wasm');
        // const compressed = new Uint8Array(buffer);

        // const res = decoder.decodeSync(compressed);
        // // const res = decompress(compressed);
        // uintArray = new Uint8Array(res);

        // // ZstdCodec.run((zstd) => {
        // //     const simple = new zstd.Simple();

        // //     const compressedData = new Uint8Array(buffer);

        // //     try {
        // //         const decompressedData = simple.decompress(compressedData);
        // //         console.log('解压成功:', decompressedData);
        // //         uintArray = new Uint8Array(decompressedData);
        // //     } catch (error) {
        // //         console.error('解压失败:', error);
        // //     }
        // // });
    }
    else {
        uintArray = new Uint8Array(buffer);

    }


    const SQL = await initSqlJs();

    const db = new SQL.Database(uintArray);

    const metaData = db.exec('SELECT Version FROM DB_MetaData')[0];
    const version = metaData.values[0][0];

    console.log(`模型版本: ${version}`);

    const dbMesh = db.exec('SELECT * FROM DB_Mesh')[0];

    // 几何体
    const _meshIdGeometryMap = new Map();
    if (version == 1) {
        for (let _value of dbMesh.values) {
            const meshId = _value[0];
            const value = {
                VLyt: JSON.parse(_value[1]),
                ILyt: JSON.parse(_value[2]),
                TLyt: JSON.parse(_value[3]),
                Raw: _value[4],
            };

            const geometry = _createGeometry(value);

            _meshIdGeometryMap.set(meshId, geometry);
        }
    } else if (version == 2) {
        console.log('版本2的模型', dbMesh.values.length);
        let i = 0;
        for (let _value of dbMesh.values) {
            const meshId = _value[0];
            const value = {
                VLyt: JSON.parse(_value[1]),
                ILyt: JSON.parse(_value[2]),
                TLyt: JSON.parse(_value[3]),
                HasUV: _value[4],
                Raw: _value[5],
            };


            const geometry = _createGeometry(value);
            console.log('createGeometry', i++);

            _meshIdGeometryMap.set(meshId, geometry);
        }
    }
    // todo martix name
    const meshData = db.exec(`SELECT * FROM DB_Object`)[0].values;

    const edges = meshData.map((value, index) => {

        const meshId = version == 1 ? value[5] : value[6]; // MeshId

        const geometry = _meshIdGeometryMap.get(meshId);
        if (geometry) {
            const edge = new LineSegments(geometry, m);

            edge.name = value[1]; //Uuid

            return edge;
        }
        return null;
    });




    db.close();



    return edges.filter(e => e !== null);

}

// function _createGeometry(value) {
//     const geometry = new BufferGeometry();

//     const dv = new DataView(value.Raw.buffer);

//     const vertexCount = value.VLyt.reduce((a, b) => a + b);

//     let offset = 0;

//     const position = [];
//     const vertexEnd = 4 * vertexCount * 3;
//     while (offset < vertexEnd) {
//         position.push(dv.getFloat32(offset, true));
//         offset += 4;
//     }
//     geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));


//     const triangleIndexCount = value.ILyt.reduce((a, b) => a + b);
//     const indices = [];
//     const indexEnd = offset + 4 * triangleIndexCount;
//     while (offset < indexEnd) {
//         indices.push(dv.getInt32(offset, true));
//         offset += 4;
//     }

//     // 处理indices成一个几何体的序号
//     if (value.ILyt.length > 1) {
//         // 定义 groups 属性
//         let start = 0;
//         let max = 0;
//         const { groups, _indices } = value.ILyt.reduce((acc, count, index) => {
//             const _offset = max > 0 ? max + 1 : 0;

//             const subArray = indices.slice(start, start + count).map(v => v + _offset);
//             max = subArray[0];

//             // 过长会堆栈溢出,不能使用...
//             for (let i = 0, l = subArray.length; i < l; i++) {
//                 if (subArray[i] > max) max = subArray[i];
//                 acc._indices.push(subArray[i]);
//             }

//             const group = { start, count, materialIndex: index };
//             start += count;
//             acc.groups.push(group);

//             return acc;
//         }, { groups: [], _indices: [] });

//         geometry.setIndex(_indices);

//         geometry.groups = groups;
//     } else {
//         geometry.setIndex(indices);
//     }

//     if (value.HasUV === undefined || value.HasUV === 1) {
//         const uvs = [];
//         const uvEnd = offset + 4 * vertexCount * 2;
//         while (offset < uvEnd) {
//             uvs.push(dv.getFloat32(offset, true));
//             offset += 4;
//         }
//         geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));

//     }


//     const normals = [];
//     const normalEnd = offset + 4 * vertexCount * 3;
//     while (offset < normalEnd) {
//         normals.push(dv.getFloat32(offset, true));
//         offset += 4;
//     }
//     geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));


//     return geometry;

// }


function _createGeometry(value) {
    // if (value.VLyt.length < 100) return null;

    console.log('开始创建几何体，VLyt长度:', value.VLyt.length, 'ILyt长度:', value.ILyt.length);

    let geometry = new BufferGeometry();

    const dv = new DataView(value.Raw.buffer);

    const vertexCount = value.VLyt.reduce((a, b) => a + b);

    let offset = 0;

    const position = [];
    const vertexEnd = 4 * vertexCount * 3;
    while (offset < vertexEnd) {
        position.push(dv.getFloat32(offset, true));
        offset += 4;
    }
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));


    const triangleIndexCount = value.ILyt.reduce((a, b) => a + b);
    const indices = [];
    const indexEnd = offset + 4 * triangleIndexCount;
    while (offset < indexEnd) {
        indices.push(dv.getInt32(offset, true));
        offset += 4;
    }

    // 处理indices成一个几何体的序号
    if (value.ILyt.length > 1) {
        // 预计算顶点偏移量
        const vertexOffsets = new Array(value.VLyt.length + 1);
        vertexOffsets[0] = 0;
        for (let i = 0; i < value.VLyt.length; i++) {
            vertexOffsets[i + 1] = vertexOffsets[i] + value.VLyt[i];
        }

        const _indices = new Uint32Array(triangleIndexCount);
        let sourceStart = 0;  // 原始索引数组的读取位置
        let targetIndex = 0;  // 新索引数组的写入位置

        // 逐组处理，避免嵌套循环
        for (let groupIndex = 0; groupIndex < value.ILyt.length; groupIndex++) {
            console.log(`处理第 ${groupIndex + 1}/${value.ILyt.length} 组索引`);
            const count = value.ILyt[groupIndex];
            const vertexOffset = vertexOffsets[groupIndex];

            // 批量处理当前组的索引
            const sourceEnd = sourceStart + count;
            for (let i = sourceStart; i < sourceEnd; i++) {
                _indices[targetIndex++] = indices[i] + vertexOffset;
            }

            sourceStart = sourceEnd;
        }

        geometry.setIndex(new BufferAttribute(_indices, 1));

    } else {
        geometry.setIndex(indices);
    }

    if (value.HasUV === undefined || value.HasUV === 1) {
        const uvs = [];
        const uvEnd = offset + 4 * vertexCount * 2;
        while (offset < uvEnd) {
            uvs.push(dv.getFloat32(offset, true));
            offset += 4;
        }
        geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));

    }


    const normals = [];
    const normalEnd = offset + 4 * vertexCount * 3;
    while (offset < normalEnd) {
        normals.push(dv.getFloat32(offset, true));
        offset += 4;
    }
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));

    if (geometry.index.count > 10000000) {

        return _splitGeometryByGroups(geometry, value);;
    }
    return new EdgesGeometry(geometry, 60);


}
function _splitGeometryByGroups(fullGeometry, value) {
    console.log(`按 ${value.VLyt.length} 个组拆分几何体`);
    const edgeGeometries = [];

    // 获取完整几何体的属性
    const fullPositions = fullGeometry.getAttribute('position');
    const fullIndices = fullGeometry.index;
    const fullUVs = fullGeometry.getAttribute('uv');
    const fullNormals = fullGeometry.getAttribute('normal');

    // 计算顶点偏移量
    const vertexOffsets = new Array(value.VLyt.length + 1);
    vertexOffsets[0] = 0;
    for (let i = 0; i < value.VLyt.length; i++) {
        vertexOffsets[i + 1] = vertexOffsets[i] + value.VLyt[i];
    }

    // 计算索引偏移量
    const indexOffsets = new Array(value.ILyt.length + 1);
    indexOffsets[0] = 0;
    for (let i = 0; i < value.ILyt.length; i++) {
        indexOffsets[i + 1] = indexOffsets[i] + value.ILyt[i];
    }

    for (let groupIndex = 0; groupIndex < value.VLyt.length; groupIndex++) {
        console.log(`提取第 ${groupIndex + 1}/${value.VLyt.length} 组`);

        const vertexCount = value.VLyt[groupIndex];
        const indexCount = value.ILyt[groupIndex];
        const vertexStart = vertexOffsets[groupIndex];
        const indexStart = indexOffsets[groupIndex];

        // 检查索引数量限制
        if (indexCount > 5000000) {
            console.log(`第${groupIndex + 1}组索引数量过多(${indexCount})，跳过`);
            continue;
        }

        // 创建新的几何体
        const groupGeometry = new BufferGeometry();

        // 提取顶点位置
        const positions = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount * 3; i++) {
            positions[i] = fullPositions.array[vertexStart * 3 + i];
        }
        groupGeometry.setAttribute('position', new BufferAttribute(positions, 3));

        // 提取索引并调整为相对位置
        const indices = new Uint32Array(indexCount);
        for (let i = 0; i < indexCount; i++) {
            indices[i] = fullIndices.array[indexStart + i] - vertexStart;
        }
        groupGeometry.setIndex(Array.from(indices));

        // 提取UV（如果有）
        if (fullUVs) {
            const uvs = new Float32Array(vertexCount * 2);
            for (let i = 0; i < vertexCount * 2; i++) {
                uvs[i] = fullUVs.array[vertexStart * 2 + i];
            }
            groupGeometry.setAttribute('uv', new BufferAttribute(uvs, 2));
        }

        // 提取法向量
        if (fullNormals) {
            const normals = new Float32Array(vertexCount * 3);
            for (let i = 0; i < vertexCount * 3; i++) {
                normals[i] = fullNormals.array[vertexStart * 3 + i];
            }
            groupGeometry.setAttribute('normal', new BufferAttribute(normals, 3));
        }

        // 创建EdgesGeometry
        const edgeGeometry = new EdgesGeometry(groupGeometry, 60);
        edgeGeometries.push(edgeGeometry);

        // 清理组几何体
        groupGeometry.dispose();
    }

    const mergedGeometry = _mergeEdgeGeometries(edgeGeometries);

    // 清理原始边缘几何体
    edgeGeometries.forEach(geo => geo.dispose());

    return mergedGeometry;

}
function _mergeEdgeGeometries(edgeGeometries) {
    if (edgeGeometries.length === 0) return null;
    if (edgeGeometries.length === 1) return edgeGeometries[0];

    console.log(`开始合并 ${edgeGeometries.length} 个边缘几何体`);

    const mergedGeometry = new BufferGeometry();

    // 计算总的顶点数量
    let totalVertices = 0;
    edgeGeometries.forEach(geo => {
        const posAttr = geo.getAttribute('position');
        totalVertices += posAttr.count;
    });

    console.log(`总顶点数: ${totalVertices}`);

    // 创建合并后的位置数组
    const mergedPositions = new Float32Array(totalVertices * 3);
    let vertexOffset = 0;

    // 合并所有顶点位置
    edgeGeometries.forEach((geo, index) => {
        const posAttr = geo.getAttribute('position');
        const positions = posAttr.array;

        // 直接复制顶点位置到合并数组中
        mergedPositions.set(positions, vertexOffset * 3);
        vertexOffset += posAttr.count;

        console.log(`合并第 ${index + 1}/${edgeGeometries.length} 个几何体，顶点数: ${posAttr.count}`);
    });

    // 设置合并后的位置属性
    mergedGeometry.setAttribute('position', new BufferAttribute(mergedPositions, 3));

    // EdgesGeometry通常不需要索引，因为每两个顶点构成一条线段
    // 但如果某些EdgesGeometry有索引，我们也要合并
    const hasIndices = edgeGeometries.some(geo => geo.index);

    if (hasIndices) {
        let totalIndices = 0;
        edgeGeometries.forEach(geo => {
            if (geo.index) {
                totalIndices += geo.index.count;
            }
        });

        const mergedIndices = new Uint32Array(totalIndices);
        let indexOffset = 0;
        let currentVertexBase = 0;

        edgeGeometries.forEach(geo => {
            if (geo.index) {
                const indices = geo.index.array;
                // 调整索引以指向合并后几何体中的正确位置
                for (let i = 0; i < indices.length; i++) {
                    mergedIndices[indexOffset + i] = indices[i] + currentVertexBase;
                }
                indexOffset += indices.length;
            }

            const posAttr = geo.getAttribute('position');
            currentVertexBase += posAttr.count;
        });

        mergedGeometry.setIndex(Array.from(mergedIndices));
    }

    console.log('边缘几何体合并完成');
    return mergedGeometry;
}
module.exports = { loadDatabase };