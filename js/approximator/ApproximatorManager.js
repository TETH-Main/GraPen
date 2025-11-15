import {
    createDefaultModel,
    mergeModel,
    mergeModelWithValidation,
    resolveSettings,
    loadSettingsFromStorage,
    saveSettingsToStorage,
    cloneModel
} from '../util/ApproximatorSettings.js';

export class ApproximatorManager {
    constructor(curveManager = null, languageManager = null) {
        this.curveManager = curveManager;
        this.languageManager = languageManager || curveManager?.languageManager || null;

        this.root = document.getElementById('curve-approx-root') || this.createRoot();
        this.toggleButton = null;
        this.panel = null;
        this.tabsContainer = null;
        this.contentContainer = null;
        this.resetButton = null;

        this.controlElements = new Map();
        this.isOpen = false;
        this.initialized = false;
        this.activeTab = 'display';

        const storedSettings = loadSettingsFromStorage();
        this.defaultModel = createDefaultModel();
        this.defaultSettings = resolveSettings(this.defaultModel);
        this.settingsModel = storedSettings.model ? cloneModel(storedSettings.model) : cloneModel(this.defaultModel);
        this.settings = storedSettings.resolved ? storedSettings.resolved : resolveSettings(this.settingsModel);
        this._saveDelayMs = 250;
        this._saveTimer = null;
        this._ignoreNextEventSource = null;

        this.tabConfig = [
            { id: 'display', labelKey: 'approximator.tab.display', fallback: '表示' },
            { id: 'linear-single', labelKey: 'approximator.tab.linear_single', fallback: '一次直線近似' },
            { id: 'linear-piecewise', labelKey: 'approximator.tab.linear_piecewise', fallback: '折れ線近似' },
            { id: 'quadratic-bspline', labelKey: 'approximator.tab.quadratic_bspline', fallback: '二次Bスプライン' },
            { id: 'quadratic-single', labelKey: 'approximator.tab.quadratic_single', fallback: '単一二次ベジェ' },
            { id: 'quadratic-chain', labelKey: 'approximator.tab.quadratic_chain', fallback: '二次ベジェチェーン' },
            { id: 'circle-single', labelKey: 'approximator.tab.circle_single', fallback: '円・楕円近似' },
            { id: 'selection-hybrid', labelKey: 'approximator.tab.selection_hybrid', fallback: '選択曲線近似' }
        ];

        this.settingConfig = {
            showKnotsDefault: {
                type: 'toggle',
                tab: 'display',
                icon: 'commit',
                labelKey: 'approximator.settings.show_knots',
                fallback: '節点表示'
            },
            snap: {
                type: 'toggle',
                tab: 'display',
                icon: 'straighten',
                labelKey: 'approximator.settings.snap',
                fallback: 'スナップ'
            },
            linearQuantizeControlAxis: {
                type: 'toggle',
                tab: 'linear-single',
                icon: 'straighten',
                labelKey: 'approximator.settings.linear_quantize_axis',
                fallback: '直線制御点を量子化',
                path: ['linear', 'quantizeControlAxis'],
                dependsOn: ['snap']
            },
            linearLinearityThreshold: {
                type: 'range',
                tab: 'linear-single',
                labelKey: 'approximator.settings.linear.linearity_threshold',
                fallback: '線形性閾値',
                min: 0.5,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['linear', 'linearityThreshold']
            },
            linearPercentTolerance: {
                type: 'range',
                tab: 'linear-single',
                labelKey: 'approximator.settings.linear.percent_tolerance',
                fallback: '許容比率',
                min: 0,
                max: 0.5,
                step: 0.01,
                decimals: 2,
                path: ['linear', 'percentTolerance']
            },
            linearVerticalSlopeThreshold: {
                type: 'range',
                tab: 'linear-single',
                labelKey: 'approximator.settings.linear.vertical_slope_threshold',
                fallback: '垂直判定傾き',
                min: 1,
                max: 50,
                step: 0.5,
                decimals: 2,
                path: ['linear', 'verticalSlopeThreshold']
            },
            linearHorizontalSlopeThreshold: {
                type: 'range',
                tab: 'linear-single',
                labelKey: 'approximator.settings.linear.horizontal_slope_threshold',
                fallback: '水平判定傾き',
                min: 0.01,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['linear', 'horizontalSlopeThreshold']
            },
            errorThreshold: {
                type: 'range',
                tab: 'linear-single',
                labelKey: 'approximator.settings.error_threshold',
                fallback: '許容誤差 (DP)',
                min: 1,
                max: 30,
                step: 0.1,
                decimals: 1
            },
            piecewiseQuantizeControlAxis: {
                type: 'toggle',
                tab: 'linear-piecewise',
                icon: 'straighten',
                labelKey: 'approximator.settings.piecewise_quantize_axis',
                fallback: '折れ線制御点を量子化',
                path: ['piecewiseLinear', 'quantizeControlAxis'],
                dependsOn: ['snap']
            },
            piecewiseLinearityThreshold: {
                type: 'range',
                tab: 'linear-piecewise',
                labelKey: 'approximator.settings.piecewise.linearity_threshold',
                fallback: '全体線形性閾値',
                min: 0.5,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['piecewiseLinear', 'linearityThreshold']
            },
            piecewiseSegmentLinearityThreshold: {
                type: 'range',
                tab: 'linear-piecewise',
                labelKey: 'approximator.settings.piecewise.segment_linearity_threshold',
                fallback: 'セグメント線形性閾値',
                min: 0.5,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['piecewiseLinear', 'segmentLinearityThreshold']
            },
            piecewisePercentTolerance: {
                type: 'range',
                tab: 'linear-piecewise',
                labelKey: 'approximator.settings.piecewise.percent_tolerance',
                fallback: '許容比率',
                min: 0,
                max: 0.5,
                step: 0.01,
                decimals: 2,
                path: ['piecewiseLinear', 'percentTolerance']
            },
            piecewiseVerticalSlopeThreshold: {
                type: 'range',
                tab: 'linear-piecewise',
                labelKey: 'approximator.settings.piecewise.vertical_slope_threshold',
                fallback: '垂直判定傾き',
                min: 1,
                max: 50,
                step: 0.5,
                decimals: 2,
                path: ['piecewiseLinear', 'verticalSlopeThreshold']
            },
            piecewiseHorizontalSlopeThreshold: {
                type: 'range',
                tab: 'linear-piecewise',
                labelKey: 'approximator.settings.piecewise.horizontal_slope_threshold',
                fallback: '水平判定傾き',
                min: 0.01,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['piecewiseLinear', 'horizontalSlopeThreshold']
            },
            maxKnots: {
                type: 'range',
                tab: 'quadratic-bspline',
                labelKey: 'approximator.settings.max_knots',
                fallback: '最大節点数 (パネル)',
                min: 2,
                max: 10,
                step: 1
            },
            bsplineMinKnots: {
                type: 'range',
                tab: 'quadratic-bspline',
                labelKey: 'approximator.settings.bspline.min_knots',
                fallback: '最小節点数',
                min: 2,
                max: 10,
                step: 1,
                path: ['quadraticBSpline', 'minKnots']
            },
            bsplineMaxKnots: {
                type: 'range',
                tab: 'quadratic-bspline',
                labelKey: 'approximator.settings.bspline.max_knots',
                fallback: '最大節点数',
                min: 2,
                max: 16,
                step: 1,
                path: ['quadraticBSpline', 'maxKnots']
            },
            bsplineMinKnotDistance: {
                type: 'range',
                tab: 'quadratic-bspline',
                labelKey: 'approximator.settings.bspline.min_knot_distance',
                fallback: '節点最小間隔',
                min: 0.01,
                max: 0.5,
                step: 0.01,
                decimals: 2,
                path: ['quadraticBSpline', 'minKnotDistance']
            },
            singleQuadAllowSelfIntersection: {
                type: 'toggle',
                tab: 'quadratic-single',
                icon: 'point_scan',
                labelKey: 'approximator.settings.single_quad.allow_self_intersection',
                fallback: '自己交差を許可',
                path: ['singleQuadratic', 'allowSelfIntersection']
            },
            singleQuadClosed: {
                type: 'toggle',
                tab: 'quadratic-single',
                icon: '360',
                labelKey: 'approximator.settings.single_quad.closed',
                fallback: '閉曲線として処理',
                path: ['singleQuadratic', 'closed']
            },
            singleQuadSmoothWindow: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.smooth_window',
                fallback: 'スムージング窓',
                min: 1,
                max: 25,
                step: 1,
                path: ['singleQuadratic', 'smoothWindow']
            },
            singleQuadResampleCount: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.resample_count',
                fallback: 'リサンプル数',
                min: 32,
                max: 256,
                step: 1,
                path: ['singleQuadratic', 'resampleCount']
            },
            singleQuadPruneTolerance: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.prune_tolerance',
                fallback: '枝刈り許容',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['singleQuadratic', 'pruneTolerance']
            },
            singleQuadExtremaProminence: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.extrema_prominence',
                fallback: '極値顕著度',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['singleQuadratic', 'extremaProminenceRatio']
            },
            singleQuadExtremaPersistence: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.extrema_persistence',
                fallback: '極値距離',
                min: 1,
                max: 10,
                step: 1,
                path: ['singleQuadratic', 'extremaPersistence']
            },
            singleQuadCurvatureThreshold: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.curvature_threshold',
                fallback: '曲率閾値',
                min: 0,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['singleQuadratic', 'curvatureThreshold']
            },
            singleQuadCurvaturePersistence: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.curvature_persistence',
                fallback: '曲率維持距離',
                min: 1,
                max: 10,
                step: 1,
                path: ['singleQuadratic', 'curvaturePersistence']
            },
            singleQuadMonotonicTolerance: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.monotonic_tolerance',
                fallback: '単調許容比',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['singleQuadratic', 'monotonicToleranceRatio']
            },
            singleQuadErrorTolerance: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.error_tolerance',
                fallback: '誤差許容比',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['singleQuadratic', 'errorToleranceRatio']
            },
            singleQuadAllowedExtrema: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.allowed_extrema',
                fallback: '極値数上限',
                min: 0,
                max: 6,
                step: 1,
                path: ['singleQuadratic', 'allowedExtrema']
            },
            singleQuadAllowedCurvatureFlips: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.allowed_curvature_flips',
                fallback: '曲率反転上限',
                min: 0,
                max: 6,
                step: 1,
                path: ['singleQuadratic', 'allowedCurvatureFlips']
            },
            singleQuadMinStrokeLength: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.min_stroke_length',
                fallback: '最小ストローク長',
                min: 0,
                max: 10,
                step: 0.05,
                decimals: 2,
                path: ['singleQuadratic', 'minStrokeLength']
            },
            singleQuadMinDiagonal: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.min_diagonal',
                fallback: '最小対角長',
                min: 0,
                max: 10,
                step: 0.05,
                decimals: 2,
                path: ['singleQuadratic', 'minDiagonal']
            },
            singleQuadClosureRatio: {
                type: 'range',
                tab: 'quadratic-single',
                labelKey: 'approximator.settings.single_quad.closure_ratio',
                fallback: '閉じ比率閾値',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['singleQuadratic', 'closureRatio']
            },
            chainEnforceC1: {
                type: 'toggle',
                tab: 'quadratic-chain',
                icon: 'gesture',
                labelKey: 'approximator.settings.chain.enforce_c1',
                fallback: 'C¹連続を強制',
                path: ['quadraticChain', 'enforceC1']
            },
            chainClosed: {
                type: 'toggle',
                tab: 'quadratic-chain',
                icon: '360',
                labelKey: 'approximator.settings.chain.closed',
                fallback: '閉曲線として処理',
                path: ['quadraticChain', 'closed']
            },
            chainMaxSegments: {
                type: 'range',
                tab: 'quadratic-chain',
                labelKey: 'approximator.settings.chain.max_segments',
                fallback: '最大セグメント数',
                min: 1,
                max: 12,
                step: 1,
                path: ['quadraticChain', 'maxSegments']
            },
            chainSmoothWindow: {
                type: 'range',
                tab: 'quadratic-chain',
                labelKey: 'approximator.settings.chain.smooth_window',
                fallback: 'スムージング窓',
                min: 1,
                max: 25,
                step: 1,
                path: ['quadraticChain', 'smoothWindow']
            },
            chainResampleCount: {
                type: 'range',
                tab: 'quadratic-chain',
                labelKey: 'approximator.settings.chain.resample_count',
                fallback: 'リサンプル数',
                min: 32,
                max: 256,
                step: 1,
                path: ['quadraticChain', 'resampleCount']
            },
            chainPruneTolerance: {
                type: 'range',
                tab: 'quadratic-chain',
                labelKey: 'approximator.settings.chain.prune_tolerance',
                fallback: '枝刈り許容',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['quadraticChain', 'pruneTolerance']
            },
            circleEnableEllipse: {
                type: 'toggle',
                tab: 'circle-single',
                icon: 'vignette',
                labelKey: 'approximator.settings.circle.enable_ellipse',
                fallback: '楕円を許可',
                path: ['singleCircle', 'enableEllipse']
            },
            circlePreferEllipse: {
                type: 'toggle',
                tab: 'circle-single',
                icon: 'business_chip',
                labelKey: 'approximator.settings.circle.prefer_ellipse',
                fallback: '楕円を優先',
                path: ['singleCircle', 'preferEllipse']
            },
            circleClosed: {
                type: 'toggle',
                tab: 'circle-single',
                icon: '360',
                labelKey: 'approximator.settings.circle.closed',
                fallback: '閉曲線として処理',
                path: ['singleCircle', 'closed']
            },
            circleMaxEccentricity: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.max_eccentricity',
                fallback: '最大離心率',
                min: 0,
                max: 0.99,
                step: 0.01,
                decimals: 2,
                path: ['singleCircle', 'maxEccentricity']
            },
            circleSnapRatio: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.snap_ratio',
                fallback: '円スナップ比',
                min: 0,
                max: 0.5,
                step: 0.01,
                decimals: 2,
                path: ['singleCircle', 'circleSnapRatio']
            },
            circleSmoothWindow: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.smooth_window',
                fallback: 'スムージング窓',
                min: 1,
                max: 25,
                step: 1,
                path: ['singleCircle', 'smoothWindow']
            },
            circleResampleCount: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.resample_count',
                fallback: 'リサンプル数',
                min: 32,
                max: 256,
                step: 1,
                path: ['singleCircle', 'resampleCount']
            },
            circlePruneTolerance: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.prune_tolerance',
                fallback: '枝刈り許容',
                min: 0,
                max: 0.2,
                step: 0.005,
                decimals: 3,
                path: ['singleCircle', 'pruneTolerance']
            },
            circleCircleRmsTolerance: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.circle_rms_tolerance',
                fallback: '円 RMS 許容',
                min: 0,
                max: 0.1,
                step: 0.001,
                decimals: 3,
                path: ['singleCircle', 'circleRmsTolerance']
            },
            circleEllipseRmsTolerance: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.ellipse_rms_tolerance',
                fallback: '楕円 RMS 許容',
                min: 0,
                max: 0.2,
                step: 0.001,
                decimals: 3,
                path: ['singleCircle', 'ellipseRmsTolerance']
            },
            circleMaxEndpointGapRatio: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.max_endpoint_gap_ratio',
                fallback: '始終点ギャップ比',
                min: 0,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['singleCircle', 'maxEndpointGapRatio']
            },
            circleMinCoverageRatio: {
                type: 'range',
                tab: 'circle-single',
                labelKey: 'approximator.settings.circle.min_coverage_ratio',
                fallback: '最小カバー率',
                min: 0,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['singleCircle', 'minCoverageRatio']
            },
            circleQuantizationEnabled: {
                type: 'toggle',
                tab: 'circle-single',
                icon: 'straighten',
                labelKey: 'approximator.settings.circle.quantization_enabled',
                fallback: '量子化を有効化',
                path: ['singleCircle', 'quantizationEnabled']
            },
            circleQuantizeCenter: {
                type: 'toggle',
                tab: 'circle-single',
                icon: 'my_location',
                labelKey: 'approximator.settings.circle.quantize_center',
                fallback: '中心を量子化',
                path: ['singleCircle', 'quantizeCenter'],
                dependsOn: ['singleCircle.quantizationEnabled']
            },
            circleQuantizeAxes: {
                type: 'toggle',
                tab: 'circle-single',
                icon: 'adjust',
                labelKey: 'approximator.settings.circle.quantize_axes',
                fallback: '半径/軸を量子化',
                path: ['singleCircle', 'quantizeAxes'],
                dependsOn: ['singleCircle.quantizationEnabled']
            },
            samplingRate: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.sampling_rate',
                fallback: 'サンプリングレート (パネル)',
                min: 1,
                max: 10,
                step: 1
            },
            selectionSmoothingWindow: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.smoothing_window',
                fallback: 'スムージング窓',
                min: 0,
                max: 25,
                step: 1,
                path: ['selective', 'smoothingWindow']
            },
            selectionResampleCount: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.resample_count',
                fallback: 'リサンプル数',
                min: 32,
                max: 256,
                step: 1,
                path: ['selective', 'resampleCount']
            },
            selectionTolerance: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.tolerance',
                fallback: '許容誤差',
                min: 0,
                max: 0.5,
                step: 0.01,
                decimals: 2,
                path: ['selective', 'tolerance']
            },
            selectionMaxSpan: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.max_span',
                fallback: '最大スパン',
                min: 8,
                max: 128,
                step: 1,
                path: ['selective', 'maxSpan']
            },
            selectionAutoSegments: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'motion_photos_auto',
                labelKey: 'approximator.settings.selection.auto_segments',
                fallback: '自動セグメント',
                path: ['selective', 'autoSegments']
            },
            selectionSegmentCount: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.segment_count',
                fallback: 'セグメント数',
                min: 1,
                max: 16,
                step: 1,
                path: ['selective', 'segmentCount']
            },
            selectionSimplicityGain: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.simplicity_gain',
                fallback: '単純化バイアス',
                min: 0,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['selective', 'simplicityGain']
            },
            selectionSmoothBias: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.smooth_bias',
                fallback: 'スムース重み',
                min: 0,
                max: 1,
                step: 0.01,
                decimals: 2,
                path: ['selective', 'smoothBias']
            },
            selectionEnableLinear: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'timer_1',
                labelKey: 'approximator.settings.selection.enable_linear',
                fallback: '直線を許可',
                path: ['selective', 'enableLinear']
            },
            selectionEnableQuadratic: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'timer_2',
                labelKey: 'approximator.settings.selection.enable_quadratic',
                fallback: '二次曲線を許可',
                path: ['selective', 'enableQuadratic']
            },
            selectionEnableCubic: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'timer_3',
                labelKey: 'approximator.settings.selection.enable_cubic',
                fallback: '三次曲線を許可',
                path: ['selective', 'enableCubic']
            },
            selectionEnableArc: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'line_curve',
                labelKey: 'approximator.settings.selection.enable_arc',
                fallback: '円弧を許可',
                path: ['selective', 'enableArc']
            },
            selectionQuantizationEnabled: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'straighten',
                labelKey: 'approximator.settings.selection.quantization_enabled',
                fallback: '量子化を有効化',
                path: ['selective', 'quantizationEnabled']
            },
            selectionQuantLevelOffset: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.quant_level_offset',
                fallback: '量子化レベルオフセット',
                min: -5,
                max: 5,
                step: 1,
                path: ['selective', 'quantLevelOffset'],
                dependsOn: ['selective.quantizationEnabled']
            },
            selectionAngleThreshold: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.angle_threshold',
                fallback: '角度閾値 (度)',
                min: 0,
                max: 90,
                step: 1,
                path: ['selective', 'angleThresholdDegrees']
            },
            selectionDedupeTolerance: {
                type: 'range',
                tab: 'selection-hybrid',
                labelKey: 'approximator.settings.selection.dedupe_tolerance',
                fallback: '重複許容',
                min: 0,
                max: 0.01,
                step: 0.0001,
                decimals: 4,
                path: ['selective', 'dedupeTolerance']
            },
            selectionClosed: {
                type: 'toggle',
                tab: 'selection-hybrid',
                icon: 'all_inclusive',
                labelKey: 'approximator.settings.selection.closed',
                fallback: '閉曲線として処理',
                path: ['selective', 'closed']
            }
        };

        this.handleAdvancedModeChange = this.handleAdvancedModeChange.bind(this);
        this.handleLanguageStateChange = this.refreshLocalizedLabels.bind(this);
        this.handleExternalSettingsChange = this.handleExternalSettingsChange.bind(this);
        this._handleBeforeUnload = this.flushPendingSave.bind(this);
        this.initialize();
    }

    initialize() {
        if (this.initialized) return;
        if (!this.root) return;

        this.buildUI();
        this.bindGlobalEvents();
        this.syncUIFromSettings();
        this.applySettings({ source: 'initial-load', queueSave: false });
        this.handleAdvancedModeChange({ detail: { enabled: document.body.classList.contains('grapen-advanced-mode') } });

        this.initialized = true;
    }

    createRoot() {
        const canvas = document.getElementById('canvas-container');
        if (!canvas) return null;
        const root = document.createElement('div');
        root.id = 'curve-approx-root';
        root.className = 'curve-approx-root';
        root.setAttribute('aria-hidden', 'true');
        canvas.appendChild(root);
        return root;
    }

    buildUI() {
        this.root.innerHTML = '';

        this.panel = document.createElement('div');
        this.panel.id = 'curve-approx-panel';
        this.panel.className = 'curve-approx-panel';
        this.panel.setAttribute('aria-hidden', 'true');
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-label', this._t('approximator.title', '曲線近似設定'));
        this.root.appendChild(this.panel);

        this.toggleButton = document.createElement('button');
        this.toggleButton.id = 'curve-approx-toggle';
        this.toggleButton.className = 'curve-approx-toggle';
        this.toggleButton.type = 'button';
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.toggleButton.setAttribute('aria-controls', 'curve-approx-panel');

        const toggleIcon = document.createElement('i');
        toggleIcon.className = 'material-symbols-rounded';
        toggleIcon.textContent = 'chevron_right';
        this.toggleButton.appendChild(toggleIcon);

        const toggleLabel = document.createElement('span');
        toggleLabel.className = 'visually-hidden';
        toggleLabel.dataset.i18n = 'approximator.toggle';
        toggleLabel.textContent = '近似設定';
        this.toggleButton.appendChild(toggleLabel);
        this.root.appendChild(this.toggleButton);

        if (typeof MutationObserver !== 'undefined') {
            this._toggleLabelObserver = new MutationObserver(() => this._updateLanguage(this.toggleButton));
            this._toggleLabelObserver.observe(toggleLabel, { characterData: true, childList: true });
        }

        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'curve-approx-tabs';
        this.tabsContainer.setAttribute('role', 'tablist');
        this.panel.appendChild(this.tabsContainer);

        this.contentContainer = document.createElement('div');
        this.contentContainer.className = 'curve-approx-panels';
        this.panel.appendChild(this.contentContainer);

        this.renderTabsAndPanels();

        const footer = document.createElement('div');
        footer.className = 'curve-approx-footer';
        this.panel.appendChild(footer);

        this.resetButton = document.createElement('button');
        this.resetButton.type = 'button';
        this.resetButton.id = 'curve-approx-reset';
        this.resetButton.className = 'curve-approx-reset';
        this.resetButton.dataset.i18n = 'approximator.settings.reset';
        this.resetButton.textContent = this._t('approximator.settings.reset', '初期に戻す');
        footer.appendChild(this.resetButton);

        this._updateLanguage(this.toggleButton);
        this._updateLanguage(this.panel);
        this._updateLanguage(this.resetButton);
    }

    renderTabsAndPanels() {
        this.tabButtons = [];
        this.tabPanels = new Map();

    this.tabsInner = document.createElement('div');
    this.tabsInner.className = 'curve-approx-tabs-inner';
    this.tabsContainer.appendChild(this.tabsInner);

    this.tabConfig.forEach((tab, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'curve-approx-tab';
            button.dataset.tab = tab.id;
            button.dataset.i18n = tab.labelKey;
            button.textContent = this._t(tab.labelKey, tab.fallback);
            button.id = `curve-approx-tab-${tab.id}`;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
            button.setAttribute('tabindex', index === 0 ? '0' : '-1');
            this.tabsInner.appendChild(button);
            this._updateLanguage(button);

            const section = document.createElement('section');
            section.className = 'curve-approx-content';
            section.dataset.tab = tab.id;
            section.id = `curve-approx-panel-${tab.id}`;
            section.setAttribute('role', 'tabpanel');
            section.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
            section.setAttribute('aria-labelledby', button.id);
            this.contentContainer.appendChild(section);

            this.tabButtons.push(button);
            this.tabPanels.set(tab.id, section);

            button.addEventListener('click', () => this.setActiveTab(tab.id));
            button.addEventListener('keydown', (event) => this.handleTabKeydown(event, index));

            this.renderControlsForTab(tab.id, section);
        });

    window.requestAnimationFrame(() => this.updateTabsIndicator());
    }

    updateTabsIndicator() {
        if (!this.tabsContainer || !this.tabButtons || !this.tabButtons.length) return;
        const activeBtn = this.tabButtons.find(b => b.dataset.tab === this.activeTab) || this.tabButtons[0];
        if (!activeBtn) return;
        const left = Math.max(0, Math.round(activeBtn.offsetLeft));
        const width = Math.max(0, Math.round(activeBtn.offsetWidth));
        if (this.tabsInner && this.tabsInner.style) {
            this.tabsInner.style.setProperty('--indicator-left', `${left}px`);
            this.tabsInner.style.setProperty('--indicator-width', `${width}px`);
        } else {
            this.tabsContainer.style.setProperty('--indicator-left', `${left}px`);
            this.tabsContainer.style.setProperty('--indicator-width', `${width}px`);
        }
    }

    renderControlsForTab(tabId, container) {
        const controls = Object.entries(this.settingConfig)
            .filter(([, meta]) => meta.tab === tabId);

        if (!controls.length) {
            const message = document.createElement('p');
            message.className = 'curve-approx-empty';
            message.dataset.i18n = `${this.getTabKey(tabId)}.empty`;
            message.textContent = this._t(`${this.getTabKey(tabId)}.empty`, '追加の設定はありません');
            container.appendChild(message);
            this._updateLanguage(message);
            return;
        }

        let toggleContainer = null;
        let currentGroupId = null;

        controls.forEach(([settingKey, meta]) => {
            const groupId = meta && meta.groupId ? meta.groupId : null;
            if (groupId !== currentGroupId) {
                toggleContainer = null;
                if (groupId) {
                    const heading = document.createElement('h3');
                    heading.className = 'curve-approx-section-title';
                    if (meta.groupLabelKey) {
                        heading.dataset.i18n = meta.groupLabelKey;
                    }
                    const headingLabel = this._t(meta.groupLabelKey, meta.groupLabel || groupId);
                    heading.textContent = headingLabel;
                    container.appendChild(heading);
                    this._updateLanguage(heading);
                }
                currentGroupId = groupId;
            }

            if (meta.type === 'toggle') {
                if (!toggleContainer) {
                    toggleContainer = document.createElement('div');
                    toggleContainer.className = 'curve-options';
                    container.appendChild(toggleContainer);
                }
                const button = this.createToggleControl(settingKey, meta);
                toggleContainer.appendChild(button);
            } else if (meta.type === 'range') {
                const wrapper = this.createRangeControl(settingKey, meta);
                container.appendChild(wrapper);
            }
        });
    }

    createToggleControl(settingKey, meta) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'curve-option-btn';
        button.dataset.setting = settingKey;
        const currentValue = !!this.getSettingValue(settingKey, meta);
        button.setAttribute('aria-pressed', currentValue ? 'true' : 'false');

        const icon = document.createElement('i');
        icon.className = 'material-symbols-rounded';
        icon.textContent = meta.icon;
        button.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'visually-hidden';
        label.dataset.i18n = meta.labelKey;
        label.textContent = meta.fallback;
        button.appendChild(label);

        button.title = this._t(meta.labelKey, meta.fallback);
        this._updateLanguage(label);

        button.addEventListener('click', () => {
            if (button.disabled) return;
            const newValue = !this.getSettingValue(settingKey, meta);
            this.updateSetting(settingKey, newValue, meta);
            this.syncToggleState(button, newValue);
        });

        this.controlElements.set(settingKey, { type: 'toggle', button, meta });
        return button;
    }

    createRangeControl(settingKey, meta) {
        const wrapper = document.createElement('div');
        wrapper.className = 'curve-approx-control';

        const label = document.createElement('label');
        label.dataset.i18n = meta.labelKey;
        label.textContent = this._t(meta.labelKey, meta.fallback);
        wrapper.appendChild(label);

        const rangeWrapper = document.createElement('div');
        rangeWrapper.className = 'curve-approx-range-wrapper';
        wrapper.appendChild(rangeWrapper);

        const rangeId = `curve-approx-${settingKey}`;
    const range = document.createElement('input');
        range.type = 'range';
        range.id = rangeId;
        range.min = String(meta.min);
        range.max = String(meta.max);
        range.step = String(meta.step);
    const initialValue = this.getSettingValue(settingKey, meta);
    const initialString = initialValue != null ? String(initialValue) : String(meta.min);
    range.value = initialString;
        label.setAttribute('for', rangeId);

        const number = document.createElement('input');
        number.type = 'number';
        number.id = `${rangeId}-number`;
        number.min = String(meta.min);
        number.max = String(meta.max);
        number.step = String(meta.step);
    number.value = initialString;
        number.inputMode = meta.decimals ? 'decimal' : 'numeric';

        rangeWrapper.appendChild(range);
        rangeWrapper.appendChild(number);

        range.addEventListener('input', () => {
            const value = this.coerceValue(range.value, meta);
            number.value = value;
            this.updateSetting(settingKey, parseFloat(value), meta);
        });

        number.addEventListener('change', () => {
            const value = this.coerceValue(number.value, meta);
            number.value = value;
            range.value = value;
            this.updateSetting(settingKey, parseFloat(value), meta);
        });

        this._updateLanguage(label);
        this.controlElements.set(settingKey, { type: 'range', range, number, meta });
        return wrapper;
    }

    bindGlobalEvents() {
        this.toggleButton.addEventListener('click', () => this.togglePanel());
        this.toggleButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                this.togglePanel();
            }
        });

        this.resetButton.addEventListener('click', () => this.resetToDefaults());

        document.addEventListener('pointerdown', (event) => {
            if (!this.isOpen) return;
            if (!this.root.contains(event.target)) {
                this.closePanel();
            }
        });

        document.addEventListener('keydown', (event) => {
            if (this.isOpen && event.key === 'Escape') {
                this.closePanel();
            }
        });

        window.addEventListener('resize', () => {
            if (this.tabsContainer) this.updateTabsIndicator();
            if (this.isOpen) this.closePanel();
        });

        document.addEventListener('advancedModeStateChanged', this.handleAdvancedModeChange);
        document.addEventListener('languageStateChanged', this.handleLanguageStateChange);
        document.addEventListener('approximatorSettingsChanged', this.handleExternalSettingsChange);

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this._handleBeforeUnload);
        }
    }

    focusFirstTab() {
        if (!this.tabButtons || !this.tabButtons.length) return;
        const btn = this.tabButtons.find(b => b.dataset.tab === this.activeTab) || this.tabButtons[0];
        if (btn) btn.focus();
    }

    handleTabKeydown(event, index) {
        const total = this.tabButtons.length;
        if (!total) return;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (index + 1) % total;
            this.setActiveTab(this.tabButtons[next].dataset.tab, { focus: true });
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            event.preventDefault();
            const prev = (index - 1 + total) % total;
            this.setActiveTab(this.tabButtons[prev].dataset.tab, { focus: true });
        } else if (event.key === 'Home') {
            event.preventDefault();
            this.setActiveTab(this.tabButtons[0].dataset.tab, { focus: true });
        } else if (event.key === 'End') {
            event.preventDefault();
            this.setActiveTab(this.tabButtons[total - 1].dataset.tab, { focus: true });
        }
    }

    setActiveTab(tabId, options = {}) {
        if (this.activeTab === tabId) {
            if (options.focus) {
                const btn = this.tabButtons.find(b => b.dataset.tab === tabId);
                if (btn) btn.focus();
            }
            return;
        }

        this.tabButtons.forEach(button => {
            const isActive = button.dataset.tab === tabId;
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.setAttribute('tabindex', isActive ? '0' : '-1');
            button.classList.toggle('active', isActive);
            if (isActive && options.focus) button.focus();
        });

        this.tabPanels.forEach((panel, id) => {
            const visible = id === tabId;
            panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
        });

        this.activeTab = tabId;
        window.requestAnimationFrame(() => this.updateTabsIndicator());
    }

    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    openPanel() {
        if (!this.panel) return;
        this.panel.setAttribute('aria-hidden', 'false');
        this.toggleButton.setAttribute('aria-expanded', 'true');
        this.isOpen = true;
        if (this.root) this.root.classList.add('open');
        window.requestAnimationFrame(() => this.focusFirstTab());
    }

    closePanel() {
        if (!this.panel) return;

        const active = document.activeElement;
        if (active && this.panel.contains(active)) {
            if (this.toggleButton && typeof this.toggleButton.focus === 'function') {
                this.toggleButton.focus();
            } else if (typeof active.blur === 'function') {
                active.blur();
            }
        }

        this.panel.setAttribute('aria-hidden', 'true');
        if (this.toggleButton) this.toggleButton.setAttribute('aria-expanded', 'false');
        this.isOpen = false;
        if (this.root) this.root.classList.remove('open');
    }

    syncUIFromSettings() {
        this.controlElements.forEach((entry, key) => {
            const value = this.getSettingValue(key, entry.meta);
            if (entry.type === 'toggle') {
                this.syncToggleState(entry.button, !!value);
            } else if (entry.type === 'range') {
                const raw = value != null ? String(value) : String(entry.meta.min);
                const formatted = this.coerceValue(raw, entry.meta);
                entry.range.value = formatted;
                entry.number.value = formatted;
            }
            this.updateControlDisabling(key, entry);
        });
    }

    syncToggleState(button, value) {
        button.classList.toggle('active', value);
        button.setAttribute('aria-pressed', value ? 'true' : 'false');
    }

    updateSetting(settingId, value, meta = null) {
        const currentValue = this.getSettingValue(settingId, meta);
        if (currentValue === value) return;
        const path = this.resolveSettingPath(meta, settingId);
        const partial = this.buildPartialFromPath(path, value);
        this.settingsModel = mergeModel(this.settingsModel, partial);
        this.settings = resolveSettings(this.settingsModel);
        this.applySettings({ source: 'approximator-panel', queueSave: true });
        this.refreshControlDependencies();
    }

    resolveSettingPath(meta, key) {
        if (meta && Array.isArray(meta.path)) {
            return meta.path.slice();
        }
        if (meta && typeof meta.path === 'string') {
            return meta.path.split('.');
        }
        if (typeof key === 'string' && key.includes('.')) {
            return key.split('.');
        }
        return [key];
    }

    buildPartialFromPath(pathSegments, value) {
        if (!Array.isArray(pathSegments) || !pathSegments.length) {
            return {};
        }
        let partial = value;
        for (let i = pathSegments.length - 1; i >= 0; i -= 1) {
            partial = { [pathSegments[i]]: partial };
        }
        return partial;
    }

    getSettingValue(key, meta = null) {
        if (!this.settings) return undefined;
        const path = this.resolveSettingPath(meta, key);
        let cursor = this.settings;
        for (const segment of path) {
            if (cursor == null) {
                return undefined;
            }
            cursor = cursor[segment];
        }
        return cursor;
    }

    refreshControlDependencies() {
        this.controlElements.forEach((entry, key) => this.updateControlDisabling(key, entry));
    }

    updateControlDisabling(settingKey, entry) {
        if (!entry || !entry.meta) {
            return;
        }
        const dependsOn = entry.meta.dependsOn;
        const dependencies = Array.isArray(dependsOn)
            ? dependsOn
            : dependsOn
                ? [dependsOn]
                : [];
        let shouldDisable = false;
        if (dependencies.length) {
            shouldDisable = dependencies.some(dep => !this.getSettingValue(dep));
        }

        if (entry.type === 'toggle') {
            if (entry.button) {
                entry.button.disabled = shouldDisable;
                entry.button.classList.toggle('disabled', shouldDisable);
                if (shouldDisable) {
                    entry.button.setAttribute('aria-disabled', 'true');
                } else {
                    entry.button.removeAttribute('aria-disabled');
                }
            }
        } else if (entry.type === 'range') {
            const controls = [entry.range, entry.number].filter(Boolean);
            controls.forEach(control => {
                control.disabled = shouldDisable;
                control.classList.toggle('disabled', shouldDisable);
            });
        }
    }

    resetToDefaults() {
        const active = this.activeTab || 'display';
        const keysToReset = Object.entries(this.settingConfig)
            .filter(([, meta]) => meta && meta.tab === active)
            .map(([key]) => key);

        if (!keysToReset.length) return;

        keysToReset.forEach((settingKey) => {
            const meta = this.settingConfig[settingKey];
            const path = this.resolveSettingPath(meta, settingKey);

            let defaultCursor = this.defaultSettings;
            let found = true;
            for (const segment of path) {
                if (defaultCursor == null || typeof defaultCursor !== 'object' || !(segment in defaultCursor)) {
                    found = false;
                    break;
                }
                defaultCursor = defaultCursor[segment];
            }

            const defaultValue = found ? defaultCursor : undefined;
            const partial = this.buildPartialFromPath(path, defaultValue);
            this.settingsModel = mergeModel(this.settingsModel, partial);
        });

        this.settings = resolveSettings(this.settingsModel);
        this.syncUIFromSettings();
        this.applySettings({ source: 'approximator-panel', queueSave: true });
    }

    applySettings(options = {}) {
        if (!this.curveManager) {
            if (options.queueSave) this.queueSave();
            return;
        }

        const source = options.source || 'approximator-panel';
        this._ignoreNextEventSource = source;

        let resolved = null;

        if (typeof this.curveManager.setApproximatorSettings === 'function') {
            resolved = this.curveManager.setApproximatorSettings(this.settingsModel, {
                source,
                persist: options.queueSave !== false && options.persist !== false,
                silent: options.silent === true
            });
        } else if (this.curveManager.approximatorSettings) {
            this.curveManager.approximatorSettings = {
                ...this.curveManager.approximatorSettings,
                ...this.settings
            };
            resolved = this.curveManager.approximatorSettings;
        }

        this._ignoreNextEventSource = null;

        if (resolved) {
            this.settings = resolved;
        } else {
            this.settings = resolveSettings(this.settingsModel);
        }

        this.refreshControlDependencies();

        if (this.curveManager.settings) {
            this.curveManager.settings.showKnotsDefault = this.settings.showKnotsDefault;
            this.curveManager.settings.snap = this.settings.snap;
        }

        if (options.queueSave) {
            this.queueSave();
        } else if (options.flush) {
            this.flushPendingSave();
        }
    }

    loadSettings(settings) {
        if (!settings) return;
        this.applyExternalSettings(settings, {
            source: 'external-load',
            persist: false,
            updateUI: true
        });
    }

    getSettings() {
        return this.settings;
    }

    getSettingsModel() {
        return cloneModel(this.settingsModel);
    }

    queueSave() {
        if (typeof window === 'undefined') return;
        if (this._saveTimer) {
            window.clearTimeout(this._saveTimer);
        }
        this._saveTimer = window.setTimeout(() => {
            this._saveTimer = null;
            this.flushPendingSave();
        }, this._saveDelayMs);
    }

    flushPendingSave() {
        if (typeof window !== 'undefined' && this._saveTimer) {
            window.clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        saveSettingsToStorage(this.settingsModel);
    }

    applyExternalSettings(partialSettings, options = {}) {
        const { model, resolved, errors, applied } = mergeModelWithValidation(
            this.settingsModel,
            partialSettings
        );

        if (!applied.length) {
            return {
                success: false,
                message: 'No valid approximator settings were provided.',
                errors
            };
        }

        this.settingsModel = model;
        this.settings = resolved;

        if (options.updateUI !== false) {
            this.syncUIFromSettings();
        }

        this.applySettings({
            source: options.source || 'external',
            queueSave: options.persist !== false
        });

        return {
            success: true,
            settings: this.getSettings(),
            appliedKeys: applied,
            warnings: errors.length ? errors : undefined
        };
    }

    handleExternalSettingsChange(event) {
        if (!event || !event.detail) return;
        const { source, model, settings, persist } = event.detail;

        if (source && source === this._ignoreNextEventSource) {
            this._ignoreNextEventSource = null;
            return;
        }

        if (model) {
            this.settingsModel = cloneModel(model);
        } else if (settings) {
            this.settingsModel = mergeModel(this.settingsModel, settings);
        }

        this.settings = resolveSettings(this.settingsModel);
        this.syncUIFromSettings();
        this.refreshControlDependencies();

        if (persist) {
            this.queueSave();
        }
    }

    handleAdvancedModeChange(event) {
        const enabled = !!(event && event.detail && typeof event.detail.enabled === 'boolean'
            ? event.detail.enabled
            : document.body.classList.contains('grapen-advanced-mode'));

        if (this.root) {
            this.root.setAttribute('aria-hidden', enabled ? 'false' : 'true');
        }

        if (!enabled) {
            this.closePanel();
            this.toggleButton.setAttribute('tabindex', '-1');
        } else {
            this.toggleButton.setAttribute('tabindex', '0');
        }
    }

    coerceValue(raw, meta) {
        let value = parseFloat(raw);
        if (Number.isNaN(value)) value = meta.min;
        value = Math.max(meta.min, Math.min(meta.max, value));
        if (meta.decimals) {
            const factor = Math.pow(10, meta.decimals);
            value = Math.round(value * factor) / factor;
        }
        return value.toString();
    }

    getTabKey(tabId) {
        return `approximator.tab.${tabId}`;
    }

    refreshLocalizedLabels() {
        this._updateLanguage(this.toggleButton);
        this._updateLanguage(this.panel);
        if (this.resetButton) this._updateLanguage(this.resetButton);

        this.controlElements.forEach((entry) => {
            if (entry.type === 'toggle') {
                const hidden = entry.button.querySelector('.visually-hidden');
                if (hidden && typeof this.languageManager?.updateSpecificElement === 'function') {
                    this.languageManager.updateSpecificElement(hidden);
                }
                const labelText = hidden?.textContent || entry.button.title || '';
                entry.button.title = labelText;
                entry.button.setAttribute('aria-label', labelText);
            } else if (entry.type === 'range') {
                const control = entry.range.closest('.curve-approx-control');
                if (control) {
                    const label = control.querySelector('label[data-i18n]');
                    if (label && typeof this.languageManager?.updateSpecificElement === 'function') {
                        this.languageManager.updateSpecificElement(label);
                    }
                }
            }
        });

        if (this.contentContainer && typeof this.languageManager?.updateSpecificElement === 'function') {
            this.contentContainer.querySelectorAll('.curve-approx-empty[data-i18n]').forEach(el => {
                this.languageManager.updateSpecificElement(el);
            });
        }
    }

    _t(key, fallback) {
        const lang = this.languageManager?.currentLang;
        const translations = this.languageManager?.translations;
        if (lang && translations && translations[lang] && translations[lang][key]) {
            return translations[lang][key];
        }
        return fallback;
    }

    _updateLanguage(element) {
        if (!element) return;
        if (typeof this.languageManager?.updateSpecificElement === 'function') {
            this.languageManager.updateSpecificElement(element);
        }

        if (element === this.toggleButton) {
            const hidden = element.querySelector('.visually-hidden');
            if (hidden) {
                const label = hidden.textContent || '近似設定';
                element.setAttribute('aria-label', label);
                element.title = label;
            }
        } else if (element === this.panel) {
            this.panel.setAttribute('aria-label', this._t('approximator.title', '曲線近似設定'));
        }
    }
}
