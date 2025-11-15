# Approximation Patterns — Guide for Adding New Approximators

This document summarizes the common patterns, contracts, and conventions used by the approximators in `js/approximator/` so you can add new approximation algorithms consistently.

It is written as a concise recipe you can follow. Where possible the patterns reflect how the existing implementations behave (Linear, PiecewiseLinear, Quadratic B-spline).

---

## 1) Overview — goals
- Approximators accept a sequence of points in graph coordinates and try to represent them by a compact analytic or piecewise model (line, piecewise linear, quadratic B-spline, etc.).
- Each approximator exposes a small, consistent programmatic API and returns a result object with a predictable shape that the rest of the app expects.
- Approximators should be defensive: validate inputs, return `success:false` and a short `message` on failures.

---

## 2) Common input contract
- Primary input is always an Array of points in graph coordinates (not screen coords):
  - `[[x1, y1], [x2, y2], ...]` (Array of 2-number arrays)
  - Some approximators accept an alternative representation for "knotPoints": objects like `{x, y, id}` — if both are present code normally accepts either.
- Optional parameters:
  - `domain` object: `{ xMin, xMax, yMin, yMax }` — used when domain-aware processing is required.
  - `options` object: algorithm-specific configuration (min/max knots, snapping, thresholds, samplingRate, etc.).
- If a method supports custom knots, it accepts an additional `customKnots` array of knot positions (normalized 0..1 or domain values depending on method).

Examples:
- `approximate(points)`
- `approximate(points, domain, options)`
- `approximateWithCustomKnots(points, customKnots, domain, options)`

---

## 3) Common output contract
Approximators return an object with the following commonly used fields (some optional depending on algorithm):

Required/common fields
- `success` (boolean) — whether approximation succeeded.
- `message` (string) — short error or status string on failure.
- `originalPoints` — the input (or preprocessed) points used for approximation.
- `type` (string) — algorithm/type, e.g. `"linear"`, `"constant"`, `"vertical"`, `"piecewiseLinear"`, `"quadratic"`.
- `latexEquations` (Array) — array of equation descriptors used by the UI. Each entry typically:
  - `{ type: 'quadratic'|'linear'|'constant'|'vertical'|'piecewiseLinear', formula: <string>, domain: {start, end}, rpn?: <array>, ... }`

Approximation-specific fields (examples):
- `knots` — array of knot coordinates (points) or normalized positions used to draw or index segments.
- `preKnots` — internal candidate knots with metadata: array of `{ knot: <number>, priority: <int>, diff: <number> }` (BSpline conventions)
- `bezierSegments` — array of bezier segment descriptors for drawing (for quadratic B-spline usually `{start, control, end}`)
- `svgPath` — ready-to-use path string for drawing in SVG
- `splineCoefficients` — numeric coefficients per segment (for later export/analysis)
- `processedPoints` or `processed` — points after filtering/optimization

Return examples (minimal):
{
  success: true,
  type: 'quadratic',
  originalPoints: points,
  knots: [...],
  preKnots: [...],
  bezierSegments: [...],
  svgPath: 'M ... Q ...',
  latexEquations: [{ type: 'quadratic', formula: 'y=2(x-1)^2+3', domain: {start:'0', end:'5'} }]
}

---

## 4) Error / quality estimation patterns
Existing approximators use several ways to quantify approximation quality.

LinearFunctionApproximator
- Linearity measure is `1 - (maxDist / length)` where `maxDist` is the maximum perpendicular distance from interior points to the chord (start–end).
- If `linearity < threshold` the algorithm returns failure.

PiecewiseLinearApproximator
- Uses Douglas–Peucker simplification to get candidate nodes.
- For each simplified segment calculate a segment linearity score (same maxDist/length idea).
- Average segment linearity and per-segment thresholds decide acceptance.

Quadratic B-spline (BSplineApproximator)
- Normalizes points to [0..1] in x and y for internal processing.
- Prepares candidate knots (`preKnots`) and then forms a knot set for a given knot number.
- Constructs a normal equation system Ab (inner products of basis functions) and solves for coefficients.
- Computes second derivatives (PoY) per segment and uses adjacent-second-derivative differences to populate `preKnots.diff`.
- Sorts `preKnots` by `diff` to prioritize knot removal/selection; priority and diff are used to select knot sets for different knot counts.

Common themes
- Use simple geometric error (perpendicular distance) for linear assessments.
- For spline approximations, use basis/least squares and second-derivative differences as a heuristic for curvature-based knot importance.
- Always have conservative fallback: return `success:false` with message rather than throwing on malformed input.

---

