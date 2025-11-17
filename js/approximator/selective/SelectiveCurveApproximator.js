import { smoothPoints, resamplePoints, computeBoundingBox } from "../../util/curvePreprocess.js";
import { EquationBuilder } from "../../util/EquationBuilder.js";

const DEFAULT_OPTIONS = {
    smoothingWindow: 0,
    resampleCount: 160,
    tolerance: 0.05,
    maxSpan: 48,
    autoSegments: true,
    segmentCount: 6,
    simplicityGain: 0.3,
    smoothBias: 0.4,
    enableLinear: true,
    enableQuadratic: true,
    enableCubic: true,
    enableArc: true,
    quantizationEnabled: true,
    quantLevelOffset: 0,
    angleThresholdDegrees: 35,
    dedupeTolerance: 1e-4,
    closed: false
};

const EPSILON = 1e-9;
const MIN_POINTS = 2;

function clonePoint(point) {
    return { x: point.x, y: point.y };
}

function toPoint(tuple) {
    return { x: tuple[0], y: tuple[1] };
}

function toTuple(point) {
    return [point.x, point.y];
}

function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v, s) {
    return { x: v.x * s, y: v.y * s };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

function cross(a, b) {
    return a.x * b.y - a.y * b.x;
}

function len(v) {
    return Math.hypot(v.x, v.y);
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v) {
    const length = len(v);
    if (length < EPSILON) {
        return { x: 0, y: 0 };
    }
    return { x: v.x / length, y: v.y / length };
}

function angleBetween(a, b) {
    const la = len(a);
    const lb = len(b);
    if (la < EPSILON || lb < EPSILON) {
        return 0;
    }
    const value = Math.max(-1, Math.min(1, dot(a, b) / (la * lb)));
    return Math.acos(value);
}

function dedupePoints(points, epsilon = 1e-4) {
    if (points.length < 2) {
        return points.slice();
    }
    const result = [points[0]];
    for (let i = 1; i < points.length; i += 1) {
        if (dist(points[i], result[result.length - 1]) > epsilon) {
            result.push(points[i]);
        }
    }
    return result;
}

function normalizeSymmetric(points) {
    const bbox = computeBoundingBox(points.map((p) => [p.x, p.y]));
    const cx = (bbox.xMin + bbox.xMax) / 2;
    const cy = (bbox.yMin + bbox.yMax) / 2;
    const half = Math.max((bbox.xMax - bbox.xMin) / 2, (bbox.yMax - bbox.yMin) / 2, EPSILON);
    const normalized = points.map((p) => ({
        x: (p.x - cx) / half,
        y: (p.y - cy) / half
    }));
    return {
        normalized,
        transform: {
            center: { x: cx, y: cy },
            scale: half
        }
    };
}

function denormalizePoint(point, transform) {
    return {
        x: point.x * transform.scale + transform.center.x,
        y: point.y * transform.scale + transform.center.y
    };
}

function normalizePoint(point, transform) {
    return {
        x: (point.x - transform.center.x) / transform.scale,
        y: (point.y - transform.center.y) / transform.scale
    };
}

function detectMandatorySplits(points, thresholdRadians) {
    const splits = new Set();
    for (let i = 1; i < points.length - 1; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const v0 = sub(curr, prev);
        const v1 = sub(next, curr);
        const l0 = len(v0);
        const l1 = len(v1);
        if (l0 < EPSILON || l1 < EPSILON) {
            continue;
        }
        const angle = angleBetween(v0, v1);
        const dotSign = dot(v0, v1) / (l0 * l1);
        if (angle > thresholdRadians || dotSign < 0) {
            splits.add(i);
        }
    }
    return Array.from(splits).sort((a, b) => a - b);
}

function buildSections(pointsLength, splitIndices) {
    const sections = [];
    let start = 0;
    const sorted = splitIndices.filter((index) => index > 0 && index < pointsLength - 1).sort((a, b) => a - b);
    for (const idx of sorted) {
        sections.push({ start, end: idx });
        start = idx;
    }
    sections.push({ start, end: pointsLength - 1 });
    return sections;
}

function evaluateSegment(segment, t) {
    const omt = 1 - t;
    if (segment.type === "linear") {
        return {
            x: omt * segment.start.x + t * segment.end.x,
            y: omt * segment.start.y + t * segment.end.y
        };
    }
    if (segment.type === "quadratic") {
        return {
            x: omt * omt * segment.p0.x + 2 * omt * t * segment.p1.x + t * t * segment.p2.x,
            y: omt * omt * segment.p0.y + 2 * omt * t * segment.p1.y + t * t * segment.p2.y
        };
    }
    if (segment.type === "cubic") {
        return {
            x: omt * omt * omt * segment.p0.x
                + 3 * omt * omt * t * segment.p1.x
                + 3 * omt * t * t * segment.p2.x
                + t * t * t * segment.p3.x,
            y: omt * omt * omt * segment.p0.y
                + 3 * omt * omt * t * segment.p1.y
                + 3 * omt * t * t * segment.p2.y
                + t * t * t * segment.p3.y
        };
    }
    if (segment.type === "arc") {
        const theta = segment.startAngle + segment.sweepDirection * segment.sweepAngle * t;
        return {
            x: segment.center.x + segment.radius * Math.cos(theta),
            y: segment.center.y + segment.radius * Math.sin(theta)
        };
    }
    return { x: 0, y: 0 };
}

function measureSegmentError(points, segment) {
    if (!points || points.length === 0) {
        return { rms: 0, max: 0 };
    }
    const samples = Math.max(8, Math.min(40, points.length * 2));
    let sumSq = 0;
    let maxErr = 0;
    for (let i = 0; i < samples; i += 1) {
        const t = samples === 1 ? 0 : i / (samples - 1);
        const evaluated = evaluateSegment(segment, t);
        const index = Math.min(points.length - 1, Math.round(t * (points.length - 1)));
        const error = dist(evaluated, points[index]);
        sumSq += error * error;
        if (error > maxErr) {
            maxErr = error;
        }
    }
    return {
        rms: Math.sqrt(sumSq / samples),
        max: maxErr
    };
}

function fitLinearCandidate(slice) {
    const start = slice[0];
    const end = slice[slice.length - 1];
    const segment = {
        type: "linear",
        start: clonePoint(start),
        end: clonePoint(end)
    };
    const metrics = measureSegmentError(slice, segment);
    return { segment, metrics };
}

function fitQuadraticCandidate(slice) {
    if (slice.length < 3) {
        return null;
    }
    const p0 = slice[0];
    const p2 = slice[slice.length - 1];
    let accum = { x: 0, y: 0 };
    let totalWeight = 0;
    const n = slice.length;
    for (let i = 0; i < n; i += 1) {
        const t = n === 1 ? 0 : i / (n - 1);
        const weight = 2 * t * (1 - t);
        if (weight < 1e-3) {
            continue;
        }
        const omt = 1 - t;
        const basis = {
            x: slice[i].x - (omt * omt * p0.x + t * t * p2.x),
            y: slice[i].y - (omt * omt * p0.y + t * t * p2.y)
        };
        accum = add(accum, scale(basis, 1 / weight));
        totalWeight += 1;
    }
    if (totalWeight === 0) {
        return null;
    }
    const p1 = scale(accum, 1 / totalWeight);
    const segment = {
        type: "quadratic",
        p0: clonePoint(p0),
        p1,
        p2: clonePoint(p2)
    };
    const metrics = measureSegmentError(slice, segment);
    return { segment, metrics };
}

function fitCubicCandidate(slice) {
    if (slice.length < 4) {
        return null;
    }
    const p0 = slice[0];
    const p3 = slice[slice.length - 1];
    const tangentStart = normalize(sub(slice[Math.min(1, slice.length - 1)], p0));
    const tangentEnd = normalize(sub(p3, slice[Math.max(slice.length - 2, 0)]));
    const lengthEstimate = Math.max(dist(p3, p0), 1e-3);
    const p1 = add(p0, scale(tangentStart, lengthEstimate / 3));
    const p2 = sub(p3, scale(tangentEnd, lengthEstimate / 3));
    const segment = {
        type: "cubic",
        p0: clonePoint(p0),
        p1,
        p2,
        p3: clonePoint(p3)
    };
    const metrics = measureSegmentError(slice, segment);
    return { segment, metrics };
}

function circumcircle(a, b, c) {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-6) {
        return null;
    }
    const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y)
        + (b.x * b.x + b.y * b.y) * (c.y - a.y)
        + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
    const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x)
        + (b.x * b.x + b.y * b.y) * (a.x - c.x)
        + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
    const center = { x: ux, y: uy };
    const radius = dist(center, a);
    if (!Number.isFinite(radius) || radius < 1e-6) {
        return null;
    }
    return { center, radius };
}

