import { preprocessCurve, denormalizePoints } from "../../util/curvePreprocess.js";
import { fitQuadraticBezierControlPoints } from "./SingleQuadraticBezierApproximator.js";

const DEFAULT_OPTIONS = {
    maxSegments: 8,
    enforceC1: true,
    smoothWindow: 5,
    resampleCount: 128,
    pruneTolerance: 0,
    closed: false
};

const EPSILON = 1e-9;

function evalQuadratic(p0, p1, p2, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const blend = 2 * mt * t;
    return [
        mt2 * p0[0] + blend * p1[0] + t2 * p2[0],
        mt2 * p0[1] + blend * p1[1] + t2 * p2[1]
    ];
}

function computeSegmentRms(points, controlPoints) {
    if (!points.length) return 0;
    const [p0, p1, p2] = controlPoints;
    let error = 0;
    for (let i = 0; i < points.length; i += 1) {
        const t = points.length === 1 ? 0 : i / (points.length - 1);
        const [x, y] = evalQuadratic(p0, p1, p2, t);
        const dx = points[i][0] - x;
        const dy = points[i][1] - y;
        error += dx * dx + dy * dy;
    }
    return Math.sqrt(error / points.length);
}

function enforceC1Continuity(prevControlPoints, currentControlPoints) {
    if (!prevControlPoints) {
        return currentControlPoints;
    }
    const [, prevP1, prevP2] = prevControlPoints;
    const [p0, p1, p2] = currentControlPoints;
    const tangentX = prevP2[0] - prevP1[0];
    const tangentY = prevP2[1] - prevP1[1];
    const adjustedP1 = [
        p0[0] + tangentX,
        p0[1] + tangentY
    ];
    return [p0, adjustedP1, p2];
}

/**
 * Quadratic Bézier chain approximator that splits the trace into multiple segments.
 */
export class QuadraticBezierChainApproximator {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    static get approximatorType() {
        return "quadraticChain";
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
                type: QuadraticBezierChainApproximator.approximatorType,
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
            closed: effectiveOptions.closed,
            domain
        });

        const normalized = preprocess.normalized;
        const totalPoints = normalized.length;
        const segmentEstimate = Math.max(1, Math.round(totalPoints / 32));
        const segmentCount = Math.min(effectiveOptions.maxSegments, Math.max(1, segmentEstimate));

        const knotPoints = [];
        const segments = [];
        let svgPath = "";
        const latexEquations = [];
        let prevControl = null;
        let accumulatedError = 0;
        let accumulatedSamples = 0;

        let startIndex = 0;
        const { domain: fittedDomain } = preprocess;

        for (let seg = 0; seg < segmentCount; seg += 1) {
            const remainingSegments = segmentCount - seg;
            const remainingPoints = totalPoints - startIndex - 1;
            const minChunk = Math.max(2, Math.floor(remainingPoints / remainingSegments));
            let endIndex = startIndex + minChunk;
            if (seg === segmentCount - 1) {
                endIndex = totalPoints - 1;
            }
            endIndex = Math.min(totalPoints - 1, endIndex);
            if (endIndex <= startIndex) {
                endIndex = Math.min(totalPoints - 1, startIndex + 2);
            }

            const slice = normalized.slice(startIndex, endIndex + 1);
            if (slice.length < 3 && endIndex < totalPoints - 1) {
                const extendBy = Math.min(totalPoints - 1, endIndex + (3 - slice.length));
                endIndex = extendBy;
            }
            const segmentPoints = normalized.slice(startIndex, endIndex + 1);
            let fit = fitQuadraticBezierControlPoints(segmentPoints);
            if (!fit) {
                const fallbackP0 = segmentPoints[0];
                const fallbackP2 = segmentPoints[segmentPoints.length - 1];
                const fallbackP1 = [
                    (fallbackP0[0] + fallbackP2[0]) / 2,
                    (fallbackP0[1] + fallbackP2[1]) / 2
                ];
                fit = { p0: fallbackP0, p1: fallbackP1, p2: fallbackP2 };
            }

            const [p0World, p1World, p2World] = denormalizePoints([
                fit.p0,
                fit.p1,
                fit.p2
            ], fittedDomain);

            let controlPoints = [p0World, p1World, p2World];
            if (effectiveOptions.enforceC1 && prevControl) {
                controlPoints = enforceC1Continuity(prevControl.controlPoints, controlPoints);
            }

            const resampledSegmentPoints = denormalizePoints(segmentPoints, fittedDomain);
            const rms = computeSegmentRms(resampledSegmentPoints, controlPoints);
            accumulatedError += rms * resampledSegmentPoints.length;
            accumulatedSamples += resampledSegmentPoints.length;

            segments.push({
                type: "quadratic",
                controlPoints,
                rmsError: rms
            });
            prevControl = segments[segments.length - 1];

            if (segments.length === 1) {
                knotPoints.push(controlPoints[0].slice());
            }
            knotPoints.push(controlPoints[2].slice());

            if (!svgPath) {
                svgPath = `M ${controlPoints[0][0]} ${controlPoints[0][1]}`;
            }
            svgPath += ` Q ${controlPoints[1][0]} ${controlPoints[1][1]} ${controlPoints[2][0]} ${controlPoints[2][1]}`;
            latexEquations.push(`\\text{Segment ${seg + 1}: Quadratic Bézier RMS } ${rms.toFixed(4)}`);

            startIndex = endIndex;
            if (startIndex >= totalPoints - 1) {
                break;
            }
        }

        if (segments.length === 0) {
            return {
                success: false,
                type: QuadraticBezierChainApproximator.approximatorType,
                svgPath: "",
                latexEquations: [],
                segments: [],
                knots: [],
                domain: fittedDomain,
                diagnostics: {
                    reason: "No segments generated",
                    pointCount: totalPoints
                }
            };
        }

        const rmsGlobal = accumulatedSamples > 0 ? accumulatedError / accumulatedSamples : 0;
        const exportData = {
            type: QuadraticBezierChainApproximator.approximatorType,
            segments: segments.map(seg => ({
                type: seg.type,
                controlPoints: Array.isArray(seg.controlPoints)
                    ? seg.controlPoints.map(point => Array.isArray(point) ? point.slice() : point)
                    : [],
                rmsError: seg.rmsError
            })),
            knots: knotPoints.map(knot => Array.isArray(knot) ? knot.slice() : knot),
            svgPath,
            originalPoints: Array.isArray(preprocess.points) ? preprocess.points : null,
            domain: fittedDomain
        };

        return {
            success: true,
            type: QuadraticBezierChainApproximator.approximatorType,
            svgPath,
            latexEquations,
            segments,
            knots: knotPoints,
            domain: fittedDomain,
            exportData,
            diagnostics: {
                rmsError: rmsGlobal,
                segmentCount: segments.length,
                options: effectiveOptions
            }
        };
    }
}