## 5) Latex and RPN handling
- Many approximators produce `latexEquations` entries for UI display. The `formula` string follows patterns used elsewhere (often `y = a(x - p)^2 + q` for quadratic, or `y = m(x - x0) + y0` for linear).
- There are utility functions under `js/util/NumberUtil.js` that help with:
  - `toRPN(formula)` — converts formula to an RPN token list used for numeric evaluation.
  - `detectFormulaType(formula)` — classify formula types.
  - `evaluateFormula` / `evaluateRPN` — evaluate formula tokens at an x.
- When you generate `latexEquations`, consider adding an `rpn` field (precomputed) and `type` for downstream code to re-evaluate or regenerate points.

Example latexEquation entry:
```js
{ type: 'quadratic', formula: 'y = 2(x - 1)^2 + 0.5', domain: { start: '0.00', end: '10.00' }, rpn: [...] }
```

---

## 6) Recommended API/Template for a new approximator
Use this template/contract to implement a new approximator module in `js/approximator/`.

- File: `js/approximator/<kind>/<Name>Approximator.js`
- Export a class with these methods at minimum:
  - `constructor(options = {})` — set defaults
  - `approximate(points, domain, options = {})` — main entry; must return the structured result object described above
  - `setOptions(options)` — optionally allow updates

Basic skeleton (pseudo-JS):
```js
export class FooApproximator {
  constructor(options = {}) {
    this.options = { /* defaults */ };
  }

  approximate(points, domain = {}, options = {}) {
    if (!Array.isArray(points) || points.length < 2) return { success: false, message: 'Needs >=2 points', originalPoints: points, latexEquations: [] };

    // 1) preprocess (filter near-duplicates, normalize if needed)
    // 2) compute model (least-squares / greedy / heuristic)
    // 3) produce output fields: knots, preKnots, bezierSegments, svgPath, latexEquations

    return {
      success: true,
      type: 'foo',
      originalPoints: points,
      knots, preKnots, bezierSegments, svgPath, latexEquations
    };
  }

  setOptions(opts) { this.options = {...this.options, ...opts}; }
}
```

---

## 7) Implementation checklist for a new approximator
1. Decide output `type` string and the minimum return fields.
2. Accept points as `[[x,y], ...]` and validate. Prefer graph coordinates.
3. Provide domain-aware processing if needed (domain param).
4. Produce `latexEquations` entries (add `rpn` if convenient).
5. Implement a simple error/quality metric and return `success:false` for invalid cases.
6. Integrate with `ApproximatorManager` by importing and exposing your class there if you want UI control.
7. Add tests/manual verification: round-trip save/load of json, visual inspection of `svgPath`, and compare `latexEquations`.

---

## 8) Examples: mapping to existing classes
- `LinearFunctionApproximator` — input: points array; output: `type: 'linear'|'vertical'|'constant'`, `knots` = endpoints, `latexEquations` with `formula`.
- `PiecewiseLinearApproximator` — uses Douglas–Peucker, invokes `LinearFunctionApproximator` per segment; outputs `segments`, `knots`, `latexEquations`, `svgPath`.
- `QuadraticBSplineCurveApproximator` — wrapper around `BSplineApproximator`:
  - Uses internal normalization and `BSplineApproximator` for heavy work.
  - Exposes `approximate(points, domain, options)` returning `preKnots`, `knots`, `bezierSegments`, `splineCoefficients`, `latexEquations`, and `svgPath`.

---

## 9) Notes on `preKnots` convention (BSpline)
- `preKnots`: array of objects:
  ```js
  { knot: <number> /* normalized 0..1 or sentinel like -0.2/1.1 for dummies */, priority: <int>, diff: <number> }
  ```
- `priority` is used to pick which inner knots to keep for a given knot count. Outer dummy knots (<=0 or >=1) usually carry `priority < 0` and are always kept.
- `diff` often stores curvature-related heuristics (e.g., abs difference of second derivatives across segments).

---

## 10) Where to add the new file
- Place new approximator files under `js/approximator/<category>/` and name the file `<Name>Approximator.js`.
- Add an import and reference in `js/approximator/ApproximatorManager.js` if you want it to be selectable in the UI.

---

## 11) Quick checklist for reviewers
- Does `approximate()` validate inputs and return `{success:false}` on invalid input? Yes/No
- Does it produce `latexEquations`? (used by save/load and UI)
- Are `svgPath` and drawing primitives present if the algorithm produces a drawable path?
- Did you add `rpn` tokens if the formula will be evaluated later?

---

This document should give you a clear reference to implement new approximators that fit the current codebase. If you want, I can also scaffold a new approximator file (template implementation) inside `js/approximator/<your-choice>/` — tell me the kind of approximation you want to add and I will generate the starter file and wire it to `ApproximatorManager.js`.
