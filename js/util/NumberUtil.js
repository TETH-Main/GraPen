export function signedString(number) {
    return number.toLocaleString(undefined, { signDisplay: 'always' });
}

function formatWithCommas(number) {
    return number.toLocaleString();
}

function toFixed(number, decimals) {
    return number.toFixed(decimals);
}

function isPositive(number) {
    return number > 0;
}

function isNegative(number) {
    return number < 0;
}

// toFixedメソッドとsignedStringメソッドを組み合わせて、指定した小数点以下の桁数で符号付きの文字列を返す
export function signedFixedString(number, decimals) {
    // 値が有限でない場合は '0' を返す、桁数が未指定ならそのまま文字列化する（必要なら有効化）
    // if (!isFinite(number)) return '0';
    // if (decimals == null || decimals === undefined) return number.toString();
    return signedString(Number(toFixed(number, decimals)));
}

// 指定した小数点以下の桁数の文字列を返す
function fixedString(number, decimals) {
    return toFixed(number, decimals);
}

// 指定した小数点以下の桁数に丸める
function roundDecimals(number, decimals) {
    if (!isFinite(number)) return 0;
    if (decimals == null || decimals === undefined) return number;
    // 10^decimalsで丸める
    const factor = Math.pow(10, decimals);
    return Math.round(number * factor) / factor;
}

// 二次関数の係数を指定して、平方完成の形に変換した後指定した桁数で丸めて、一般式に直して返す
// a, b, cはそれぞれ二次項、一次項、定数項の係数
// decimalsは小数点以下の桁数
export function roundQuadraticCoeffs(a, b, c, decimals) {
    const p = -b / (2 * a);
    const q = c - a * p * p;
    const aRounded = roundDecimals(a, decimals);
    const pRounded = roundDecimals(p, decimals);
    const qRounded = roundDecimals(q, decimals);

    const bRounded = - 2 * aRounded * pRounded;
    const cRounded = aRounded * pRounded * pRounded + qRounded;
    return [aRounded, bRounded, cRounded];
}

export function formatQuadratic(a, p, q, decimals) {
    // aが0の場合（定数関数）
    if (a === 0) {
        return `y = ${q}`;
    }
    // aが1または-1の場合
    let aStr = "";
    if (a === 1) {
        aStr = "";
    } else if (a === -1) {
        aStr = "-";
    } else {
        aStr = fixedString(a, decimals);
    }
    // pが0の場合
    let xPart = "";
    if (p === 0) {
        xPart = "x^2";
    } else {
        xPart = `(x${signedFixedString(p, decimals)})^2`;
    }
    // qが0の場合
    let qPart = "";
    if (q === 0) {
        qPart = "";
    } else {
        qPart = `${signedFixedString(q, decimals)}`;
    }
    // aが1または-1でp, qが0の場合
    if (p === 0 && q === 0) {
        return `y = ${aStr}x^2`;
    }
    // aが1または-1でqが0の場合
    if (q === 0) {
        return `y = ${aStr}${xPart}`;
    }
    // aが1または-1でpが0の場合
    if (p === 0) {
        return `y = ${aStr}x^2${qPart}`;
    }
    // 一般形
    return `y = ${aStr}${xPart}${qPart}`;
}

// ----------------------
// 逆ポーランド記法（RPN）ヘルパー
// ----------------------

