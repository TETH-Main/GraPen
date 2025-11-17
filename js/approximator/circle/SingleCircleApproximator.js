import { preprocessCurve } from "../../util/curvePreprocess.js";
import { EquationBuilder } from "../../util/EquationBuilder.js";

const DEFAULT_OPTIONS = {
    enableEllipse: true,
    preferEllipse: false,
    quantizationEnabled: false,
    quantizeCenter: true,
    quantizeAxes: true,
    maxEccentricity: 0.8,
    circleSnapRatio: 0.08,
    smoothWindow: 5,
    resampleCount: 128,
    pruneTolerance: 0,
    closed: true,
    circleRmsTolerance: 0.015,
    ellipseRmsTolerance: 0.02,
    maxEndpointGapRatio: 0.4,
    minCoverageRatio: 0.6
};

const EPSILON = 1e-9;

function roundToStep(value, step) {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    const rounded = Math.round(value / step) * step;
    return Number.isFinite(rounded) ? Number(rounded.toFixed(6)) : rounded;
}

function deriveQuantizationStep(range) {
    const safeRange = Math.max(Number.isFinite(range) ? range : 1, EPSILON);
    const exponent = Math.floor(Math.log10(safeRange)) - 1;
    const clampedExponent = Math.max(Math.min(exponent, 6), -6);
    const step = Math.pow(10, clampedExponent);
    return { step, exponent: clampedExponent };
}

function computeBounds(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
        const [x, y] = points[i];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }
    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function computeEllipseRms(points, center, radiusX, radiusY, rotation) {
    if (!Array.isArray(points) || points.length === 0) {
        return 0;
    }
    const cosT = Math.cos(rotation);
    const sinT = Math.sin(rotation);
    let sumSq = 0;
    const scale = Math.max(radiusX, radiusY, EPSILON);
    for (let i = 0; i < points.length; i += 1) {
        const dx = points[i][0] - center[0];
        const dy = points[i][1] - center[1];
        const u = cosT * dx + sinT * dy;
        const v = -sinT * dx + cosT * dy;
        const normalized = Math.sqrt(
            (u * u) / (radiusX * radiusX + EPSILON) + (v * v) / (radiusY * radiusY + EPSILON)
        );
        const err = Math.abs(1 - normalized) * scale;
        sumSq += err * err;
    }
    return Math.sqrt(sumSq / points.length);
}

function computeCircleFit(points) {
    // Kåsa 法による円フィッティング
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;
    let sumXXX = 0;
    let sumYYY = 0;
    let sumXYY = 0;
    let sumXXY = 0;
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
        const x = points[i][0];
        const y = points[i][1];
        const xx = x * x;
        const yy = y * y;
        sumX += x;
        sumY += y;
        sumXX += xx;
        sumYY += yy;
        sumXY += x * y;
        sumXXX += xx * x;
        sumYYY += yy * y;
        sumXYY += x * yy;
        sumXXY += xx * y;
    }

    const c = n * sumXX - sumX * sumX;
    const d = n * sumXY - sumX * sumY;
    const e = n * sumYY - sumY * sumY;
    const g = 0.5 * (n * (sumXXX + sumXYY) - sumX * (sumXX + sumYY));
    const h = 0.5 * (n * (sumXXY + sumYYY) - sumY * (sumXX + sumYY));
    const denominator = c * e - d * d;
    if (Math.abs(denominator) < EPSILON) {
        return null;
    }
    const centerX = (g * e - d * h) / denominator;
    const centerY = (c * h - d * g) / denominator;
    let radiusSum = 0;
    for (let i = 0; i < n; i += 1) {
        const dx = points[i][0] - centerX;
        const dy = points[i][1] - centerY;
        radiusSum += Math.hypot(dx, dy);
    }
    const radius = radiusSum / n;
    if (!Number.isFinite(radius) || radius <= EPSILON) {
        return null;
    }
    return { center: [centerX, centerY], radius };
}

export function computeCircleRms(points, center, radius) {
    if (!points.length) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
        const dx = points[i][0] - center[0];
        const dy = points[i][1] - center[1];
        const dist = Math.hypot(dx, dy);
        const diff = dist - radius;
        sum += diff * diff;
    }
    return Math.sqrt(sum / points.length);
}

