const STORAGE_KEY = 'grapen.curveApprox.settings.v1';

const PANEL_KEYS = ['showKnotsDefault', 'snap', 'errorThreshold', 'maxKnots', 'samplingRate'];
const CATEGORY_KEYS = [
    'linear',
    'piecewiseLinear',
    'quadraticBSpline',
    'singleQuadratic',
    'singleCircle',
    'quadraticChain',
    'selective'
];

const DEFAULT_MODEL = {
    panel: {
        showKnotsDefault: true,
        snap: false,
        errorThreshold: 30,
        maxKnots: 5,
        samplingRate: 1
    },
    linear: {
        linearityThreshold: 0.95,
        percentTolerance: 0.1,
        verticalSlopeThreshold: 10,
        horizontalSlopeThreshold: 0.1,
        quantizeControlAxis: false
    },
    piecewiseLinear: {
        linearityThreshold: 0.98,
        segmentLinearityThreshold: 0.95,
        percentTolerance: 0.1,
        verticalSlopeThreshold: 10,
        horizontalSlopeThreshold: 0.1,
        quantizeControlAxis: false
    },
    quadraticBSpline: {
        minKnots: 2,
        maxKnots: 10,
        minKnotDistance: 0.05
    },
    singleQuadratic: {
        quantization: 'auto',
        allowSelfIntersection: false,
        smoothWindow: 5,
        resampleCount: 96,
        pruneTolerance: 0,
        closed: false,
        extremaProminenceRatio: 0.04,
        extremaPersistence: 3,
        curvatureThreshold: 0.21,
        curvaturePersistence: 2,
        monotonicToleranceRatio: 0.05,
        errorToleranceRatio: 0.075,
        allowedExtrema: 2,
        allowedCurvatureFlips: 1,
        minStrokeLength: 0.5,
        minDiagonal: 0.25,
        closureRatio: 0.04
    },
    singleCircle: {
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
    },
    quadraticChain: {
        maxSegments: 8,
        enforceC1: true,
        smoothWindow: 5,
        resampleCount: 128,
        pruneTolerance: 0,
        closed: false
    },
    selective: {
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
    }
};

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function roundToStep(value, step) {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.round(value / step) * step;
}

function trackApplied(applied, key) {
    if (Array.isArray(applied) && !applied.includes(key)) {
        applied.push(key);
    }
}

function recordError(errors, key) {
    if (Array.isArray(errors) && !errors.includes(key)) {
        errors.push(key);
    }
}

function applyPanelOverrides(basePanel, overrides, errors, applied) {
    if (!isPlainObject(overrides)) return { ...basePanel };
    const panel = { ...basePanel };

    if (Object.prototype.hasOwnProperty.call(overrides, 'showKnotsDefault')) {
        panel.showKnotsDefault = !!overrides.showKnotsDefault;
        trackApplied(applied, 'panel:showKnotsDefault');
    }

    if (Object.prototype.hasOwnProperty.call(overrides, 'snap')) {
        panel.snap = !!overrides.snap;
        trackApplied(applied, 'panel:snap');
    }

    if (Object.prototype.hasOwnProperty.call(overrides, 'errorThreshold')) {
        const num = Number(overrides.errorThreshold);
        if (Number.isFinite(num)) {
            const clamped = clamp(num, 1, 30);
            const rounded = roundToStep(clamped, 0.1);
            panel.errorThreshold = Number(rounded.toFixed(1));
            trackApplied(applied, 'panel:errorThreshold');
        } else {
            recordError(errors, 'panel.errorThreshold');
        }
    }

    if (Object.prototype.hasOwnProperty.call(overrides, 'maxKnots')) {
        const num = Number(overrides.maxKnots);
        if (Number.isFinite(num)) {
            panel.maxKnots = Math.round(clamp(num, 2, 10));
            trackApplied(applied, 'panel:maxKnots');
        } else {
            recordError(errors, 'panel.maxKnots');
        }
    }

    if (Object.prototype.hasOwnProperty.call(overrides, 'samplingRate')) {
        const num = Number(overrides.samplingRate);
        if (Number.isFinite(num)) {
            panel.samplingRate = Math.round(clamp(num, 1, 10));
            trackApplied(applied, 'panel:samplingRate');
        } else {
            recordError(errors, 'panel.samplingRate');
        }
    }

    return panel;
}