function preprocessFormula(formula) {
    if (!formula) return '';
    let s = formula.trim();
    s = s.replace(/^y\s*=\s*/i, '');
    s = s.replace(/\s+/g, '');
    s = s.replace(/(\d)(x)/gi, '$1*$2');
    s = s.replace(/(\))(x)/gi, '$1*$2');
    s = s.replace(/(x)(\()/gi, '$1*$2');
    s = s.replace(/(x)(\d)/gi, '$1*$2');
    s = s.replace(/(\d)(\()/g, '$1*$2');
    return s;
}

function toJSEvalExpression(expr) {
    if (!expr) return '';
    let s = expr;
    s = s.replace(/\^/g, '**');
    s = s.replace(/(\d)(\()/g, '$1*$2');
    s = s.replace(/(\))(\d)/g, '$1*$2');
    s = s.replace(/(\))(x)/gi, '$1*$2');
    s = s.replace(/\bcos\s*\(/g, 'Math.cos(');
    s = s.replace(/\bsin\s*\(/g, 'Math.sin(');
    s = s.replace(/\btan\s*\(/g, 'Math.tan(');
    s = s.replace(/\bsqrt\s*\(/g, 'Math.sqrt(');
    return s;
}

function evaluateAtX(formula, x) {
    const expr = preprocessFormula(formula);
    const jsExpr = toJSEvalExpression(expr);
    try {
        const fn = new Function('x', 'return (' + jsExpr + ');');
        return Number(fn(x));
    } catch (e) {
        // フォールバック: NaN を返す
        return NaN;
    }
}

export function evaluateFormula(formula, x) {
    return evaluateAtX(formula, x);
}

function parseVertexForm(expr) {
    // a*(x - h)^2 + k の形式にマッチ（a が省略されると 1 とみなす）
    // 例: 2(x-3)^2+1   (x-3)^2+1   -3(x+4)^2-2
    const re = /^\s*([+-]?\d*\.?\d*)?\s*\*?\s*\(\s*x\s*([+-]\s*\d*\.?\d*)\s*\)\s*\^?2\s*(?:([+-]?\d*\.?\d*))?\s*$/i;
    const m = expr.match(re);
    if (!m) return null;
    let aStr = m[1];
    let a = 1;
    if (aStr && aStr !== '' && aStr !== '+' && aStr !== '-') a = Number(aStr);
    else if (aStr === '-') a = -1;
    // m[2] は (x-3) の場合 '-3' のようになるので、ここでは h は正の 3 と解釈する
    const h = -Number(m[2].replace(/\s+/g, ''));
    const k = m[3] ? Number(m[3]) : 0;
    return { a, h, k };
}

function parseLinearForm(expr) {
    // a*(x - p) + q の形式にマッチ（a が省略されると 1 とみなす）
    // 例: 2(x-3)+1   (x-3)+1   -3(x+4)-2
    const pointSlopeRe = /^\s*([+-]?\d*\.?\d*)?\s*\*?\s*\(\s*x\s*([+-]\s*\d*\.?\d*)\s*\)\s*([+-]?\s*\d*\.?\d*)?\s*$/i;
    const ps = expr.match(pointSlopeRe);
    if (ps) {
        let aStr = ps[1];
        let a = 1;
        if (aStr && aStr !== '' && aStr !== '+' && aStr !== '-') a = Number(aStr);
        else if (aStr === '-') a = -1;
        // ps[2] は (x-3) の場合 '-3' のようになるので、符号を正しく解釈する
        const rawP = ps[2].replace(/\s+/g, '');
        const p = -Number(rawP);
        const q = ps[3] ? Number(ps[3].replace(/\s+/g, '')) : 0;
        if (Number.isFinite(a) && Number.isFinite(p) && Number.isFinite(q)) {
            return { form: 'pointSlope', a, p, q };
        }
    }

    // 傾き切片形式: a*x + b にマッチ（a は省略可能、+ b は省略可能）
    const slopeInterceptRe = /^\s*([+-]?\d*\.?\d*)?\*?x(?:([+-]\s*\d*\.?\d*))?\s*$/i;
    const si = expr.match(slopeInterceptRe);
    if (si) {
        const rawSlope = (si[1] ?? '').replace(/\s+/g, '');
        let a = 1;
        if (rawSlope) {
            if (rawSlope === '+') a = 1;
            else if (rawSlope === '-') a = -1;
            else a = Number(rawSlope);
        }
        const rawIntercept = si[2] ? si[2].replace(/\s+/g, '') : '0';
        const b = Number(rawIntercept);
        if (Number.isFinite(a) && Number.isFinite(b)) {
            return { form: 'slopeIntercept', a, b };
        }
    }

    // 単純な 'x' または '-x' を処理する
    if (/^[+-]?x$/.test(expr)) {
        const a = expr.startsWith('-') ? -1 : 1;
        return { form: 'slopeIntercept', a, b: 0 };
    }

    return null;
}

function formatNumber(n, decimals = 3) {
    if (!isFinite(n)) return String(n);
    const r = roundDecimals(Number(n), decimals);
    // 実質的に整数であれば整数文字列を返す
    if (Math.abs(r - Math.round(r)) < 1e-12) return String(Math.round(r));
    // toFixed を使って適切に丸めたうえで末尾の不要な 0 を削る
    let s = r.toFixed(decimals);
    // 末尾の 0 や不要な小数点を取り除く
    s = s.replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/g, '');
    return s;
}

function addDeltaToTrailingNumber(part, delta) {
    // 文字列中の最後の数値を見つけて delta を加算する
    const re = /([+-]?\d*\.?\d+)(?!.*\d)/;
    const m = part.match(re);
    if (!m) return part + (delta >= 0 ? '+' + delta : delta);
    const val = Number(m[1]);
    const newVal = val + delta;
    return part.slice(0, m.index) + String(newVal) + part.slice(m.index + m[1].length);
}

function addDeltaToLastNumberBetter(part, delta) {
    const re = /([+-]?)(\d*\.?\d+)\s*$/;
    const m = part.match(re);
    if (!m) {
        // 末尾に数値定数がない場合: '+delta' を追加するか単に delta を追加する
        if (delta >= 0) return part + '+' + delta;
        return part + delta;
    }
    const numStr = m[2];
    const sign = m[1] || '';
    const val = Number((sign === '-') ? ('-' + numStr) : numStr);
    const newVal = val + delta;
    const prefix = part.slice(0, m.index);
    const formatted = (newVal >= 0 ? `+${Math.abs(newVal)}` : `-${Math.abs(newVal)}`);
    return prefix + formatted;
}

function translateControlPoints(expr, dx, dy) {
    return expr.replace(/\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)/g, function (_, xs, ys) {
        const nx = Number(xs) + dx;
        const ny = Number(ys) + dy;
        return `(${nx},${ny})`;
    });
}

function translateParametricPair(expr, dx, dy) {
    // '(expr1, expr2)' のようなパラメトリックなペアを想定する
    const inner = expr.replace(/^\(|\)$/g, '');
    const parts = inner.split(/\s*,\s*/);
    if (parts.length !== 2) return expr;
    const p1 = addDeltaToLastNumberBetter(parts[0], dx);
    const p2 = addDeltaToLastNumberBetter(parts[1], dy);
    return `(${p1}, ${p2})`;
}

export function detectFormulaType(formula) {
    const raw = String(formula || '');
    const s = preprocessFormula(raw).toLowerCase();
    if (!s) return 'unknown';

    if (/^x\s*=/.test(raw.trim().toLowerCase())) return 'vertical';

    if (/\b(sin|cos|tan|atan2|sqrt)\s*\(/.test(s) || /\bt\b/.test(s) && /\(|\)/.test(s)) {
        if (/^\s*\([^,]+,[^,]+\)\s*$/.test(raw)) return 'arc';
        if (/\b(sin|cos|tan)\b/.test(s)) return 'arc';
    }

    const coordPairRe = /\(\s*[+-]?\d*\.?\d+\s*,\s*[+-]?\d*\.?\d+\s*\)/g;
    const pairs = s.match(coordPairRe) || [];
    if (pairs.length === 3) return 'bezier2';
    if (pairs.length === 4) return 'bezier3';
    if (/\bt\b/.test(s) && /\b(1-t)\b/.test(s) && /\bt\b/.test(s) && /\^/.test(s)) {
        if (/\^3/.test(s) || /\*3\*/.test(s)) return 'bezier3';
        return 'bezier2';
    }

    const hasX2 = /x\s*\*\*\s*2|x\s*\^\s*2|\(x[^\)]*\)\s*\^\s*2/.test(s);
    const hasY2 = /y\s*\*\*\s*2|y\s*\^\s*2|\(y[^\)]*\)\s*\^\s*2/.test(s);
    if (hasX2 && hasY2 && /=/.test(raw)) return 'arc';

    // 二次式: x^2 または (x ± h)^2 を探す
    if (/\^\s*2/.test(s) || /\([^\)]*\)\s*\^\s*2/.test(s) || /x\*\*2/.test(s)) return 'quadratic';

    // 線形: x を含むが ^2 を含まない（パラメトリック/ベジェ/円は除く）
    if (/\bx\b/.test(s) || /\b(x)\*/.test(s) || /\*x\b/.test(s)) return 'linear';

    // フォールバック: 定数として扱う
    return 'constant';
}