function shortestAngleDiff(a, b) {
    let diff = b - a;
    while (diff > Math.PI) {
        diff -= Math.PI * 2;
    }
    while (diff < -Math.PI) {
        diff += Math.PI * 2;
    }
    return diff;
}

function fitArcCandidate(slice) {
    if (slice.length < 3) {
        return null;
    }
    const p0 = slice[0];
    const p3 = slice[slice.length - 1];
    const mid = slice[Math.floor(slice.length / 2)];
    const circle = circumcircle(p0, mid, p3);
    if (!circle) {
        return null;
    }
    const { center, radius } = circle;
    const startAngle = Math.atan2(p0.y - center.y, p0.x - center.x);
    const endAngle = Math.atan2(p3.y - center.y, p3.x - center.x);
    let sweep = shortestAngleDiff(startAngle, endAngle);
    const sweepDirection = sweep >= 0 ? 1 : -1;
    sweep = Math.abs(sweep);
    if (!Number.isFinite(radius) || radius < 1e-3 || sweep < 1e-3) {
        return null;
    }
    const segment = {
        type: "arc",
        center,
        radius,
        startAngle,
        endAngle,
        sweepAngle: sweep,
        sweepDirection,
        start: clonePoint(p0),
        end: clonePoint(p3)
    };
    const metrics = measureSegmentError(slice, segment);
    return { segment, metrics };
}

