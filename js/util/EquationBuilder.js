const DEFAULT_DECIMALS = 3;
const EPSILON = 1e-9;

function trimTrailingZeros(text) {
    if (!text.includes(".")) {
        return text === "-0" ? "0" : text;
    }
    let trimmed = text
        .replace(/(\.\d*?[1-9])0+$/, "$1")
        .replace(/\.0+$/, "");
    if (trimmed === "-0" || trimmed === "+0") {
        trimmed = "0";
    }
    return trimmed;
}

function formatFixed(value, decimals = DEFAULT_DECIMALS) {
    if (value == null) {
        return "";
    }
    if (!Number.isFinite(value)) {
        return String(value);
    }
    const rounded = Number(value);
    const text = rounded.toFixed(decimals);
    return trimTrailingZeros(text);
}

function formatSigned(value, decimals = DEFAULT_DECIMALS) {
    if (!Number.isFinite(value)) {
        return value >= 0 ? `+${value}` : String(value);
    }
    const magnitude = Math.abs(value);
    const text = formatFixed(magnitude, decimals);
    return value >= 0 ? `+${text}` : `-${text}`;
}

function stringifyBound(bound, decimals = DEFAULT_DECIMALS) {
    if (bound == null) {
        return undefined;
    }
    if (typeof bound === "string") {
        return bound;
    }
    return formatFixed(bound, decimals);
}

function createDomain(start, end, decimals = DEFAULT_DECIMALS) {
    const domain = {};
    const startText = stringifyBound(start, decimals);
    const endText = stringifyBound(end, decimals);
    if (startText !== undefined) {
        domain.start = startText;
    }
    if (endText !== undefined) {
        domain.end = endText;
    }
    return Object.keys(domain).length > 0 ? domain : undefined;
}

function formatPoint(point, decimals = DEFAULT_DECIMALS) {
    if (!Array.isArray(point) || point.length < 2) {
        return "(0, 0)";
    }
    return `(${formatFixed(point[0], decimals)}, ${formatFixed(point[1], decimals)})`;
}

function finalizeEquation({
    type,
    latex,
    formula,
    domain,
    domainAxis,
    params,
    meta,
    precision = DEFAULT_DECIMALS,
    parameterRange
}) {
    const equation = {
        type,
        formula: formula ?? latex ?? "",
        latex: latex ?? formula ?? "",
        params: params || {},
        precision
    };

    if (domain) {
        equation.domain = domain;
    }
    if (domainAxis) {
        equation.domainAxis = domainAxis;
    }
    if (parameterRange) {
        equation.parameterRange = parameterRange;
    }
    if (meta && Object.keys(meta).length > 0) {
        equation.meta = meta;
    }

    return equation;
}