export function buildCircleSvgPath(center, radius) {
    const [cx, cy] = center;
    const startX = cx + radius;
    const startY = cy;
    const path = [
        `M ${startX} ${startY}`,
        `A ${radius} ${radius} 0 1 0 ${cx - radius} ${cy}`,
        `A ${radius} ${radius} 0 1 0 ${startX} ${startY}`
    ];
    return path.join(" ");
}

export function fitCircle(points) {
    return computeCircleFit(points);
}

export function generateCircleKnots(center, radius, sampleCount = 4) {
    const [cx, cy] = center;
    if (!Number.isFinite(radius) || radius <= EPSILON) {
        return [[cx, cy]];
    }
    const count = Math.max(1, sampleCount | 0);
    const knots = [];
    for (let i = 0; i < count; i += 1) {
        const angle = (2 * Math.PI * i) / count;
        knots.push([
            cx + radius * Math.cos(angle),
            cy + radius * Math.sin(angle)
        ]);
    }
    return knots;
}

function computeStrokeLength(points) {
    if (!Array.isArray(points) || points.length < 2) {
        return 0;
    }
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        length += Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
    }
    return length;
}

function approximateEllipsePerimeter(radiusX, radiusY) {
    if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX <= EPSILON || radiusY <= EPSILON) {
        return 0;
    }
    const h = Math.pow(radiusX - radiusY, 2) / Math.pow(radiusX + radiusY, 2);
    return Math.PI * (radiusX + radiusY) * (1 + (3 * h) / (10 + Math.sqrt(Math.max(0, 4 - 3 * h))));
}

function buildEllipseSvgPath(center, radiusX, radiusY, rotation) {
    const [cx, cy] = center;
    const cosT = Math.cos(rotation);
    const sinT = Math.sin(rotation);
    const startX = cx + radiusX * cosT;
    const startY = cy + radiusX * sinT;
    const oppositeX = cx - radiusX * cosT;
    const oppositeY = cy - radiusX * sinT;
    const rotationDeg = (rotation * 180) / Math.PI;
    return [
        `M ${startX} ${startY}`,
        `A ${radiusX} ${radiusY} ${rotationDeg} 0 1 ${oppositeX} ${oppositeY}`,
        `A ${radiusX} ${radiusY} ${rotationDeg} 0 1 ${startX} ${startY}`
    ].join(" ");
}

function generateEllipseKnots(center, radiusX, radiusY, rotation, sampleCount = 4) {
    const [cx, cy] = center;
    const cosT = Math.cos(rotation);
    const sinT = Math.sin(rotation);
    const count = Math.max(1, sampleCount | 0);
    const knots = [];
    for (let i = 0; i < count; i += 1) {
        const theta = (2 * Math.PI * i) / count;
        const localX = radiusX * Math.cos(theta);
        const localY = radiusY * Math.sin(theta);
        const x = cx + localX * cosT - localY * sinT;
        const y = cy + localX * sinT + localY * cosT;
        knots.push([x, y]);
    }
    return knots;
}