function quantizeNormalizedSegment(segment, transform, step) {
    if (!segment) {
        return null;
    }
    if (!step || step <= 0 || !transform) {
        return cloneSegment(segment);
    }
    const toWorld = (p) => denormalizePoint(p, transform);
    const toNormalized = (p) => normalizePoint(p, transform);

    if (segment.type === "linear") {
        const startWorld = snapPoint(toWorld(segment.start), step);
        const endWorld = snapPoint(toWorld(segment.end), step);
        if (dist(startWorld, endWorld) < 1e-6) {
            return null;
        }
        return {
            type: "linear",
            start: toNormalized(startWorld),
            end: toNormalized(endWorld)
        };
    }
    if (segment.type === "quadratic") {
        const p0World = snapPoint(toWorld(segment.p0), step);
        const p1World = snapPoint(toWorld(segment.p1), step);
        const p2World = snapPoint(toWorld(segment.p2), step);
        if (dist(p0World, p2World) < 1e-6) {
            return null;
        }
        return {
            type: "quadratic",
            p0: toNormalized(p0World),
            p1: toNormalized(p1World),
            p2: toNormalized(p2World)
        };
    }
    if (segment.type === "cubic") {
        const p0World = snapPoint(toWorld(segment.p0), step);
        const p1World = snapPoint(toWorld(segment.p1), step);
        const p2World = snapPoint(toWorld(segment.p2), step);
        const p3World = snapPoint(toWorld(segment.p3), step);
        if (dist(p0World, p3World) < 1e-6) {
            return null;
        }
        return {
            type: "cubic",
            p0: toNormalized(p0World),
            p1: toNormalized(p1World),
            p2: toNormalized(p2World),
            p3: toNormalized(p3World)
        };
    }
    if (segment.type === "arc") {
        const startWorld = snapPoint(toWorld(segment.start), step);
        const endWorld = snapPoint(toWorld(segment.end), step);
        const centerWorld = snapPoint(toWorld(segment.center), step);
        const radius = dist(centerWorld, startWorld);
        if (!Number.isFinite(radius) || radius < 1e-4) {
            return null;
        }
        const startAngle = Math.atan2(startWorld.y - centerWorld.y, startWorld.x - centerWorld.x);
        const endAngle = Math.atan2(endWorld.y - centerWorld.y, endWorld.x - centerWorld.x);
        let sweep = shortestAngleDiff(startAngle, endAngle);
        if (Math.abs(sweep) < 1e-6) {
            return null;
        }
        const sweepDirection = sweep >= 0 ? 1 : -1;
        sweep = Math.abs(sweep);
        return {
            type: "arc",
            center: toNormalized(centerWorld),
            radius: radius / transform.scale,
            startAngle,
            endAngle,
            sweepAngle: sweep,
            sweepDirection,
            start: toNormalized(startWorld),
            end: toNormalized(endWorld)
        };
    }
    return cloneSegment(segment);
}

function prepareCandidate(baseCandidate, slice, transform, quantization) {
    if (!baseCandidate || !baseCandidate.segment) {
        return null;
    }
    const originalSegment = cloneSegment(baseCandidate.segment);
    let workingSegment = cloneSegment(baseCandidate.segment);
    let metrics = baseCandidate.metrics || measureSegmentError(slice, workingSegment);

    if (quantization && quantization.enabled && quantization.step > 0) {
        const quantized = quantizeNormalizedSegment(workingSegment, transform, quantization.step);
        if (!quantized) {
            return null;
        }
        workingSegment = quantized;
        if (workingSegment.type === "arc") {
            canonicalizeArcSegment(workingSegment);
        }
        metrics = measureSegmentError(slice, workingSegment);
    }

    return {
        segment: workingSegment,
        metrics,
        originalSegment
    };
}

function buildCandidates(points, startIndex, endIndex, options, transform, quantization) {
    const slice = points.slice(startIndex, endIndex + 1).map(clonePoint);
    if (slice.length < 2) {
        return [];
    }
    const candidates = [];
    if (options.enableLinear) {
        const base = fitLinearCandidate(slice);
        const prepared = base ? prepareCandidate(base, slice, transform, quantization) : null;
        if (prepared) {
            candidates.push({ key: "linear", data: prepared });
        }
    }
    if (options.enableQuadratic) {
        const base = fitQuadraticCandidate(slice);
        const prepared = base ? prepareCandidate(base, slice, transform, quantization) : null;
        if (prepared) {
            candidates.push({ key: "quadratic", data: prepared });
        }
    }
    if (options.enableCubic) {
        const base = fitCubicCandidate(slice);
        const prepared = base ? prepareCandidate(base, slice, transform, quantization) : null;
        if (prepared) {
            candidates.push({ key: "cubic", data: prepared });
        }
    }
    if (options.enableArc) {
        const base = fitArcCandidate(slice);
        const prepared = base ? prepareCandidate(base, slice, transform, quantization) : null;
        if (prepared) {
            candidates.push({ key: "arc", data: prepared });
        }
    }
    return candidates;
}

function optimizeSectionAuto(points, options, transform, quantization) {
    const n = points.length;
    if (n < 2) {
        return [];
    }
    const tolerance = Math.max(options.tolerance, 1e-5);
    const maxSpan = Math.max(2, Math.min(options.maxSpan || DEFAULT_OPTIONS.maxSpan, n - 1));
    const dp = new Array(n).fill(Number.POSITIVE_INFINITY);
    const prev = new Array(n).fill(null);
    dp[0] = 0;
    const typeEnabled = {
        linear: options.enableLinear !== false,
        quadratic: options.enableQuadratic !== false,
        cubic: options.enableCubic !== false,
        arc: options.enableArc !== false
    };

    for (let j = 1; j < n; j += 1) {
        const spanStart = Math.max(0, j - maxSpan);
        for (let i = spanStart; i < j; i += 1) {
            const candidates = buildCandidates(points, i, j, options, transform, quantization);
            for (const entry of candidates) {
                if (!typeEnabled[entry.key]) {
                    continue;
                }
                const { segment, metrics } = entry.data;
                if (!segment) {
                    continue;
                }
                if (metrics.rms > tolerance * 3) {
                    continue;
                }
                const scaledError = metrics.rms / Math.max(tolerance, 1e-6);
                const penalty = Number.isFinite(options.simplicityGain) ? options.simplicityGain : 0;
                const cost = dp[i] + scaledError + penalty;
                if (cost < dp[j]) {
                    dp[j] = cost;
                    prev[j] = {
                        index: i,
                        type: entry.key,
                        segment,
                        metrics,
                        originalSegment: entry.data.originalSegment ? cloneSegment(entry.data.originalSegment) : null
                    };
                }
            }
        }
    }

    if (!Number.isFinite(dp[n - 1])) {
        return [];
    }

    const segments = [];
    let cursor = n - 1;
    while (cursor > 0) {
        const step = prev[cursor];
        if (!step) {
            break;
        }
        segments.push({
            type: step.type,
            segment: cloneSegment(step.segment),
            metrics: step.metrics,
            startIndex: step.index,
            endIndex: cursor,
            originalSegment: step.originalSegment ? cloneSegment(step.originalSegment) : null
        });
        cursor = step.index;
    }
    segments.reverse();
    return segments;
}