function tryExternalToRPN(expr) {
    try {
        if (typeof globalThis !== 'undefined' && globalThis.rpn) {
            const r = globalThis.rpn;
            if (typeof r.toRPN === 'function') return r.toRPN(expr);
            if (typeof r.infixToPostfix === 'function') return r.infixToPostfix(expr);
            if (typeof r.parse === 'function') return r.parse(expr);
        }
        if (typeof require === 'function') {
            try {
                const path = require('path');
                const file = path.join(__dirname, 'rpn.min.js');
                require(file);
                if (globalThis.rpn) {
                    const r = globalThis.rpn;
                    if (typeof r.toRPN === 'function') return r.toRPN(expr);
                    if (typeof r.infixToPostfix === 'function') return r.infixToPostfix(expr);
                    if (typeof r.parse === 'function') return r.parse(expr);
                }
            } catch (e) {
            }
        }
    } catch (e) {
    }
    return null;
}

function tokenize(expr) {
    const tokens = [];
    const re = /\d*\.?\d+|[a-zA-Z]+|\^|\*|\/|\+|\-|\(|\)/g;
    let m;
    while ((m = re.exec(expr)) !== null) {
        tokens.push(m[0]);
    }
    return tokens;
}

function toRPNShuntingYard(expr) {
    const output = [];
    const ops = [];
    const prec = { '^': 4, '*': 3, '/': 3, '+': 2, '-': 2 };
    const assoc = { '^': 'right', '*': 'left', '/': 'left', '+': 'left', '-': 'left' };
    const tokens = tokenize(expr);
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^\d*\.?\d+$/.test(t) || /^[a-zA-Z]+$/.test(t)) {
            output.push(t);
            continue;
        }
        if (t === '(') {
            ops.push(t);
            continue;
        }
        if (t === ')') {
            while (ops.length && ops[ops.length - 1] !== '(') {
                output.push(ops.pop());
            }
            ops.pop();
            continue;
        }
        while (ops.length) {
            const o2 = ops[ops.length - 1];
            if (o2 === '(') break;
            const p1 = prec[t] || 0;
            const p2 = prec[o2] || 0;
            if ((assoc[t] === 'left' && p1 <= p2) || (assoc[t] === 'right' && p1 < p2)) {
                output.push(ops.pop());
                continue;
            }
            break;
        }
        ops.push(t);
    }
    while (ops.length) output.push(ops.pop());
    return output;
}

