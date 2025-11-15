/*
 * pointClean.js
 *
 * y=f(x)用点列クレンジング
 *
 * 使い方:
 * import { ensureFunctionalSamples } from '../js/util/pointClean.js';
 * // rawPoints は [{x,y}, ...]（ワールド座標）
 * const res = ensureFunctionalSamples(rawPoints);
 * if (res.ok) {
 *   // res.sorted を近似器に渡す
 * }
 */

export function ensureFunctionalSamples(samples) {
    // 入力チェック: 点列が足りない
    if (!samples || samples.length < 2) {
        return { ok: false, reason: '点列が不足しています。' };
    }

    // bounding box を計算
    const bbox = (function boundingBox(points) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY };
    })(samples);

    const width = Math.max(bbox.maxX - bbox.minX, 1e-3);
    // 設定値は幅に依存して決める。将来的に外から渡すこともできる。
    const clusterTolerance = Math.max(1e-4, width * 0.002); // x が近ければまとめる
    const jitterTolerance = Math.max(5e-4, width * 0.01); // 小さな逆行は除外
    const severeTolerance = Math.max(0.05, width * 0.12); // これ以上の戻りは致命的

    const cleaned = [];
    const sourceMap = [];
    const droppedIndices = [];
    const adjustments = { merged: 0, jitterMerged: 0, dropped: 0, severeBacktrack: false };

    // 初期点を受け入れる
    let lastAccepted = { x: samples[0].x, y: samples[0].y };
    cleaned.push({ x: lastAccepted.x, y: lastAccepted.y });
    sourceMap.push([0]);

    // 初期の次点選定: start.x より大きい点のうち最小 x を選び、周辺を平均化する
    let startLoopIndex = 1;
    const greaterIndices = [];
    for (let k = 1; k < samples.length; k++) {
        if (samples[k].x > lastAccepted.x) greaterIndices.push(k);
    }
    if (greaterIndices.length > 0) {
        let minX = Infinity;
        for (const k of greaterIndices) minX = Math.min(minX, samples[k].x);
        const clusterIdxs = [];
        for (let k = 1; k < samples.length; k++) {
            if (Math.abs(samples[k].x - minX) <= clusterTolerance) clusterIdxs.push(k);
        }
        if (clusterIdxs.length > 0) {
            let sx = 0, sy = 0;
            for (const k of clusterIdxs) { sx += samples[k].x; sy += samples[k].y; }
            const avgX = sx / clusterIdxs.length; const avgY = sy / clusterIdxs.length;
            cleaned.push({ x: avgX, y: avgY });
            sourceMap.push(clusterIdxs.slice());
            adjustments.merged += Math.max(0, clusterIdxs.length - 1);
            lastAccepted = cleaned[cleaned.length - 1];
            startLoopIndex = Math.max(...clusterIdxs) + 1;
        }
    }

    // メインループ: x が増える方向を優先して受容
    for (let i = startLoopIndex; i < samples.length; i++) {
        const current = samples[i];
        const dx = current.x - lastAccepted.x;

        // 同一 x とみなす -> 結合（平均化）
        if (Math.abs(dx) <= clusterTolerance) {
            adjustments.merged++;
            const prev = cleaned[cleaned.length - 1];
            const newX = (prev.x + current.x) / 2;
            const newY = (prev.y + current.y) / 2;
            cleaned[cleaned.length - 1] = { x: newX, y: newY };
            sourceMap[sourceMap.length - 1].push(i);
            lastAccepted = cleaned[cleaned.length - 1];
            continue;
        }

        // 逆行は除外（小さなものは jitter として除外）
        if (dx < 0) {
            const absDx = Math.abs(dx);
            if (absDx <= jitterTolerance) {
                adjustments.dropped++;
                droppedIndices.push(i);
                continue;
            }
            if (absDx <= severeTolerance) {
                adjustments.dropped++;
                droppedIndices.push(i);
                continue;
            }
            // 致命的な折り返し
            adjustments.severeBacktrack = true;
            break;
        }

        // 通常受容
        cleaned.push({ x: current.x, y: current.y });
        sourceMap.push([i]);
        lastAccepted = cleaned[cleaned.length - 1];
    }

    if (adjustments.severeBacktrack) {
        return { ok: false, reason: '大きな折り返しが検出されたため、y=f(x) とみなせませんでした。' };
    }

    if (cleaned.length < 2) {
        return { ok: false, reason: '正規化後の点列が確保できませんでした。' };
    }

    // 統計情報を計算
    let orientation = 0; let prevSign = 0; let signChanges = 0; let totalLength = 0; let maxBacktrack = 0;
    for (let i = 1; i < cleaned.length; i++) {
        const dx = cleaned[i].x - cleaned[i-1].x;
        const dy = cleaned[i].y - cleaned[i-1].y;
        totalLength += Math.hypot(dx, dy);
        if (Math.abs(dx) > 1e-6) {
            const sign = Math.sign(dx);
            if (prevSign !== 0 && sign !== prevSign) signChanges++;
            prevSign = sign;
            orientation += dx;
            if (dx < 0) maxBacktrack = Math.max(maxBacktrack, Math.abs(dx));
        }
    }

    if (signChanges > 6 || maxBacktrack > severeTolerance) {
        return { ok: false, reason: 'x方向への往復が大きすぎるため近似できませんでした。' };
    }

    const sorted = cleaned.slice().sort((a, b) => a.x - b.x || a.y - b.y);

    return { ok: true, sorted, orientation: orientation >= 0 ? 'left-to-right' : 'right-to-left', totalLength, adjustments, sourceMap, droppedIndices };
}