function optimizeSectionFixed(points, options, desiredCount, transform, quantization) {
    const n = points.length;
    if (n < 2 || desiredCount <= 0) {
        return [];
    }
    const breakpoints = new Set([0, n - 1]);
    for (let k = 1; k < desiredCount; k += 1) {
        const idx = Math.round((n - 1) * (k / desiredCount));
        breakpoints.add(idx);
    }
    const sorted = Array.from(breakpoints).sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
        const start = sorted[i];
        const end = sorted[i + 1];
        if (end - start < 1) {
            continue;
        }
        const candidates = buildCandidates(points, start, end, options, transform, quantization);
        if (!candidates.length) {
            continue;
        }
        candidates.sort((a, b) => a.data.metrics.rms - b.data.metrics.rms);
        const chosen = candidates[0];
        segments.push({
            type: chosen.key,
            segment: cloneSegment(chosen.data.segment),
            metrics: chosen.data.metrics,
            startIndex: start,
            endIndex: end,
            originalSegment: chosen.data.originalSegment ? cloneSegment(chosen.data.originalSegment) : null
        });
    }
    return segments;
}

function segmentEndPoint(segment) {
    if (segment.type === "linear") return segment.end;
    if (segment.type === "quadratic") return segment.p2;
    if (segment.type === "cubic") return segment.p3;
    if (segment.type === "arc") return segment.end;
    return { x: 0, y: 0 };
}

function segmentStartPoint(segment) {
    if (segment.type === "linear") return segment.start;
    if (segment.type === "quadratic") return segment.p0;
    if (segment.type === "cubic") return segment.p0;
    if (segment.type === "arc") return segment.start;
    return { x: 0, y: 0 };
}

function segmentStartTangent(segment) {
    if (segment.type === "linear") return normalize(sub(segment.end, segment.start));
    if (segment.type === "quadratic") return normalize(sub(segment.p1, segment.p0));
    if (segment.type === "cubic") return normalize(sub(segment.p1, segment.p0));
    if (segment.type === "arc") {
        const tangent = {
            x: -(segment.start.y - segment.center.y),
            y: segment.start.x - segment.center.x
        };
        return normalize(tangent);
    }
    return null;
}

function segmentEndTangent(segment) {
    if (segment.type === "linear") return normalize(sub(segment.end, segment.start));
    if (segment.type === "quadratic") return normalize(sub(segment.p2, segment.p1));
    if (segment.type === "cubic") return normalize(sub(segment.p3, segment.p2));
    if (segment.type === "arc") {
        const tangent = {
            x: -(segment.end.y - segment.center.y),
            y: segment.end.x - segment.center.x
        };
        return normalize(tangent);
    }
    return null;
}

function applyTangent(segment, direction, position) {
    if (!direction) {
        return;
    }
    if (segment.type === "quadratic") {
        if (position === "start") {
            const length = len(sub(segment.p1, segment.p0));
            segment.p1 = {
                x: segment.p0.x + direction.x * length,
                y: segment.p0.y + direction.y * length
            };
        } else {
            const length = len(sub(segment.p2, segment.p1));
            segment.p1 = {
                x: segment.p2.x - direction.x * length,
                y: segment.p2.y - direction.y * length
            };
        }
    } else if (segment.type === "cubic") {
        if (position === "start") {
            const length = len(sub(segment.p1, segment.p0));
            segment.p1 = {
                x: segment.p0.x + direction.x * length,
                y: segment.p0.y + direction.y * length
            };
        } else {
            const length = len(sub(segment.p3, segment.p2));
            segment.p2 = {
                x: segment.p3.x - direction.x * length,
                y: segment.p3.y - direction.y * length
            };
        }
    }
}

function alignSegmentAnchors(segment, startPoint, endPoint) {
    if (!segment) {
        return;
    }
    if (segment.type === "linear") {
        segment.start = clonePoint(startPoint);
        segment.end = clonePoint(endPoint);
    } else if (segment.type === "quadratic") {
        segment.p0 = clonePoint(startPoint);
        segment.p2 = clonePoint(endPoint);
    } else if (segment.type === "cubic") {
        segment.p0 = clonePoint(startPoint);
        segment.p3 = clonePoint(endPoint);
    } else if (segment.type === "arc") {
        segment.start = clonePoint(startPoint);
        segment.end = clonePoint(endPoint);
        const startAngle = Math.atan2(segment.start.y - segment.center.y, segment.start.x - segment.center.x);
        const endAngle = Math.atan2(segment.end.y - segment.center.y, segment.end.x - segment.center.x);
        segment.startAngle = startAngle;
        segment.endAngle = endAngle;
        segment.sweepAngle = Math.abs(shortestAngleDiff(startAngle, endAngle));
        segment.sweepDirection = shortestAngleDiff(startAngle, endAngle) >= 0 ? 1 : -1;
    }
}