export function toRPN(formula) {
    if (formula == null) return [];
    const expr = preprocessFormula(formula);
    const external = tryExternalToRPN(expr);
    if (external && Array.isArray(external)) return external;
    if (typeof external === 'string') return external.split(/\s+/).filter(Boolean);
    return toRPNShuntingYard(expr);
}

export function fromRPN(rpnTokens) {
    if (!Array.isArray(rpnTokens)) return '';
    const stack = [];
    for (const tok of rpnTokens) {
        if (/^\d*\.?\d+$/.test(tok) || /^[a-zA-Z]+$/.test(tok)) {
            stack.push(tok.toString());
            continue;
        }
        // 演算子処理
        const b = stack.pop() || '0';
        const a = stack.pop() || '0';
        stack.push('(' + a + tok + b + ')');
    }
    return stack.length ? stack[stack.length - 1] : '';
}

export function applyDeltaToRPN(rpnTokens, dx = 0, dy = 0) {
    if (!Array.isArray(rpnTokens)) return rpnTokens;
    const out = [];
    for (const tok of rpnTokens) {
        if (tok === 'x' || tok === 'X') {
            out.push('x');
            out.push(String(dx));
            out.push('-');
        } else {
            out.push(tok);
        }
    }
    if (dy && dy !== 0) {
        out.push(String(dy));
        out.push('+');
    }
    return out;
}