function parseNumeric(value) {
    if (value == null) {
        return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const stripped = value
            .replace(/<[^>]*>/g, "")
            .replace(/[^0-9eE+\-\.]/g, "")
            .trim();
        if (stripped.length === 0) {
            return null;
        }
        const parsed = Number.parseFloat(stripped);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function parseDomainRange(domain) {
    if (!domain) {
        return undefined;
    }
    const startNum = parseNumeric(domain.start);
    const endNum = parseNumeric(domain.end);
    if (startNum == null && endNum == null) {
        return undefined;
    }
    return [startNum, endNum];
}

function shiftRange(range, delta) {
    if (!Array.isArray(range) || range.length === 0) {
        return undefined;
    }
    if (!Number.isFinite(delta) || Math.abs(delta) <= EPSILON) {
        return range.slice();
    }
    const shifted = range.map((value) => {
        return Number.isFinite(value) ? value + delta : value;
    });
    return shifted;
}

function translatePoint(point, dx, dy) {
    if (!Array.isArray(point) || point.length < 2) {
        return point;
    }
    const px = Number(point[0]);
    const py = Number(point[1]);
    return [
        Number.isFinite(px) ? px + dx : px,
        Number.isFinite(py) ? py + dy : py
    ];
}

function cloneParameterRange(range) {
    if (!range) {
        return undefined;
    }
    return {
        symbol: range.symbol,
        start: range.start,
        end: range.end
    };
}

function mergeEquation(original, updated) {
    if (!updated) {
        return null;
    }
    return {
        ...original,
        ...updated
    };
}

export const EquationBuilder = {
    linearThroughPoints(start, end, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        if (!Array.isArray(start) || !Array.isArray(end)) {
            return EquationBuilder.label({ text: "Invalid segment", type: "linear" }, options);
        }
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        if (Math.abs(dx) <= (options.verticalTolerance ?? EPSILON)) {
            return EquationBuilder.vertical({
                x: (start[0] + end[0]) / 2,
                yRange: [Math.min(start[1], end[1]), Math.max(start[1], end[1])],
                meta: options.meta
            }, { decimals });
        }
        if (Math.abs(dy) <= (options.horizontalTolerance ?? EPSILON)) {
            return EquationBuilder.horizontal({
                y: (start[1] + end[1]) / 2,
                xRange: [Math.min(start[0], end[0]), Math.max(start[0], end[0])],
                meta: options.meta
            }, { decimals });
        }
        const slope = dy / dx;
        return EquationBuilder.linear({
            slope,
            point: start,
            domain: [Math.min(start[0], end[0]), Math.max(start[0], end[0])],
            meta: options.meta
        }, { decimals });
    },

    linear({ slope, point, domain, meta, intercept }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const slopeValue = Number.isFinite(slope) ? slope : 0;

        const anchorCandidate = Array.isArray(point) && point.length >= 2
            ? [Number(point[0]), Number(point[1])]
            : null;

        let interceptValue = Number.isFinite(intercept) ? intercept : null;
        if (!Number.isFinite(interceptValue) && anchorCandidate) {
            const [px, py] = anchorCandidate;
            if (Number.isFinite(px) && Number.isFinite(py)) {
                interceptValue = py - slopeValue * px;
            }
        }
        if (!Number.isFinite(interceptValue)) {
            interceptValue = 0;
        }

        const anchor = anchorCandidate && Number.isFinite(anchorCandidate[0]) && Number.isFinite(anchorCandidate[1])
            ? anchorCandidate
            : [0, interceptValue];

        const slopeText = formatFixed(slopeValue, decimals);
        const interceptText = formatFixed(interceptValue, decimals);
        let latex;

        if (slopeText === "0") {
            latex = `y = ${interceptText}`;
        } else {
            let slopeTerm;
            if (slopeText === "1") {
                slopeTerm = "x";
            } else if (slopeText === "-1") {
                slopeTerm = "-x";
            } else {
                slopeTerm = `${slopeText}x`;
            }

            const interceptMagnitude = formatFixed(Math.abs(interceptValue), decimals);
            if (interceptMagnitude === "0") {
                latex = `y = ${slopeTerm}`;
            } else if (interceptValue >= 0) {
                latex = `y = ${slopeTerm} + ${interceptMagnitude}`;
            } else {
                latex = `y = ${slopeTerm} - ${interceptMagnitude}`;
            }
        }

        const domainObj = createDomain(domain?.[0], domain?.[1], decimals);
        return finalizeEquation({
            type: "linear",
            latex,
            formula: latex,
            domain: domainObj,
            domainAxis: "x",
            params: { slope: slopeValue, point: anchor, intercept: interceptValue },
            meta,
            precision: decimals
        });
    },

    horizontal({ y, xRange, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const valueText = formatFixed(y, decimals);
        const domainObj = createDomain(xRange?.[0], xRange?.[1], decimals);
        const latex = `y = ${valueText}`;
        return finalizeEquation({
            type: "constant",
            latex,
            formula: latex,
            domain: domainObj,
            domainAxis: "x",
            params: { y },
            meta,
            precision: decimals
        });
    },

    vertical({ x, yRange, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const valueText = formatFixed(x, decimals);
        const domainObj = createDomain(yRange?.[0], yRange?.[1], decimals);
        const latex = `x = ${valueText}`;
        return finalizeEquation({
            type: "vertical",
            latex,
            formula: latex,
            domain: domainObj,
            domainAxis: "y",
            params: { x },
            meta,
            precision: decimals
        });
    },

    quadraticVertex({ a, vertex, domain, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const [px, py] = Array.isArray(vertex) ? vertex : [0, 0];
        const aText = formatFixed(a, decimals);
        const xShift = formatSigned(-px, decimals);
        const yShift = formatSigned(py, decimals);
        const latex = `y = ${aText}(x ${xShift})^2 ${yShift}`;
        const domainObj = createDomain(domain?.[0], domain?.[1], decimals);
        return finalizeEquation({
            type: "quadratic",
            latex,
            formula: latex,
            domain: domainObj,
            domainAxis: "x",
            params: { a, vertex: [px, py] },
            meta,
            precision: decimals
        });
    },

    circle({ center, radius, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const [cx, cy] = Array.isArray(center) ? center : [0, 0];
        const xShift = formatSigned(-cx, decimals);
        const yShift = formatSigned(-cy, decimals);
        const radiusText = formatFixed(radius, decimals);
        const latex = `(x ${xShift})^2 + (y ${yShift})^2 = ${radiusText}^2`;
    const parameterRange = { symbol: "t", start: "0", end: "2\\pi" };
        return finalizeEquation({
            type: "circle",
            latex,
            formula: `(x ${xShift})^2 + (y ${yShift})^2 = ${radiusText}^2`,
            domain: createDomain(0, Math.PI * 2, decimals),
            domainAxis: parameterRange.symbol,
            params: { center: [cx, cy], radius },
            meta,
            precision: decimals,
            parameterRange
        });
    },

    ellipse({ center, radiusX, radiusY, rotation = 0, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const [cx, cy] = Array.isArray(center) ? center : [0, 0];
        const cosPhi = Math.cos(rotation);
        const sinPhi = Math.sin(rotation);

        const cxText = formatFixed(cx, decimals);
        const cyText = formatFixed(cy, decimals);
    const parameterRange = { symbol: "t", start: "0", end: "2\\pi" };

        const xTerms = [];
        const yTerms = [];

        const coeffXCos = radiusX * cosPhi;
        const coeffXSin = -radiusY * sinPhi;
        const coeffYCos = radiusX * sinPhi;
        const coeffYSin = radiusY * cosPhi;

        const appendLatexTerm = (terms, coeff, func) => {
            if (Math.abs(coeff) <= EPSILON) {
                return;
            }
            const sign = coeff >= 0 ? "+" : "-";
            const magnitude = formatFixed(Math.abs(coeff), decimals);
            if (magnitude === "0") {
                return;
            }
            terms.push(`${sign} ${magnitude}${func}`);
        };

        appendLatexTerm(xTerms, coeffXCos, "\\cos t");
        appendLatexTerm(xTerms, coeffXSin, "\\sin t");
        appendLatexTerm(yTerms, coeffYCos, "\\cos t");
        appendLatexTerm(yTerms, coeffYSin, "\\sin t");

        const latexX = `${cxText}${xTerms.map((term) => ` ${term}`).join("")}`;
        const latexY = `${cyText}${yTerms.map((term) => ` ${term}`).join("")}`;

        const latex = `\\left(${latexX}, ${latexY}\\right)`;

        const buildFormulaTerm = (coeff) => {
            const magnitude = Math.abs(coeff);
            const sign = coeff >= 0 ? " + " : " - ";
            const text = formatFixed(magnitude, decimals);
            if (text === "0") {
                return "";
            }
            return `${sign}${text}`;
        };

        let formulaX = `${cxText}`;
        const termXCos = buildFormulaTerm(coeffXCos);
        if (termXCos) {
            formulaX += `${termXCos} * cos(t)`;
        }
        const termXSin = buildFormulaTerm(coeffXSin);
        if (termXSin) {
            formulaX += `${termXSin} * sin(t)`;
        }

        let formulaY = `${cyText}`;
        const termYCos = buildFormulaTerm(coeffYCos);
        if (termYCos) {
            formulaY += `${termYCos} * cos(t)`;
        }
        const termYSin = buildFormulaTerm(coeffYSin);
        if (termYSin) {
            formulaY += `${termYSin} * sin(t)`;
        }

        const formula = `(${formulaX}, ${formulaY})`;

        return finalizeEquation({
            type: "ellipse",
            latex,
            formula,
            domain: createDomain(0, Math.PI * 2, decimals),
            domainAxis: parameterRange.symbol,
            params: {
                center: [cx, cy],
                radiusX,
                radiusY,
                rotation
            },
            meta,
            precision: decimals,
            parameterRange
        });
    },

    quadraticBezier({ p0, p1, p2, parameterRange, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const range = parameterRange || { symbol: "t", start: "0", end: "1" };
        const p0Text = formatPoint(p0, decimals);
        const p1Text = formatPoint(p1, decimals);
        const p2Text = formatPoint(p2, decimals);
        const latex = `${p0Text} (1 - t)^2 + 2 ${p1Text} (1 - t) t + ${p2Text} t^2`;
        const formula = `${p0Text} (1 - t)^2 + 2 ${p1Text} (1 - t) t + ${p2Text} t^2`;
        return finalizeEquation({
            type: "quadraticBezier",
            latex,
            formula,
            domain: createDomain(range.start, range.end, decimals),
            domainAxis: range.symbol,
            params: { controlPoints: [p0, p1, p2] },
            meta,
            precision: decimals,
            parameterRange: range
        });
    },

    cubicBezier({ p0, p1, p2, p3, parameterRange, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const range = parameterRange || { symbol: "t", start: "0", end: "1" };
        const p0Text = formatPoint(p0, decimals);
        const p1Text = formatPoint(p1, decimals);
        const p2Text = formatPoint(p2, decimals);
        const p3Text = formatPoint(p3, decimals);
        const latex = `${p0Text} (1 - t)^3 + 3 ${p1Text} (1 - t)^2 t + 3 ${p2Text} (1 - t) t^2 + ${p3Text} t^3`;
        const formula = `${p0Text} (1 - t)^3 + 3 ${p1Text} (1 - t)^2 t + 3 ${p2Text} (1 - t) t^2 + ${p3Text} t^3`;
        return finalizeEquation({
            type: "cubicBezier",
            latex,
            formula,
            domain: createDomain(range.start, range.end, decimals),
            domainAxis: range.symbol,
            params: { controlPoints: [p0, p1, p2, p3] },
            meta,
            precision: decimals,
            parameterRange: range
        });
    },

    arc({ center, radius, startAngle, endAngle, direction = 1, meta }, options = {}) {
        const decimals = options.decimals ?? DEFAULT_DECIMALS;
        const [cx, cy] = Array.isArray(center) ? center : [0, 0];
        const cxText = formatFixed(cx, decimals);
        const cyText = formatFixed(cy, decimals);
        const radiusText = formatFixed(radius, decimals);
        const parameterRange = {
            symbol: "t",
            start: stringifyBound(startAngle, decimals) ?? "0",
            end: stringifyBound(endAngle, decimals) ?? "2\\pi"
        };
        const domain = createDomain(
            Number.isFinite(startAngle) ? startAngle : 0,
            Number.isFinite(endAngle) ? endAngle : Math.PI * 2,
            decimals
        );
    const asciiParameter = parameterRange.symbol.replace(/\\/g, "") || "t";
    const latex = `\\left(${radiusText}\\cos ${parameterRange.symbol} + ${cxText}, ${radiusText}\\sin ${parameterRange.symbol} + ${cyText}\\right)`;
    const formula = `(${radiusText} * cos(${asciiParameter}) + ${cxText}, ${radiusText} * sin(${asciiParameter}) + ${cyText})`;
        return finalizeEquation({
            type: "arc",
            latex,
            formula,
            domain,
            domainAxis: parameterRange.symbol,
            params: {
                center: [cx, cy],
                radius,
                startAngle,
                endAngle,
                direction
            },
            meta,
            precision: decimals,
            parameterRange
        });
    },

    label({ text, type = "unknown", meta }, options = {}) {
        const sanitized = typeof text === "string" ? text : String(text ?? "");
        return finalizeEquation({
            type,
            latex: `\\text{${sanitized}}`,
            formula: sanitized,
            params: {},
            meta,
            precision: options.decimals ?? DEFAULT_DECIMALS
        });
    },

    translateEquation(equation, deltaX = 0, deltaY = 0, options = {}) {
        if (!equation || typeof equation !== "object") {
            return null;
        }

        const type = equation.type;
        if (!type) {
            return null;
        }

        const decimals = options.decimals ?? equation.precision ?? DEFAULT_DECIMALS;
        const meta = equation.meta;

        const wrap = (rebuilt) => mergeEquation(equation, rebuilt);

        switch (type) {
            case "constant": {
                const baseY = parseNumeric(equation.params && equation.params.y);
                if (!Number.isFinite(baseY)) {
                    return null;
                }
                const range = parseDomainRange(equation.domain);
                const shiftedRange = shiftRange(range, deltaX);
                const rebuilt = EquationBuilder.horizontal({
                    y: baseY + deltaY,
                    xRange: shiftedRange,
                    meta
                }, { decimals });
                return wrap(rebuilt);
            }
            case "vertical": {
                const baseX = parseNumeric(equation.params && equation.params.x);
                if (!Number.isFinite(baseX)) {
                    return null;
                }
                const range = parseDomainRange(equation.domain);
                const shiftedRange = shiftRange(range, deltaY);
                const rebuilt = EquationBuilder.vertical({
                    x: baseX + deltaX,
                    yRange: shiftedRange,
                    meta
                }, { decimals });
                return wrap(rebuilt);
            }
            case "linear": {
                const slope = equation.params && Number.isFinite(equation.params.slope)
                    ? equation.params.slope
                    : null;
                const anchor = equation.params && Array.isArray(equation.params.point)
                    ? equation.params.point
                    : null;
                if (!Number.isFinite(slope) || !anchor) {
                    return null;
                }
                const newPoint = translatePoint(anchor, deltaX, deltaY);
                const range = parseDomainRange(equation.domain);
                const shiftedRange = shiftRange(range, deltaX);
                const rebuilt = EquationBuilder.linear({
                    slope,
                    point: newPoint,
                    domain: shiftedRange,
                    meta
                }, { decimals });
                return wrap(rebuilt);
            }
            case "quadratic": {
                const a = equation.params && Number.isFinite(equation.params.a)
                    ? equation.params.a
                    : null;
                const vertex = equation.params && Array.isArray(equation.params.vertex)
                    ? equation.params.vertex
                    : null;
                if (!Number.isFinite(a) || !vertex) {
                    return null;
                }
                const newVertex = translatePoint(vertex, deltaX, deltaY);
                const range = parseDomainRange(equation.domain);
                const shiftedRange = shiftRange(range, deltaX);
                const rebuilt = EquationBuilder.quadraticVertex({
                    a,
                    vertex: newVertex,
                    domain: shiftedRange,
                    meta
                }, { decimals });
                return wrap(rebuilt);
            }
            case "circle": {
                const center = equation.params && Array.isArray(equation.params.center)
                    ? equation.params.center
                    : null;
                const radius = equation.params && Number.isFinite(equation.params.radius)
                    ? equation.params.radius
                    : null;
                if (!center || !Number.isFinite(radius)) {
                    return null;
                }
                const rebuilt = EquationBuilder.circle({
                    center: translatePoint(center, deltaX, deltaY),
                    radius,
                    meta
                }, { decimals });
                // Preserve explicit parameter range if provided
                if (equation.parameterRange) {
                    rebuilt.parameterRange = cloneParameterRange(equation.parameterRange);
                }
                return wrap(rebuilt);
            }
            case "ellipse": {
                const center = equation.params && Array.isArray(equation.params.center)
                    ? equation.params.center
                    : null;
                const radiusX = equation.params && Number.isFinite(equation.params.radiusX)
                    ? equation.params.radiusX
                    : null;
                const radiusY = equation.params && Number.isFinite(equation.params.radiusY)
                    ? equation.params.radiusY
                    : null;
                const rotation = equation.params && Number.isFinite(equation.params.rotation)
                    ? equation.params.rotation
                    : 0;
                if (!center || !Number.isFinite(radiusX) || !Number.isFinite(radiusY)) {
                    return null;
                }
                const rebuilt = EquationBuilder.ellipse({
                    center: translatePoint(center, deltaX, deltaY),
                    radiusX,
                    radiusY,
                    rotation,
                    meta
                }, { decimals });
                if (equation.parameterRange) {
                    rebuilt.parameterRange = cloneParameterRange(equation.parameterRange);
                }
                return wrap(rebuilt);
            }
            case "quadraticBezier": {
                const cps = equation.params && Array.isArray(equation.params.controlPoints)
                    ? equation.params.controlPoints
                    : null;
                if (!cps || cps.length < 3) {
                    return null;
                }
                const translated = cps.map((pt) => translatePoint(pt, deltaX, deltaY));
                const rebuilt = EquationBuilder.quadraticBezier({
                    p0: translated[0],
                    p1: translated[1],
                    p2: translated[2],
                    parameterRange: cloneParameterRange(equation.parameterRange),
                    meta
                }, { decimals });
                return wrap(rebuilt);
            }
            case "cubicBezier": {
                const cps = equation.params && Array.isArray(equation.params.controlPoints)
                    ? equation.params.controlPoints
                    : null;
                if (!cps || cps.length < 4) {
                    return null;
                }
                const translated = cps.map((pt) => translatePoint(pt, deltaX, deltaY));
                const rebuilt = EquationBuilder.cubicBezier({
                    p0: translated[0],
                    p1: translated[1],
                    p2: translated[2],
                    p3: translated[3],
                    parameterRange: cloneParameterRange(equation.parameterRange),
                    meta
                }, { decimals });
                return wrap(rebuilt);
            }
            case "arc": {
                const center = equation.params && Array.isArray(equation.params.center)
                    ? equation.params.center
                    : null;
                const radius = equation.params && Number.isFinite(equation.params.radius)
                    ? equation.params.radius
                    : null;
                if (!center || !Number.isFinite(radius)) {
                    return null;
                }
                const rebuilt = EquationBuilder.arc({
                    center: translatePoint(center, deltaX, deltaY),
                    radius,
                    startAngle: equation.params.startAngle,
                    endAngle: equation.params.endAngle,
                    direction: equation.params.direction,
                    meta
                }, { decimals });
                if (equation.parameterRange) {
                    rebuilt.parameterRange = cloneParameterRange(equation.parameterRange);
                }
                return wrap(rebuilt);
            }
            default:
                return null;
        }
    },

    translateEquations(equations, deltaX = 0, deltaY = 0, options = {}) {
        if (!Array.isArray(equations)) {
            return null;
        }
        return equations.map((eq) => {
            const translated = EquationBuilder.translateEquation(eq, deltaX, deltaY, options);
            return translated || eq;
        });
    }
};