function setSegmentStart(segment, point) {
    if (segment.type === "linear") {
        segment.start = clonePoint(point);
    } else if (segment.type === "quadratic") {
        segment.p0 = clonePoint(point);
    } else if (segment.type === "cubic") {
        segment.p0 = clonePoint(point);
    } else if (segment.type === "arc") {
        segment.start = clonePoint(point);
        segment.startAngle = Math.atan2(point.y - segment.center.y, point.x - segment.center.x);
        segment.sweepAngle = Math.abs(shortestAngleDiff(segment.startAngle, segment.endAngle));
        segment.sweepDirection = shortestAngleDiff(segment.startAngle, segment.endAngle) >= 0 ? 1 : -1;
    }
}

function enforceContinuity(segments, smoothBias = 0, quantizationEnabled = false) {
    if (!segments.length) {
        return;
    }
    const effectiveBias = quantizationEnabled ? 0 : Math.max(0, Math.min(1, smoothBias || 0));

    let lastEnd = segmentEndPoint(segments[0].segment);
    let lastRawEnd = segmentEndPoint(segments[0].originalSegment || segments[0].segment);

    for (let i = 1; i < segments.length; i += 1) {
        const prev = segments[i - 1];
        const curr = segments[i];

        setSegmentStart(curr.segment, lastEnd);
        if (curr.originalSegment) {
            setSegmentStart(curr.originalSegment, lastRawEnd);
        }

        lastEnd = segmentEndPoint(curr.segment);
        lastRawEnd = segmentEndPoint(curr.originalSegment || curr.segment);

        if (effectiveBias <= 0) {
            continue;
        }

        const prevTan = segmentEndTangent(prev.segment);
        const currTan = segmentStartTangent(curr.segment);
        if (!prevTan || !currTan) {
            continue;
        }

        const angle = angleBetween(prevTan, currTan);
        if (angle >= Math.PI / 2) {
            continue;
        }

        const blended = normalize({
            x: prevTan.x * (1 - effectiveBias) + currTan.x * effectiveBias,
            y: prevTan.y * (1 - effectiveBias) + currTan.y * effectiveBias
        });

        applyTangent(curr.segment, blended, "start");
        applyTangent(prev.segment, blended, "end");

        if (curr.originalSegment && prev.originalSegment) {
            const prevRawTan = segmentEndTangent(prev.originalSegment);
            const currRawTan = segmentStartTangent(curr.originalSegment);
            if (prevRawTan && currRawTan) {
                const blendedRaw = normalize({
                    x: prevRawTan.x * (1 - effectiveBias) + currRawTan.x * effectiveBias,
                    y: prevRawTan.y * (1 - effectiveBias) + currRawTan.y * effectiveBias
                });
                applyTangent(curr.originalSegment, blendedRaw, "start");
                applyTangent(prev.originalSegment, blendedRaw, "end");
            }
        }
    }
}

function denormalizeSegment(segment, transform) {
    if (segment.type === "linear") {
        return {
            type: "linear",
            start: denormalizePoint(segment.start, transform),
            end: denormalizePoint(segment.end, transform)
        };
    }
    if (segment.type === "quadratic") {
        return {
            type: "quadratic",
            p0: denormalizePoint(segment.p0, transform),
            p1: denormalizePoint(segment.p1, transform),
            p2: denormalizePoint(segment.p2, transform)
        };
    }
    if (segment.type === "cubic") {
        return {
            type: "cubic",
            p0: denormalizePoint(segment.p0, transform),
            p1: denormalizePoint(segment.p1, transform),
            p2: denormalizePoint(segment.p2, transform),
            p3: denormalizePoint(segment.p3, transform)
        };
    }
    if (segment.type === "arc") {
        return {
            type: "arc",
            center: denormalizePoint(segment.center, transform),
            radius: segment.radius * transform.scale,
            startAngle: segment.startAngle,
            endAngle: segment.endAngle,
            sweepAngle: segment.sweepAngle,
            sweepDirection: segment.sweepDirection,
            start: denormalizePoint(segment.start, transform),
            end: denormalizePoint(segment.end, transform)
        };
    }
    return segment;
}

function snap(value, step) {
    return Math.round(value / step) * step;
}

function snapPoint(point, step) {
    return {
        x: snap(point.x, step),
        y: snap(point.y, step)
    };
}