function formatLinear(a, b) {
    // 'y = ax + b' の形式の文字列を返す
    a = Number(a);
    b = Number(b);
    if (a === 0) return `y = ${formatNumber(b, 3)}`;
    const coef = (a === 1) ? '' : (a === -1 ? '-' : formatNumber(a, 2));
    const aStr = (coef === '') ? 'x' : (coef + 'x');
    if (b === 0) return `y = ${aStr}`;
    const sign = b >= 0 ? ' + ' : ' - ';
    return `y = ${aStr}${sign}${formatNumber(Math.abs(b), 3)}`;
}

function formatQuadraticFromCoeffs(a, b, c) {
    a = Number(a);
    b = Number(b);
    c = Number(c);
    let parts = [];
    if (a !== 0) {
        parts.push((a === 1) ? 'x^2' : (a === -1 ? '-x^2' : (formatNumber(a, 3) + 'x^2')));
    }
    if (b !== 0) {
        parts.push((b > 0 ? '+ ' : '- ') + (Math.abs(b) === 1 ? 'x' : (formatNumber(Math.abs(b), 3) + 'x')));
    }
    if (c !== 0) {
        parts.push((c > 0 ? '+ ' : '- ') + formatNumber(Math.abs(c), 3));
    }
    if (parts.length === 0) return 'y = 0';
    let body = parts.join(' ');
    body = body.replace(/\+ -/g, '- ').replace(/\s+/g, ' ').trim();
    if (!/^y\s*=/.test(body)) return `y = ${body}`;
    return body;
}