function wrapPartial(partial) {
    if (!isPlainObject(partial)) return {};
    const normalized = {};

    if (isPlainObject(partial.panel)) {
        normalized.panel = partial.panel;
    }

    CATEGORY_KEYS.forEach((key) => {
        if (isPlainObject(partial[key])) {
            normalized[key] = partial[key];
        }
    });

    const panelOverrides = {};
    PANEL_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(partial, key)) {
            panelOverrides[key] = partial[key];
        }
    });

    if (Object.keys(panelOverrides).length) {
        normalized.panel = { ...(normalized.panel || {}), ...panelOverrides };
    }

    return normalized;
}

function normalizeModel(modelInput) {
    const base = createDefaultModel();
    if (!isPlainObject(modelInput)) {
        return base;
    }

    const wrapped = wrapPartial(modelInput);

    if (wrapped.panel) {
        base.panel = applyPanelOverrides(base.panel, wrapped.panel);
    }

    CATEGORY_KEYS.forEach((key) => {
        if (isPlainObject(wrapped[key])) {
            base[key] = { ...base[key], ...wrapped[key] };
        }
    });

    return base;
}

function createDefaultModel() {
    return deepClone(DEFAULT_MODEL);
}

function mergeModel(baseModelInput, partial, options = {}) {
    const baseModel = normalizeModel(baseModelInput);
    if (!isPlainObject(partial)) {
        return normalizeModel(baseModel);
    }

    const normalizedPartial = wrapPartial(partial);
    const applied = options.applied || null;
    const errors = options.errors || null;

    const next = normalizeModel(baseModel);

    if (normalizedPartial.panel) {
        next.panel = applyPanelOverrides(next.panel, normalizedPartial.panel, errors, applied);
    }

    CATEGORY_KEYS.forEach((key) => {
        if (isPlainObject(normalizedPartial[key])) {
            next[key] = { ...next[key], ...normalizedPartial[key] };
            trackApplied(applied, `category:${key}`);
        }
    });

    return normalizeModel(next);
}

function mergeModelWithValidation(baseModelInput, partial) {
    const errors = [];
    const applied = [];
    const model = mergeModel(baseModelInput, partial, { errors, applied });
    const resolved = resolveSettings(model);
    return { model, resolved, errors, applied };
}

function cloneModel(model) {
    return normalizeModel(model);
}

function resolveSettings(modelInput) {
    const normalized = normalizeModel(modelInput);
    const resolved = {
        panel: deepClone(normalized.panel),
        categories: {}
    };

    resolved.showKnotsDefault = normalized.panel.showKnotsDefault;
    resolved.snap = normalized.panel.snap;
    resolved.errorThreshold = normalized.panel.errorThreshold;
    resolved.maxKnots = normalized.panel.maxKnots;
    resolved.samplingRate = normalized.panel.samplingRate;

    CATEGORY_KEYS.forEach((key) => {
        const clone = deepClone(normalized[key]);
        resolved.categories[key] = clone;
        resolved[key] = clone;
    });

    return resolved;
}

function getStorage() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch (e) {
    }
    return null;
}

function loadSettingsFromStorage() {
    const storage = getStorage();
    const fallbackModel = createDefaultModel();

    if (!storage) {
        return { model: fallbackModel, resolved: resolveSettings(fallbackModel) };
    }

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return { model: fallbackModel, resolved: resolveSettings(fallbackModel) };
        }
        const parsed = JSON.parse(raw);
        const model = mergeModel(fallbackModel, parsed);
        return { model, resolved: resolveSettings(model) };
    } catch (error) {
        return { model: fallbackModel, resolved: resolveSettings(fallbackModel) };
    }
}

function saveSettingsToStorage(model) {
    const storage = getStorage();
    if (!storage) return false;
    try {
        const normalized = normalizeModel(model);
        storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return true;
    } catch (error) {
        return false;
    }
}

function clearStoredSettings() {
    const storage = getStorage();
    if (!storage) return false;
    try {
        storage.removeItem(STORAGE_KEY);
        return true;
    } catch (error) {
        return false;
    }
}

export {
    STORAGE_KEY,
    CATEGORY_KEYS,
    PANEL_KEYS,
    createDefaultModel,
    mergeModel,
    mergeModelWithValidation,
    resolveSettings,
    loadSettingsFromStorage,
    saveSettingsToStorage,
    clearStoredSettings,
    cloneModel
};