function quantizeSegment(segment, step) {
    if (!step || step <= 0) {
        return segment;
    }
    if (segment.type === "linear") {
        const start = { x: snap(segment.start.x, step), y: snap(segment.start.y, step) };
        const end = { x: snap(segment.end.x, step), y: snap(segment.end.y, step) };
        if (dist(start, end) < 1e-6) {
            return null;
        }
        return { type: "linear", start, end };
    }
    if (segment.type === "quadratic") {
        const p0 = { x: snap(segment.p0.x, step), y: snap(segment.p0.y, step) };
        const p1 = { x: snap(segment.p1.x, step), y: snap(segment.p1.y, step) };
        const p2 = { x: snap(segment.p2.x, step), y: snap(segment.p2.y, step) };
        if (dist(p0, p2) < 1e-6) {
            return null;
        }
        return { type: "quadratic", p0, p1, p2 };
    }
    if (segment.type === "cubic") {
        const p0 = { x: snap(segment.p0.x, step), y: snap(segment.p0.y, step) };
        const p1 = { x: snap(segment.p1.x, step), y: snap(segment.p1.y, step) };
        const p2 = { x: snap(segment.p2.x, step), y: snap(segment.p2.y, step) };
        const p3 = { x: snap(segment.p3.x, step), y: snap(segment.p3.y, step) };
        if (dist(p0, p3) < 1e-6) {
            return null;
        }
        return { type: "cubic", p0, p1, p2, p3 };
    }
    if (segment.type === "arc") {
        const start = { x: snap(segment.start.x, step), y: snap(segment.start.y, step) };
        const end = { x: snap(segment.end.x, step), y: snap(segment.end.y, step) };
        const center = { x: snap(segment.center.x, step), y: snap(segment.center.y, step) };
        const radius = dist(center, start);
        if (!Number.isFinite(radius) || radius < 1e-4) {
            return null;
        }
        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
        let sweep = shortestAngleDiff(startAngle, endAngle);
        const sweepDirection = sweep >= 0 ? 1 : -1;
        sweep = Math.abs(sweep);
        if (sweep < 1e-6) {
            return null;
        }
        return {
            type: "arc",
            center,
            radius,
            startAngle,
            endAngle,
            sweepAngle: sweep,
            sweepDirection,
            start,
            end
        };
    }
    return segment;
}

function canonicalizeArcSegment(segment) {
    if (!segment || segment.type !== "arc") {
        return segment;
    }
    const { center, start, end } = segment;
    const radiusStart = dist(center, start);
    const radiusEnd = dist(center, end);
    const radius = (radiusStart + radiusEnd) / 2;
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let sweep = shortestAngleDiff(startAngle, endAngle);
    const sweepDirection = sweep >= 0 ? 1 : -1;
    sweep = Math.abs(sweep);
    return {
        type: "arc",
        center,
        radius,
        startAngle,
        endAngle,
        sweepAngle: sweep,
        sweepDirection,
        start,
        end
    };
}

function buildSvgPath(segments) {
    if (!segments.length) {
        return "";
    }
    const first = segmentStartPoint(segments[0]);
    let path = `M ${first.x} ${first.y}`;
    for (const seg of segments) {
        if (seg.type === "linear") {
            path += ` L ${seg.end.x} ${seg.end.y}`;
        } else if (seg.type === "quadratic") {
            path += ` Q ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y}`;
        } else if (seg.type === "cubic") {
            path += ` C ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y} ${seg.p3.x} ${seg.p3.y}`;
        } else if (seg.type === "arc") {
            const largeArc = seg.sweepAngle > Math.PI ? 1 : 0;
            const sweepFlag = seg.sweepDirection >= 0 ? 1 : 0;
            path += ` A ${seg.radius} ${seg.radius} 0 ${largeArc} ${sweepFlag} ${seg.end.x} ${seg.end.y}`;
        }
    }
    return path;
}

function collectKnots(segments) {
    const knots = [];
    const tolerance = 1e-6;
    const pushUnique = (point) => {
        if (!point) {
            return;
        }
        const exists = knots.some((k) => Math.abs(k[0] - point.x) < tolerance && Math.abs(k[1] - point.y) < tolerance);
        if (!exists) {
            knots.push([point.x, point.y]);
        }
    };
    segments.forEach((seg, index) => {
        if (index === 0) {
            pushUnique(segmentStartPoint(seg));
        }
        pushUnique(segmentEndPoint(seg));
    });
    return knots;
}

function segmentToSummary(seg, metrics) {
    if (seg.type === "linear") {
        return {
            type: "linear",
            points: [toTuple(seg.start), toTuple(seg.end)],
            metrics
        };
    }
    if (seg.type === "quadratic") {
        return {
            type: "quadratic",
            controlPoints: [toTuple(seg.p0), toTuple(seg.p1), toTuple(seg.p2)],
            metrics
        };
    }
    if (seg.type === "cubic") {
        return {
            type: "cubic",
            controlPoints: [toTuple(seg.p0), toTuple(seg.p1), toTuple(seg.p2), toTuple(seg.p3)],
            metrics
        };
    }
    if (seg.type === "arc") {
        return {
            type: "arc",
            center: toTuple(seg.center),
            radius: seg.radius,
            startAngle: seg.startAngle,
            endAngle: seg.endAngle,
            sweepAngle: seg.sweepAngle,
            sweepDirection: seg.sweepDirection,
            start: toTuple(seg.start),
            end: toTuple(seg.end),
            metrics
        };
    }
    return { type: seg.type, metrics };
}

function evaluateSegmentMetrics(segment, originalSlice) {
    const metrics = measureSegmentError(originalSlice, segment);
    return metrics;
}

function detectGridStep(range) {
    if (range > 1000) return 100;
    if (range > 100) return 10;
    if (range > 10) return 1;
    if (range > 1) return 0.1;
    return 0.01;
}

function extractSlice(points, start, end) {
    return points.slice(start, end + 1);
}

function aggregateMetrics(segments, originalPoints) {
    let totalWeighted = 0;
    let totalSamples = 0;
    let maxError = 0;
    segments.forEach((entry) => {
        const slice = extractSlice(originalPoints, entry.startIndex, entry.endIndex).map(clonePoint);
        const metrics = evaluateSegmentMetrics(entry.segment, slice);
        entry.metrics = metrics;
        totalWeighted += metrics.rms * slice.length;
        totalSamples += slice.length;
        if (metrics.max > maxError) {
            maxError = metrics.max;
        }
    });
    const rms = totalSamples > 0 ? totalWeighted / totalSamples : 0;
    return { rms, max: maxError };
}