export function applyDeltaToFormulaNumeric(formula, dx = 0, dy = 0) {
    const type = detectFormulaType(formula);
    const expr = preprocessFormula(formula);
    // 特殊ケース: 頂点形式 a(x-h)^2 + k のような二次式 -> h を dx、k を dy だけ平行移動する
    const vertex = parseVertexForm(expr);
    if (vertex) {
        const a = vertex.a;
        const h = vertex.h;
        const k = vertex.k;
        const newH = h + dx;
        const newK = k + dy;
        // 形式を a(x-h)^2 + k の形で保持する
        const aStr = (a === 1) ? '' : (a === -1 ? '-' : formatNumber(a, 3));
        const hRaw = newH;
        const hStr = formatNumber(Math.abs(hRaw), 3);
        const hMiddle = (hRaw >= 0) ? ` - ${hStr}` : ` + ${hStr}`;
        const kPart = newK === 0 ? '' : (newK > 0 ? ` + ${formatNumber(newK, 3)}` : ` - ${formatNumber(Math.abs(newK), 3)}`);
        return `y = ${aStr}(x${hMiddle})^2${kPart}`;
    }

    // 特殊ケース: 括弧形式 a(x - p) + q の線形式 -> p を dx、q を dy だけ移動して形式を保持する
    const linearForm = parseLinearForm(expr);
    if (linearForm) {
        if (linearForm.form === 'pointSlope') {
            const a = linearForm.a;
            const p = linearForm.p;
            const q = linearForm.q;
            const newP = p + dx;
            const newQ = q + dy;
            const aStr = (a === 1) ? '' : (a === -1 ? '-' : formatNumber(a, 3));
            const pRaw = newP;
            const pStr = formatNumber(Math.abs(pRaw), 3);
            const middle = (pRaw >= 0) ? ` - ${pStr}` : ` + ${pStr}`;
            const qStr = (newQ === 0) ? '' : (newQ > 0 ? ` + ${formatNumber(newQ, 3)}` : ` - ${formatNumber(Math.abs(newQ), 3)}`);
            return `y = ${aStr}(x${middle})${qStr}`;
        }

        if (linearForm.form === 'slopeIntercept') {
            const a = linearForm.a;
            const b = linearForm.b;
            const newB = b - a * dx + dy;
            return formatLinear(a, newB);
        }
    }

    // 特殊ケース: 複数の座標ペア (x,y)（例: ベジェ曲線） -> 各座標ペアを平行移動する
    const coordPairRe = /\(\s*[+-]?\d*\.?\d+\s*,\s*[+-]?\d*\.?\d+\s*\)/g;
    const pairs = expr.match(coordPairRe);
    if (pairs && pairs.length >= 2) {
        const translated = translateControlPoints(formula, dx, dy);
        return translated;
    }

    // 特殊ケース: '(expr1, expr2)' のようなパラメトリックペア（式内に関数や変数が含まれる場合あり）
    if (/^\s*\([^,]+,[^,]+\)\s*$/.test(formula)) {
        const translated = translateParametricPair(formula, dx, dy);
        return translated;
    }

    // 特殊ケース: 暗黙円 (x - h)^2 + (y - k)^2 = r^2 -> h, k をそれぞれ dx, dy だけ平行移動する
    if (/\(x[^\)]*\)\^?2/.test(formula) && /\(y[^\)]*\)\^?2/.test(formula)) {
        let s = formula;
        s = s.replace(/\(x\s*([-+])\s*(\d*\.?\d+)\s*\)/g, function (_, sign, num) {
            const h = (sign === '-' ? Number(num) : -Number(num));
            const newH = h + dx;
            const sign2 = newH < 0 ? '+' : '-';
            return `(x${sign2}${Math.abs(newH)})`;
        });
        s = s.replace(/\(y\s*([-+])\s*(\d*\.?\d+)\s*\)/g, function (_, sign, num) {
            const k = (sign === '-' ? Number(num) : -Number(num));
            const newK = k + dy;
            const sign2 = newK < 0 ? '+' : '-';
            return `(y${sign2}${Math.abs(newK)})`;
        });
        return s;
    }
    if (/^\s*x\s*=/.test(formula)) {
        try {
            const k = Number(formula.replace(/^\s*x\s*=\s*/i, '').replace(/[^0-9eE+\-\.]/g, ''));
            if (Number.isFinite(k)) return `x = ${formatNumber(k + dx, 3)}`;
        } catch (e) {
        }
    }

    if (type === 'constant') {
        try {
            const val = Function('return (' + expr + ')')();
            return `y = ${formatNumber(val + dy, 3)}`;
        } catch (e) {
            return `y = ${expr} ${dy >= 0 ? '+' : '-'} ${formatNumber(Math.abs(dy), 3)}`;
        }
    }

    if (type === 'linear') {
        const y0 = evaluateAtX(formula, 0);
        const y1 = evaluateAtX(formula, 1);
        if (isFinite(y0) && isFinite(y1)) {
            const a = y1 - y0;
            const b = y0;
            const newA = a;
            const newB = b - a * dx + dy;
            return formatLinear(newA, newB);
        }
    }
    if (type === 'quadratic') {
        const y0 = evaluateAtX(formula, 0);
        const y1 = evaluateAtX(formula, 1);
        const y2 = evaluateAtX(formula, 2);
        if (isFinite(y0) && isFinite(y1) && isFinite(y2)) {
            // y = ax^2 + bx + c（係数表記）
            // y0 = c
            // y1 = a + b + c
            // y2 = 4a + 2b + c
            const c = y0;
            const a = (y2 - 2 * y1 + y0) / 2;
            const b = y1 - a - c;
            const newA = a;
            const newB = -2 * a * dx + b;
            const newC = a * dx * dx - b * dx + c + dy;
            return formatQuadraticFromCoeffs(newA, newB, newC);
        }
    }

    const rpn = toRPN(formula);
    const moved = applyDeltaToRPN(rpn, dx, dy);
    const infix = fromRPN(moved);
    if (!/[a-zA-Z]/.test(infix)) {
        try {
            const v = Function('return (' + infix + ')')();
            return `y = ${formatNumber(v, 3)}`;
        } catch (e) {
            // 無視する
        }
    }
    return `y = ${infix}`;
}
