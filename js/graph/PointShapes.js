/**
 * PointShapes.js
 * グラフ上の点の形状を定義するユーティリティ
 */

/**
 * getShapeGenerator
 * @param {string} shapeType - 形状タイプ
 * @returns {Function} 形状生成関数
 */
export function getShapeGenerator(shapeType = 'circle') {
    const generators = {
        'circle': (size) => ({
            element: 'circle',
            attributes: {
                'r': size / 2,
                'cx': 0,
                'cy': 0
            },
            properties: {
                fill: 'black',
                stroke: 'none'
            }
        }),

        'hollowCircle': (size) => ({
            element: 'circle',
            attributes: {
                'r': size / 2,
                'cx': 0,
                'cy': 0
            },
            properties: {
                fill: 'white',
                stroke: 'black',
                strokeWidth: size * 0.2
            }
        }),

        'square': (size) => ({
            element: 'rect',
            attributes: {
                'x': -size / 2,
                'y': -size / 2,
                'width': size,
                'height': size
            },
            properties: {
                fill: '#000',
                stroke: 'none'
            }
        }),

        'triangle': (size) => ({
            element: 'polygon',
            attributes: {
                'points': `0,${size/2} ${-size/2},${-size/2} ${size/2},${-size/2}`
            },
            properties: {
                fill: '#000',
                stroke: 'none'
            }
        }),

        'diamond': (size) => ({
            element: 'polygon',
            attributes: {
                'points': `0,${-size/2} ${size/2},0 0,${size/2} ${-size/2},0`
            },
            properties: {
                fill: '#000',
                stroke: 'none'
            }
        }),

        'cross': (size) => createCross(size),

        'plus': (size) => createPlus(size)
    };

    return generators[shapeType] || generators['circle'];
}

function createCross(size) {
    const length = size * 0.4;
    return {
        element: 'path',
        attributes: {
            'd': `M ${-length},${-length} L ${length},${length} M ${length},${-length} L ${-length},${crossLength}`,
            'stroke-width': size * 0.2,
            'fill': 'none',
            'stroke-linecap': 'round'
        },
        properties: {
            fill: 'none',
            stroke: '#000000',
            size: size,
            strokeWidth: size * 0.2
        }
    };
}

function createPlus(size) {
    const length = size * 0.4;
    return {
        element: 'path',
        attributes: {
            'd': `M ${-length},0 L ${length},0 M 0,${-length} L 0,${length}`,
            'stroke-width': size * 0.2,
            'fill': 'none',
            'stroke-linecap': 'round'
        },
        properties: {
            fill: 'none',
            stroke: '#000000',
            size: size,
            strokeWidth: size * 0.2
        }
    };
}