function computeEllipseFit(points) {
    if (!Array.isArray(points) || points.length < 5) {
        return null;
    }

    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i += 1) {
        sumX += points[i][0];
        sumY += points[i][1];
    }
    const cx = sumX / n;
    const cy = sumY / n;

    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let i = 0; i < n; i += 1) {
        const dx = points[i][0] - cx;
        const dy = points[i][1] - cy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }

    sxx /= n;
    syy /= n;
    sxy /= n;

    let rotation = 0;
    if (Math.abs(sxy) > 1e-12) {
        rotation = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    } else {
        rotation = sxx >= syy ? 0 : Math.PI / 2;
    }

    const cosT = Math.cos(rotation);
    const sinT = Math.sin(rotation);

    let sumU2 = 0;
    let sumV2 = 0;
    let sumU4 = 0;
    let sumV4 = 0;
    let sumU2V2 = 0;
    let maxU = 0;
    let maxV = 0;
    const samples = new Array(n);

    for (let i = 0; i < n; i += 1) {
        const dx = points[i][0] - cx;
        const dy = points[i][1] - cy;
        const u = cosT * dx + sinT * dy;
        const v = -sinT * dx + cosT * dy;
        samples[i] = { u, v };
        const u2 = u * u;
        const v2 = v * v;
        sumU2 += u2;
        sumV2 += v2;
        sumU4 += u2 * u2;
        sumV4 += v2 * v2;
        sumU2V2 += u2 * v2;
        if (Math.abs(u) > maxU) {
            maxU = Math.abs(u);
        }
        if (Math.abs(v) > maxV) {
            maxV = Math.abs(v);
        }
    }

    sumU2 /= n;
    sumV2 /= n;
    sumU4 /= n;
    sumV4 /= n;
    sumU2V2 /= n;

    let radiusX = Math.max(maxU, EPSILON);
    let radiusY = Math.max(maxV, EPSILON);
    const denom = sumU4 * sumV4 - sumU2V2 * sumU2V2;
    if (Math.abs(denom) > 1e-12) {
        const A = (sumU2 * sumV4 - sumV2 * sumU2V2) / denom;
        const C = (sumV2 * sumU4 - sumU2 * sumU2V2) / denom;
        if (A > EPSILON && C > EPSILON) {
            radiusX = Math.sqrt(1 / A);
            radiusY = Math.sqrt(1 / C);
        }
    }

    if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX <= EPSILON || radiusY <= EPSILON) {
        return null;
    }

    let sumSq = 0;
    let sumSqNorm = 0;
    let maxError = 0;
    const scale = Math.max(radiusX, radiusY, EPSILON);
    for (let i = 0; i < n; i += 1) {
        const { u, v } = samples[i];
        const normalized = Math.sqrt(
            (u * u) / (radiusX * radiusX + EPSILON) + (v * v) / (radiusY * radiusY + EPSILON)
        );
        const errNorm = Math.abs(1 - normalized);
        const err = errNorm * scale;
        sumSq += err * err;
        sumSqNorm += errNorm * errNorm;
        if (err > maxError) {
            maxError = err;
        }
    }

    const rms = Math.sqrt(sumSq / n);
    const normalizedRms = Math.sqrt(sumSqNorm / n);
    const axisRatio = Math.min(radiusX, radiusY) / Math.max(radiusX, radiusY);

    return {
        center: [cx, cy],
        radiusX,
        radiusY,
        rotation,
        rms,
        normalizedRms,
        maxError,
        axisRatio
    };
}

/**
 * 単一の円／楕円近似器（代数的円フィッティングを使用）
 */
export class SingleCircleApproximator {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    static get approximatorType() {
        return "singleCircle";
    }

    getDefaultOptions() {
        return { ...DEFAULT_OPTIONS };
    }