function cloneSegment(segment) {
    if (segment.type === "linear") {
        return {
            type: "linear",
            start: clonePoint(segment.start),
            end: clonePoint(segment.end)
        };
    }
    if (segment.type === "quadratic") {
        return {
            type: "quadratic",
            p0: clonePoint(segment.p0),
            p1: clonePoint(segment.p1),
            p2: clonePoint(segment.p2)
        };
    }
    if (segment.type === "cubic") {
        return {
            type: "cubic",
            p0: clonePoint(segment.p0),
            p1: clonePoint(segment.p1),
            p2: clonePoint(segment.p2),
            p3: clonePoint(segment.p3)
        };
    }
    if (segment.type === "arc") {
        return {
            type: "arc",
            center: clonePoint(segment.center),
            radius: segment.radius,
            startAngle: segment.startAngle,
            endAngle: segment.endAngle,
            sweepAngle: segment.sweepAngle,
            sweepDirection: segment.sweepDirection,
            start: clonePoint(segment.start),
            end: clonePoint(segment.end)
        };
    }
    return segment;
}

export class SelectiveCurveApproximator {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    static get approximatorType() {
        return "selectiveHybrid";
    }

    setOptions(options = {}) {
        if (!options || typeof options !== "object") return;
        this.options = { ...this.options, ...options };
    }

    getDefaultOptions() {
        return { ...DEFAULT_OPTIONS };
    }