    /**
     * @param {Array<[number, number]>} points cleaned point sequence
     * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} domain viewport info
     * @param {Object} overrides runtime overrides coming from UI
     * @returns {{ success: boolean, type: string, svgPath: string, latexEquations: Array<string>, segments: Array<Object>, knots: Array<number>, domain: any, diagnostics: Object }}
     */
    approximate(points = [], domain = null, overrides = {}) {
        const effectiveOptions = { ...this.options, ...overrides };
        if (!Array.isArray(points) || points.length < 3) {
            return {
                success: false,
                type: SingleCircleApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain,
                diagnostics: {
                    reason: "Insufficient points",
                    required: 3,
                    received: Array.isArray(points) ? points.length : 0
                }
            };
        }

        const preprocess = preprocessCurve(points, {
            smoothWindow: effectiveOptions.smoothWindow,
            resampleCount: effectiveOptions.resampleCount,
            pruneTolerance: effectiveOptions.pruneTolerance,
            domain
        });

        const processedPoints = preprocess.points;
        if (!Array.isArray(processedPoints) || processedPoints.length < 3) {
            return {
                success: false,
                type: SingleCircleApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain: preprocess.domain,
                diagnostics: {
                    reason: "Preprocessing removed too many points",
                    pointCount: Array.isArray(processedPoints) ? processedPoints.length : 0
                }
            };
        }

        const firstPoint = processedPoints[0];
        const lastPoint = processedPoints[processedPoints.length - 1];
        const closingGap = Math.hypot(firstPoint[0] - lastPoint[0], firstPoint[1] - lastPoint[1]);
        const strokeLength = computeStrokeLength(processedPoints);
        const scale = Math.max(1, Math.max(preprocess.domain.width ?? 0, preprocess.domain.height ?? 0));
        const bounds = computeBounds(processedPoints);
        const quantizationRange = Math.max(
            bounds.width,
            bounds.height,
            preprocess.domain?.width ?? 0,
            preprocess.domain?.height ?? 0,
            1
        );
        const quantizationEnabled = !!effectiveOptions.quantizationEnabled;
        const { step: autoQuantStep, exponent: quantizationPower } = deriveQuantizationStep(quantizationRange);
        const quantizationActive = quantizationEnabled
            && Number.isFinite(autoQuantStep)
            && autoQuantStep > EPSILON;
        const quantizationStep = quantizationActive ? autoQuantStep : null;
        const quantizeCenter = effectiveOptions.quantizeCenter !== false;
        const quantizeAxes = effectiveOptions.quantizeAxes !== false;

        const circleFit = computeCircleFit(processedPoints);
        let circleCandidate = null;
        if (circleFit) {
            const circleRms = computeCircleRms(processedPoints, circleFit.center, circleFit.radius);
            const perimeter = 2 * Math.PI * circleFit.radius;
            const coverage = perimeter > EPSILON ? Math.min(2, strokeLength / perimeter) : 0;
            const gapRatio = circleFit.radius > EPSILON ? closingGap / circleFit.radius : Number.POSITIVE_INFINITY;
            circleCandidate = {
                kind: "circle",
                center: circleFit.center,
                radius: circleFit.radius,
                rms: circleRms,
                normalizedRms: circleRms / Math.max(scale, EPSILON),
                coverage,
                gapRatio,
                perimeter,
                success: circleRms <= effectiveOptions.circleRmsTolerance * scale
                    && gapRatio <= effectiveOptions.maxEndpointGapRatio
                    && coverage >= effectiveOptions.minCoverageRatio
            };
        }

        let ellipseCandidate = null;
        if (effectiveOptions.enableEllipse) {
            const ellipseFit = computeEllipseFit(processedPoints);
            if (ellipseFit) {
                const avgRadius = (ellipseFit.radiusX + ellipseFit.radiusY) / 2;
                const perimeter = approximateEllipsePerimeter(ellipseFit.radiusX, ellipseFit.radiusY);
                const coverage = perimeter > EPSILON ? Math.min(2, strokeLength / perimeter) : 0;
                const gapRatio = avgRadius > EPSILON ? closingGap / avgRadius : Number.POSITIVE_INFINITY;
                const eccentricity = 1 - ellipseFit.axisRatio;
                const ellipseSuccess = ellipseFit.rms <= effectiveOptions.ellipseRmsTolerance * scale
                    && gapRatio <= effectiveOptions.maxEndpointGapRatio
                    && coverage >= effectiveOptions.minCoverageRatio
                    && eccentricity <= effectiveOptions.maxEccentricity;
                ellipseCandidate = {
                    kind: "ellipse",
                    center: ellipseFit.center,
                    radiusX: ellipseFit.radiusX,
                    radiusY: ellipseFit.radiusY,
                    rotation: ellipseFit.rotation,
                    rms: ellipseFit.rms,
                    normalizedRms: ellipseFit.rms / Math.max(scale, EPSILON),
                    coverage,
                    gapRatio,
                    eccentricity,
                    axisRatio: ellipseFit.axisRatio,
                    perimeter,
                    success: ellipseSuccess
                };
            }
        }

        let chosen = null;
        if (ellipseCandidate && ellipseCandidate.success) {
            const radiusDiffRatio = Math.abs(ellipseCandidate.radiusX - ellipseCandidate.radiusY)
                / Math.max(ellipseCandidate.radiusX, ellipseCandidate.radiusY);
            if (radiusDiffRatio <= effectiveOptions.circleSnapRatio) {
                if (circleCandidate && circleCandidate.success) {
                    chosen = circleCandidate;
                } else {
                    const snappedRadius = (ellipseCandidate.radiusX + ellipseCandidate.radiusY) / 2;
                    const snappedPerimeter = 2 * Math.PI * snappedRadius;
                    const snappedCoverage = snappedPerimeter > EPSILON ? Math.min(2, strokeLength / snappedPerimeter) : 0;
                    const snappedGapRatio = snappedRadius > EPSILON ? closingGap / snappedRadius : Number.POSITIVE_INFINITY;
                    const snappedSuccess = ellipseCandidate.rms <= effectiveOptions.circleRmsTolerance * scale
                        && snappedGapRatio <= effectiveOptions.maxEndpointGapRatio
                        && snappedCoverage >= effectiveOptions.minCoverageRatio;
                    if (snappedSuccess) {
                        chosen = {
                            kind: "circle",
                            center: ellipseCandidate.center,
                            radius: snappedRadius,
                            rms: ellipseCandidate.rms,
                            normalizedRms: ellipseCandidate.rms / Math.max(scale, EPSILON),
                            coverage: snappedCoverage,
                            gapRatio: snappedGapRatio,
                            perimeter: snappedPerimeter,
                            success: true,
                            snappedFromEllipse: true
                        };
                    } else {
                        chosen = ellipseCandidate;
                    }
                }
            } else if (!circleCandidate || !circleCandidate.success) {
                chosen = ellipseCandidate;
            } else {
                const ellipsePreferred = effectiveOptions.preferEllipse
                    || ellipseCandidate.rms + 1e-6 < circleCandidate.rms
                    || ellipseCandidate.coverage > circleCandidate.coverage + 0.05;
                chosen = ellipsePreferred ? ellipseCandidate : circleCandidate;
            }
        }

        if (!chosen && circleCandidate && circleCandidate.success) {
            chosen = circleCandidate;
        }

        if (!chosen && ellipseCandidate && ellipseCandidate.success) {
            chosen = ellipseCandidate;
        }

        if (!chosen) {
            return {
                success: false,
                type: SingleCircleApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain: preprocess.domain,
                diagnostics: {
                    reason: "Circle/ellipse gating rejected stroke",
                    pointCount: processedPoints.length,
                    closingGap,
                    strokeLength,
                    circleCandidate: circleCandidate ? {
                        success: circleCandidate.success,
                        rms: circleCandidate.rms,
                        gapRatio: circleCandidate.gapRatio,
                        coverage: circleCandidate.coverage
                    } : null,
                    ellipseCandidate: ellipseCandidate ? {
                        success: ellipseCandidate.success,
                        rms: ellipseCandidate.rms,
                        gapRatio: ellipseCandidate.gapRatio,
                        coverage: ellipseCandidate.coverage,
                        eccentricity: ellipseCandidate.eccentricity
                    } : null,
                    options: effectiveOptions
                }
            };
        }

        if (quantizationActive && chosen) {
            const baseSuccess = chosen.success;
            if (chosen.kind === "circle") {
                const quantizedCenter = quantizeCenter && Array.isArray(chosen.center)
                    ? [
                        roundToStep(chosen.center[0], quantizationStep),
                        roundToStep(chosen.center[1], quantizationStep)
                    ]
                    : (Array.isArray(chosen.center) ? chosen.center.slice() : chosen.center);
                let quantizedRadius = quantizeAxes
                    ? roundToStep(chosen.radius, quantizationStep)
                    : chosen.radius;
                if (!Number.isFinite(quantizedRadius) || quantizedRadius <= EPSILON) {
                    const fallbackRadius = Math.max(chosen.radius, quantizationStep * 0.25, EPSILON);
                    quantizedRadius = Number.isFinite(fallbackRadius) ? fallbackRadius : EPSILON;
                }
                const perimeter = 2 * Math.PI * quantizedRadius;
                const coverage = perimeter > EPSILON ? Math.min(2, strokeLength / perimeter) : 0;
                const gapRatio = quantizedRadius > EPSILON ? closingGap / quantizedRadius : Number.POSITIVE_INFINITY;
                const quantizedRms = computeCircleRms(processedPoints, quantizedCenter, quantizedRadius);
                const quantizedSuccess = quantizedRms <= effectiveOptions.circleRmsTolerance * scale
                    && gapRatio <= effectiveOptions.maxEndpointGapRatio
                    && coverage >= effectiveOptions.minCoverageRatio;
                chosen = {
                    ...chosen,
                    center: quantizedCenter,
                    radius: quantizedRadius,
                    rms: quantizedRms,
                    normalizedRms: quantizedRms / Math.max(scale, EPSILON),
                    coverage,
                    gapRatio,
                    perimeter,
                    success: baseSuccess && quantizedSuccess,
                    quantization: {
                        enabled: true,
                        step: quantizationStep,
                        power: quantizationPower,
                        appliedCenter: quantizeCenter,
                        appliedAxes: quantizeAxes,
                        range: quantizationRange,
                        success: quantizedSuccess,
                        baseSuccess
                    }
                };
            } else if (chosen.kind === "ellipse") {
                const quantizedCenter = quantizeCenter && Array.isArray(chosen.center)
                    ? [
                        roundToStep(chosen.center[0], quantizationStep),
                        roundToStep(chosen.center[1], quantizationStep)
                    ]
                    : (Array.isArray(chosen.center) ? chosen.center.slice() : chosen.center);
                let radiusX = quantizeAxes ? roundToStep(chosen.radiusX, quantizationStep) : chosen.radiusX;
                let radiusY = quantizeAxes ? roundToStep(chosen.radiusY, quantizationStep) : chosen.radiusY;
                if (!Number.isFinite(radiusX) || radiusX <= EPSILON) {
                    const fallbackX = Math.max(chosen.radiusX, quantizationStep * 0.25, EPSILON);
                    radiusX = Number.isFinite(fallbackX) ? fallbackX : EPSILON;
                }
                if (!Number.isFinite(radiusY) || radiusY <= EPSILON) {
                    const fallbackY = Math.max(chosen.radiusY, quantizationStep * 0.25, EPSILON);
                    radiusY = Number.isFinite(fallbackY) ? fallbackY : EPSILON;
                }
                const avgRadius = (radiusX + radiusY) / 2;
                const perimeter = approximateEllipsePerimeter(radiusX, radiusY);
                const coverage = perimeter > EPSILON ? Math.min(2, strokeLength / perimeter) : 0;
                const gapRatio = avgRadius > EPSILON ? closingGap / avgRadius : Number.POSITIVE_INFINITY;
                const axisRatio = Math.min(radiusX, radiusY) / Math.max(radiusX, radiusY, EPSILON);
                const eccentricity = 1 - axisRatio;
                const quantizedRms = computeEllipseRms(processedPoints, quantizedCenter, radiusX, radiusY, chosen.rotation);
                const quantizedSuccess = quantizedRms <= effectiveOptions.ellipseRmsTolerance * scale
                    && gapRatio <= effectiveOptions.maxEndpointGapRatio
                    && coverage >= effectiveOptions.minCoverageRatio
                    && eccentricity <= effectiveOptions.maxEccentricity;
                chosen = {
                    ...chosen,
                    center: quantizedCenter,
                    radiusX,
                    radiusY,
                    rms: quantizedRms,
                    normalizedRms: quantizedRms / Math.max(scale, EPSILON),
                    coverage,
                    gapRatio,
                    perimeter,
                    axisRatio,
                    eccentricity,
                    success: baseSuccess && quantizedSuccess,
                    quantization: {
                        enabled: true,
                        step: quantizationStep,
                        power: quantizationPower,
                        appliedCenter: quantizeCenter,
                        appliedAxes: quantizeAxes,
                        range: quantizationRange,
                        success: quantizedSuccess,
                        baseSuccess
                    }
                };
            }
        }

        if (chosen.kind === "circle") {
            const svgPath = buildCircleSvgPath(chosen.center, chosen.radius);
            const equation = EquationBuilder.circle({
                center: chosen.center,
                radius: chosen.radius,
                meta: {
                    rms: chosen.rms,
                    normalizedRms: chosen.normalizedRms,
                    coverage: chosen.coverage,
                    gapRatio: chosen.gapRatio,
                    snappedFromEllipse: !!chosen.snappedFromEllipse
                }
            }, { decimals: 3 });
            const knotTuples = generateCircleKnots(chosen.center, chosen.radius, 4);
            const exportData = {
                type: SingleCircleApproximator.approximatorType,
                shape: "circle",
                center: Array.isArray(chosen.center) ? chosen.center.slice() : chosen.center,
                radius: chosen.radius,
                svgPath,
                knots: knotTuples,
                originalPoints: Array.isArray(processedPoints) ? processedPoints : null,
                domain: preprocess.domain,
                snappedFromEllipse: !!chosen.snappedFromEllipse,
                quantization: quantizationActive ? chosen.quantization : null
            };
            return {
                success: true,
                type: SingleCircleApproximator.approximatorType,
                svgPath,
                latexEquations: [equation],
                segments: [
                    {
                        type: "circle",
                        center: chosen.center,
                        radius: chosen.radius,
                        rmsError: chosen.rms,
                        snappedFromEllipse: !!chosen.snappedFromEllipse,
                        equation
                    }
                ],
                knots: knotTuples,
                domain: preprocess.domain,
                exportData,
                diagnostics: {
                    rmsError: chosen.rms,
                    normalizedRms: chosen.normalizedRms,
                    pointCount: processedPoints.length,
                    strokeLength,
                    closingGap,
                    closingGapRatio: chosen.gapRatio,
                    coverage: chosen.coverage,
                    selectedShape: "circle",
                    quantization: quantizationActive ? chosen.quantization : null,
                    circleCandidate: circleCandidate ? {
                        success: circleCandidate.success,
                        rms: circleCandidate.rms,
                        gapRatio: circleCandidate.gapRatio,
                        coverage: circleCandidate.coverage
                    } : null,
                    ellipseCandidate: ellipseCandidate ? {
                        success: ellipseCandidate.success,
                        rms: ellipseCandidate.rms,
                        gapRatio: ellipseCandidate.gapRatio,
                        coverage: ellipseCandidate.coverage,
                        eccentricity: ellipseCandidate.eccentricity
                    } : null,
                    options: effectiveOptions
                }
            };
        }

        const ellipseResult = chosen;
        const svgPath = buildEllipseSvgPath(ellipseResult.center, ellipseResult.radiusX, ellipseResult.radiusY, ellipseResult.rotation);
        const equation = EquationBuilder.ellipse({
            center: ellipseResult.center,
            radiusX: ellipseResult.radiusX,
            radiusY: ellipseResult.radiusY,
            rotation: ellipseResult.rotation,
            meta: {
                rms: ellipseResult.rms,
                normalizedRms: ellipseResult.normalizedRms,
                coverage: ellipseResult.coverage,
                gapRatio: ellipseResult.gapRatio,
                eccentricity: ellipseResult.eccentricity
            }
        }, { decimals: 3 });
        const knotTuples = generateEllipseKnots(ellipseResult.center, ellipseResult.radiusX, ellipseResult.radiusY, ellipseResult.rotation, 4);
        const exportData = {
            type: SingleCircleApproximator.approximatorType,
            shape: "ellipse",
            center: Array.isArray(ellipseResult.center) ? ellipseResult.center.slice() : ellipseResult.center,
            radiusX: ellipseResult.radiusX,
            radiusY: ellipseResult.radiusY,
            rotation: ellipseResult.rotation,
            svgPath,
            knots: knotTuples,
            originalPoints: Array.isArray(processedPoints) ? processedPoints : null,
            domain: preprocess.domain,
            quantization: quantizationActive ? ellipseResult.quantization : null
        };
        return {
            success: true,
            type: SingleCircleApproximator.approximatorType,
            svgPath,
            latexEquations: [equation],
            segments: [
                {
                    type: "ellipse",
                    center: ellipseResult.center,
                    radiusX: ellipseResult.radiusX,
                    radiusY: ellipseResult.radiusY,
                    rotation: ellipseResult.rotation,
                    rmsError: ellipseResult.rms,
                    eccentricity: ellipseResult.eccentricity,
                    equation
                }
            ],
            knots: knotTuples,
            domain: preprocess.domain,
            exportData,
            diagnostics: {
                rmsError: ellipseResult.rms,
                normalizedRms: ellipseResult.normalizedRms,
                pointCount: processedPoints.length,
                strokeLength,
                closingGap,
                closingGapRatio: ellipseResult.gapRatio,
                coverage: ellipseResult.coverage,
                selectedShape: "ellipse",
                quantization: quantizationActive ? ellipseResult.quantization : null,
                circleCandidate: circleCandidate ? {
                    success: circleCandidate.success,
                    rms: circleCandidate.rms,
                    gapRatio: circleCandidate.gapRatio,
                    coverage: circleCandidate.coverage
                } : null,
                ellipseCandidate: {
                    success: ellipseCandidate ? ellipseCandidate.success : null,
                    rms: ellipseCandidate ? ellipseCandidate.rms : null,
                    gapRatio: ellipseCandidate ? ellipseCandidate.gapRatio : null,
                    coverage: ellipseCandidate ? ellipseCandidate.coverage : null,
                    eccentricity: ellipseCandidate ? ellipseCandidate.eccentricity : null
                },
                options: effectiveOptions
            }
        };
    }
}