    approximate(points = [], domain = null, overrides = {}) {
        const effectiveOptions = { ...this.options, ...overrides };
        if (!Array.isArray(points) || points.length < MIN_POINTS) {
            return {
                success: false,
                type: SelectiveCurveApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain,
                diagnostics: {
                    reason: "Insufficient points",
                    required: MIN_POINTS,
                    received: Array.isArray(points) ? points.length : 0
                }
            };
        }

        const inputPoints = points.map(toPoint);
        const deduped = dedupePoints(inputPoints, effectiveOptions.dedupeTolerance);
        if (deduped.length < MIN_POINTS) {
            return {
                success: false,
                type: SelectiveCurveApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain,
                diagnostics: {
                    reason: "Degenerate stroke",
                    pointCount: deduped.length
                }
            };
        }

        let working = deduped.slice();
        if (effectiveOptions.smoothingWindow > 0) {
            const windowSize = Math.max(1, effectiveOptions.smoothingWindow * 2 + 1);
            working = smoothPoints(working.map((p) => [p.x, p.y]), windowSize).map(toPoint);
        }
        if (effectiveOptions.resampleCount && effectiveOptions.resampleCount > 2) {
            working = resamplePoints(working.map((p) => [p.x, p.y]), effectiveOptions.resampleCount, {
                closed: effectiveOptions.closed
            }).map(toPoint);
        }

        if (working.length < MIN_POINTS) {
            return {
                success: false,
                type: SelectiveCurveApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain,
                diagnostics: {
                    reason: "Post-processing removed too many points",
                    pointCount: working.length
                }
            };
        }

        const bbox = computeBoundingBox(working.map((p) => [p.x, p.y]));
        const range = Math.max(bbox.xMax - bbox.xMin, bbox.yMax - bbox.yMin, 1);
        const baseStep = detectGridStep(range);
        const quantStep = effectiveOptions.quantizationEnabled
            ? baseStep * Math.pow(10, effectiveOptions.quantLevelOffset || 0)
            : null;
        const quantizationContext = (effectiveOptions.quantizationEnabled && Number.isFinite(quantStep) && quantStep > 0)
            ? { enabled: true, step: quantStep }
            : { enabled: false, step: 0 };

        const normalizedInfo = normalizeSymmetric(working);
        const normalized = normalizedInfo.normalized;
        const sections = buildSections(normalized.length, detectMandatorySplits(
            normalized,
            (effectiveOptions.angleThresholdDegrees || DEFAULT_OPTIONS.angleThresholdDegrees) * Math.PI / 180
        ));

        const sectionSegments = [];
        for (const section of sections) {
            const subset = normalized.slice(section.start, section.end + 1).map(clonePoint);
            const localOptions = {
                ...effectiveOptions,
                tolerance: effectiveOptions.tolerance,
                maxSpan: effectiveOptions.maxSpan
            };
            const segments = effectiveOptions.autoSegments
                ? optimizeSectionAuto(subset, localOptions, normalizedInfo.transform, quantizationContext)
                : optimizeSectionFixed(subset, localOptions, effectiveOptions.segmentCount, normalizedInfo.transform, quantizationContext);
            sectionSegments.push({
                start: section.start,
                segments
            });
        }

        const combined = [];
        sectionSegments.forEach((entry) => {
            entry.segments.forEach((seg) => {
                const globalStartIndex = seg.startIndex + entry.start;
                const globalEndIndex = seg.endIndex + entry.start;
                const startPoint = normalized[globalStartIndex];
                const endPoint = normalized[globalEndIndex];
                const workingSegment = cloneSegment(seg.segment);
                const rawSegment = seg.originalSegment ? cloneSegment(seg.originalSegment) : null;

                if (!quantizationContext.enabled) {
                    alignSegmentAnchors(workingSegment, startPoint, endPoint);
                    if (rawSegment) {
                        alignSegmentAnchors(rawSegment, startPoint, endPoint);
                    }
                }

                combined.push({
                    type: seg.type,
                    segment: workingSegment,
                    metrics: seg.metrics,
                    startIndex: globalStartIndex,
                    endIndex: globalEndIndex,
                    originalSegment: rawSegment
                });
            });
        });

        if (!combined.length) {
            return {
                success: false,
                type: SelectiveCurveApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain,
                diagnostics: {
                    reason: "No segments produced",
                    pointCount: normalized.length
                }
            };
        }

        enforceContinuity(combined, effectiveOptions.smoothBias, quantizationContext.enabled);

        const worldSegmentsRaw = combined.map((entry) => ({
            type: entry.type,
            segment: denormalizeSegment(entry.originalSegment || entry.segment, normalizedInfo.transform),
            metrics: entry.metrics,
            startIndex: entry.startIndex,
            endIndex: entry.endIndex
        }));

        const worldSegmentsQuant = worldSegmentsRaw.map((entry) => {
            if (!quantizationContext.enabled) {
                return cloneSegment(entry.segment);
            }
            const quantized = quantizeSegment(entry.segment, quantStep);
            if (!quantized) {
                return cloneSegment(entry.segment);
            }
            if (quantized.type === "arc") {
                return canonicalizeArcSegment(quantized);
            }
            return quantized;
        });

        const aggregateRaw = aggregateMetrics(worldSegmentsRaw.map((entry, index) => ({
            segment: entry.segment,
            startIndex: entry.startIndex,
            endIndex: entry.endIndex,
            metrics: entry.metrics
        })), working);

        const aggregateQuant = aggregateMetrics(worldSegmentsRaw.map((entry, index) => ({
            segment: worldSegmentsQuant[index],
            startIndex: entry.startIndex,
            endIndex: entry.endIndex,
            metrics: entry.metrics
        })), working);

        const finalSegments = worldSegmentsQuant.map((segment, index) => segmentToSummary(segment, worldSegmentsRaw[index].metrics));
        const svgPath = buildSvgPath(worldSegmentsQuant.map((segment, index) => ({
            type: segment.type,
            start: segmentStartPoint(segment),
            end: segmentEndPoint(segment),
            p0: segment.p0,
            p1: segment.p1,
            p2: segment.p2,
            p3: segment.p3,
            center: segment.center,
            radius: segment.radius,
            startAngle: segment.startAngle,
            endAngle: segment.endAngle,
            sweepAngle: segment.sweepAngle,
            sweepDirection: segment.sweepDirection
        })));
        const knotTuples = collectKnots(worldSegmentsQuant);

        const latexEquations = finalSegments.map((seg, index) => {
            const metrics = seg.metrics || {};
            const meta = {
                segmentIndex: index,
                rms: metrics.rms ?? null,
                maxError: metrics.max ?? null,
                type: seg.type
            };

            let equation = null;
            if (seg.type === "linear" && Array.isArray(seg.points) && seg.points.length >= 2) {
                equation = EquationBuilder.linearThroughPoints(seg.points[0], seg.points[1], {
                    decimals: 3,
                    meta
                });
            } else if (seg.type === "quadratic" && Array.isArray(seg.controlPoints) && seg.controlPoints.length === 3) {
                equation = EquationBuilder.quadraticBezier({
                    p0: seg.controlPoints[0],
                    p1: seg.controlPoints[1],
                    p2: seg.controlPoints[2],
                    meta
                }, { decimals: 3 });
            } else if (seg.type === "cubic" && Array.isArray(seg.controlPoints) && seg.controlPoints.length === 4) {
                equation = EquationBuilder.cubicBezier({
                    p0: seg.controlPoints[0],
                    p1: seg.controlPoints[1],
                    p2: seg.controlPoints[2],
                    p3: seg.controlPoints[3],
                    meta
                }, { decimals: 3 });
            } else if (seg.type === "arc" && seg.center && typeof seg.radius === "number") {
                equation = EquationBuilder.arc({
                    center: seg.center,
                    radius: seg.radius,
                    startAngle: seg.startAngle,
                    endAngle: seg.endAngle,
                    direction: seg.sweepDirection,
                    meta
                }, { decimals: 3 });
            } else {
                equation = EquationBuilder.label({
                    text: `Segment ${index + 1}: ${String(seg.type).toUpperCase()}`,
                    type: seg.type,
                    meta
                }, { decimals: 3 });
            }

            seg.equation = equation;
            return equation;
        });

        const domainInfo = domain || {
            xMin: bbox.xMin,
            xMax: bbox.xMax,
            yMin: bbox.yMin,
            yMax: bbox.yMax,
            width: bbox.xMax - bbox.xMin,
            height: bbox.yMax - bbox.yMin
        };

        const diagnostics = {
            pointCount: working.length,
            segmentCount: finalSegments.length,
            tolerance: effectiveOptions.tolerance,
            rawRms: aggregateRaw.rms,
            rawMaxError: aggregateRaw.max,
            quantizedRms: aggregateQuant.rms,
            quantizedMaxError: aggregateQuant.max,
            quantizationStep: quantizationContext.enabled ? quantStep : null,
            options: effectiveOptions
        };

        const exportData = {
            type: SelectiveCurveApproximator.approximatorType,
            segments: finalSegments,
            svgPath,
            knots: knotTuples,
            originalPoints: Array.isArray(working) ? working.map(p => [p.x, p.y]) : null,
            domain: domainInfo,
            quantization: quantizationContext.enabled ? {
                step: quantStep,
                enabled: true
            } : { enabled: false }
        };

        return {
            success: true,
            type: SelectiveCurveApproximator.approximatorType,
            svgPath,
            latexEquations,
            segments: finalSegments,
            knots: knotTuples,
            domain: domainInfo,
            exportData,
            diagnostics
        };
    }
}
