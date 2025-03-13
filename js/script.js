// グローバル変数
let isDrawing = false;
let svg, g;
let currentPath;
let currentColor = '#000000';
let prevColor = '#000000';
let currentSize = 2;
let prevSize = 2;
let curves = [];
let undoStack = [];
let redoStack = [];
let currentTool = 'pen';
let zoom = d3.zoom()
let colorPickerContainer = null;
let initialTransform = d3.zoomIdentity;
let nextCurveId = 0;
let selectCurveId = null;

let currentZoomStatus = d3.zoomIdentity;
let currentCanvasStatus = {
    'x0':-10, 'x1':10,
    'y0':-10, 'y1':10
}
//  ┌───y1──┐
//  │   ↑   │
// x0 <─┼─> x1
//  │   ↓   │
//  └───y0──┘
const container = d3.select('.container');
const canvasContainer = d3.select('#canvas-container');
const sidebar = d3.select('#sidebar');

// D3.jsの設定
function setupD3() {
    const width = canvasContainer.node().getBoundingClientRect().width;
    const height = canvasContainer.node().getBoundingClientRect().height;

    currentCanvasStatus.y0 = -10 * height/width;
    currentCanvasStatus.y1 =  10 * height/width;

    svg = d3.select('#canvas-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);

    g = svg.append("g").attr("id", "graph");

    zoom.scaleExtent([1/16, 16])
        .translateExtent([
            [-10000, -10000],
            [10000, 10000]
        ])
        .filter(function() {return (currentTool === 'cursor');})
        .on('zoom', (event) => {
            // 線の太さの変更(ズームしてもかわらない)
            // var s = 2/event.transform.k
            // d3.select("#graph").selectAll("g")
            //     .select("path").style("stroke-width", `${s}`)

            g.attr("transform", event.transform);
            gXM.call(xMinor.scale(event.transform.rescaleX(xScale)));
            gYM.call(yMinor.scale(event.transform.rescaleY(yScale)));
            gXA.call(xAxis.scale(event.transform.rescaleX(xScale)));
            gYA.call(yAxis.scale(event.transform.rescaleY(yScale)));

            // zoom情報を記憶
            setCanvasStatus(event.transform, width, height);
        });

    svg.call(zoom);


    // 初期トランスフォームを保存
    initialTransform = d3.zoomIdentity;

    // ホームボタンのイベントリスナー
    d3.select('#home-button').on('click', resetView);
}

// 現在のzoomの状態を得る(キャンバスの左右端を取得) TEST
function setCanvasStatus(zoomStatus, w, h) {

    currentZoomStatus = zoomStatus; // 現在のzoom状態をセーブ
    let x = currentZoomStatus.x; // x方向の移動量
    let y = currentZoomStatus.y; // y方向の移動量
    let k = currentZoomStatus.k; // スケール
    let lx = 10; // x軸の幅
    let ly = lx * h / w; // y軸の幅

    currentCanvasStatus = {
        'x0' : -lx*(2*x/(w*k) + 1),
        'x1' : -lx*(2*x/(w*k) + 1) + 2*lx/k,
        'y0' : -ly*(2*y/(h*k) + 1),
        'y1' : -ly*(2*y/(h*k) + 1) + 2*ly/k
    }
}

// スケールと軸の更新
function updateScalesAndAxes(w, h) {
    let aspectRatio = h / w;

    xScale = d3.scaleLinear().domain([currentCanvasStatus.x0, currentCanvasStatus.x1]).range([0, w]);
    yScale = d3.scaleLinear().domain([currentCanvasStatus.y0, currentCanvasStatus.y1]).range([h, 0]);

    xMinor = d3.axisBottom(xScale).ticks(16).tickSize(h-15).tickPadding(5);
    yMinor = d3.axisLeft(yScale).ticks(16 * aspectRatio).tickSize(20-w).tickPadding(5-w);
    xAxis = d3.axisBottom(xScale).ticks(4).tickSize(h-15).tickPadding(5);
    yAxis = d3.axisLeft(yScale).ticks(4 * aspectRatio).tickSize(20-w).tickPadding(5-w);
}

// グリッドの描画
function drawGrid() {
    svg.selectAll("#axis").remove();

    gXM = svg.insert("g", "#graph").attr("class", "minor").attr("id", "axis").call(xMinor);
    gYM = svg.insert("g", "#graph").attr("class", "minor").attr("id", "axis").call(yMinor);
    gXA = svg.insert("g", "#graph").attr("class", "axis").attr("id", "axis").call(xAxis);
    gYA = svg.insert("g", "#graph").attr("class", "axis").attr("id", "axis").call(yAxis);
}

// キャンバスのリサイズ
function resizeCanvas() {
    const width = canvasContainer.node().getBoundingClientRect().width;
    const height = canvasContainer.node().getBoundingClientRect().height;
    svg.attr('width', width)
       .attr('height', height)
       .attr('viewBox', `0 0 ${width} ${height}`);
    
    setCanvasStatus(currentZoomStatus, width, height);

    updateScalesAndAxes(width, height);
    drawGrid();
}

// イベントリスナーの設定
function setupEventListeners() {           
    svg.on('mousedown touchstart', startDrawing)
       .on('mousemove touchmove', draw)
       .on('mouseup touchend', endDrawing);

    d3.select('#pen-tool').on('click', () => setActiveTool('pen'));
    d3.select('#cursor-tool').on('click', () => setActiveTool('cursor'));
    d3.select('#clear-canvas').on('click', clearCanvas);
    d3.select('#undo').on('click', undo);
    d3.select('#redo').on('click', redo);

    d3.select('#color').on('blur', updateColorList);
    d3.select('#color').on('input', updateColor);
    d3.select('#size').on('mouseup', updateSizeList);
    d3.select('#size').on('input', updateSize);

    window.addEventListener('resize', handleResize);

    d3.select("#curve-list").on('click', e => {
        const clickedElmClass = e.target.classList;
        if (e.target.closest('.curve-item')) return;

        selectCurveId = null;
        d3.selectAll(".curve-item").classed('selected', false);
        delEmpasisCurve();
        deselectCurve();
        console.log("reset")

        d3.select("#color").property('value', prevColor);
        d3.select("#size").property('value', prevSize);
    });

    const drag = d3.drag()
        .on('drag', function(event) {
            if (window.innerWidth <= 610) return;
                
            containerWidth = container.node().getBoundingClientRect().width;
            sidebarWidth = Math.max(300, Math.min(event.x, containerWidth - 300 - 10));
            canvasWidth = containerWidth - sidebarWidth - 10;
            
            sidebar.style('flex', `0 0 ${sidebarWidth}px`);
            canvasContainer.style('flex', `0 0 ${canvasWidth}px`);
            // sidebar.style.flex = '1'
            resizeCanvas();
        });
    d3.select('#divider').call(drag);

}

// アクティブツールの設定
function setActiveTool(tool) {
    currentTool = tool;
    d3.selectAll('.tool-button').classed('active', false);
    d3.select('#'+tool+'-tool').classed('active', true);
    svg.style('cursor', tool === 'pen' ? 'crosshair' : 'move');
}

// 描画開始
function startDrawing(event) {
    if (currentTool === 'cursor') return;
    event.preventDefault();
    isDrawing = true;
    const [x, y] = d3.pointer(event, g.node());
    currentPath = g.append('g').attr('id', `graph-${nextCurveId}`)
        .append('path')
        .attr('fill', 'none')
        .attr('stroke', currentColor)
        .attr('stroke-width', currentSize)
        .attr('stroke-linecap', 'round')
        .attr('d', `M${x},${y}`);
}

// 描画中
function draw(event) {
    if (currentTool === 'cursor' || !isDrawing) return;
    event.preventDefault();
    const [x, y] = d3.pointer(event, g.node());
    const d = currentPath.attr('d');
    currentPath.attr('d', `${d} L${x},${y}`);
}

// 描画終了
function endDrawing() {
    if (currentTool === 'cursor' || !isDrawing) return;
    isDrawing = false;
    const curveId = nextCurveId++;
    curves.push({
        id: curveId,
        path: currentPath,
        color: currentColor,
        size: currentSize,
        hidden: true
    });
    addCurveToList(curveId, currentColor, currentSize, true);
    undoStack.push({ type: 'add', curve: curves[curves.length - 1] });
    redoStack = [];
}

// 色のリストの更新
function updateColorList() {
    console.log("updateColor");
    currentColor = this.value;
    if(selectCurveId == null) prevColor = this.value;
    else if(curves[selectCurveId].color != currentColor) {
        const oldColor = curves[selectCurveId].color;
        curves[selectCurveId].color = currentColor;
        undoStack.push({ type: 'color', id: selectCurveId, oldColor: oldColor, newColor: currentColor });
        redoStack = [];
    }
}

// 色の更新
function updateColor() {
    if(selectCurveId !== null) {
        curves[selectCurveId].path.attr('stroke', this.value);
        d3.select(`.color-icon[data-id='${selectCurveId}']`).style('background-color', this.value);
        updateEmpasisCurveColor(this.value)
    }
}

// 線の太さのリストの更新
function updateSizeList() {
    console.log("updateSize");
    currentSize = Number(this.value);
    if(selectCurveId == null) prevSize = Number(this.value);
    else if(curves[selectCurveId].size != currentSize) {
        const oldSize = curves[selectCurveId].size;
        curves[selectCurveId].size = currentSize;
        undoStack.push({ type: 'size', id: selectCurveId, oldSize: oldSize, newSize: currentSize });
        redoStack = [];
    }
}

// 線の太さの更新
function updateSize() {
    if(selectCurveId !== null) {
        curves[selectCurveId].path.attr('stroke-width', this.value);
        updateEmpasisCurveSize(Number(this.value))
    }
}

// キャンバスのクリア
function clearCanvas() {
    undoStack.push({ type: 'clear', curves: [...curves] });
    redoStack = [];
    g.selectAll('*').remove();
    curves = [];
    updateCurveList();
    nextCurveId = 0;
}

// 曲線リストに追加
function addCurveToList(id, color, size, hidden) {
    const curveList = d3.select('#curve-list');
    const curveItem = curveList.append('div')
        .attr('class', 'curve-item')
        .attr('draggable', true)
        .html(`
            <span class="curve-id">${id}</span>
            <div class="curve-setting">
                <div class="color-icon" style="background-color: ${color};" data-id="${id}"></div>
                <button class="details-dropdown ${hidden ? "" : "rotated"}" data-id="${id}">
                    <i class="fas fa-chevron-up none-event"></i>
                </button>
                <button class="delete-btn" data-id="${id}">
                    <i class="fas fa-times none-event"></i>
                </button>
            </div>
            <div class="curve-details ${hidden ? "hidden" : ""}">
                <p>線の太さ: 2px</p>
                <p>曲線の情報: ベジェ曲線 (x1=0.25, y1=0.1, x2=0.25, y2=1)</p>
            </div>
        `);

    // イベントリスナーの追加
    curveItem.on('click', function(event) {
        const clickedElmClass = event.target.classList;
        if (clickedElmClass.contains('color-icon') ||
            clickedElmClass.contains('details-dropdown') ||
            clickedElmClass.contains('delete-btn')) {
            return;
        }

        selectCurve(d3.select(this), id);
    });
    curveItem.select('.details-dropdown').on('click', showDetails);
    curveItem.select('.delete-btn').on('click', deleteCurve);
    curveItem.on('dragstart', dragStart);
    curveItem.on('dragover', dragOver);
    curveItem.on('drop', drop);
    curveItem.on('dragend', dragEnd);
}

function selectCurve(curveItem, id) {
    d3.selectAll('.curve-item').classed('selected', false);
    delEmpasisCurve();

    if (selectCurveId === id) {
        deselectCurve();
    } else {
        curveItem.classed('selected', true);
        emphasisCurve(id);

        prevColor = currentColor;
        prevSize = currentSize;
        d3.select("#color").property('value', curves[id].color);
        d3.select("#size").property('value', curves[id].size);
        
        selectCurveId = id;
    }
    console.log("select : ", selectCurveId);
}

function deselectCurve() {
    currentColor = prevColor;
    currentSize = prevSize;
    d3.select("#color").property('value', prevColor);
    d3.select("#size").property('value', prevSize);
    selectCurveId = null;
}

function showDetails(event) {
    const id = parseInt(event.target.dataset.id);
    const curveDetails = d3.select(event.target.closest('.curve-item')).select('.curve-details');

    curves[id].hidden = !curveDetails.classed('hidden');
    curveDetails.classed('hidden', !curveDetails.classed('hidden'));

    d3.select(event.target).classed('rotated', !d3.select(event.target).classed('rotated'));
}

// 曲線を削除
function deleteCurve(event) {
    const id = parseInt(event.target.dataset.id);
    undoStack.push({ type: 'delete', curve: curves[id], index: id, nextCurveId: nextCurveId });
    redoStack = [];
    curves[id].path.remove();
    curves.splice(id, 1);
    
    // IDを再割り当て
    curves.forEach((curve, index) => {
        if (curve) {
            curve.id = index;
        }
    });
    
    nextCurveId = curves.length;
    
    updateCurveList();
    redrawCurves();
    deselectCurve();
}

// updateCurveList 関数
function updateCurveList() {
    const curveList = document.getElementById('curve-list');
    curveList.innerHTML = '';
    curves.forEach((curve, index) => {
        if (curve) {
            addCurveToList(index, curve.color, curve.size, curve.hidden);
        }
    });
}

// 選択したidの曲線を強調する
function emphasisCurve(id) {
    g.append('path')
        .attr('fill', 'none')
        .attr('stroke', curves[id].color)
        .attr('stroke-width', curves[id].size + 6)
        .attr('stroke-opacity', '0.4')
        .attr('stroke-linecap', 'round')
        .attr('d', curves[id].path.attr('d'))
        .attr("id", "emphasisCurve");
}

// 選択したidの曲線の色の更新
function updateEmpasisCurveColor(color) {
    d3.select('#emphasisCurve').attr('stroke', color)
}

// 選択したidの曲線の線の太さの更新
function updateEmpasisCurveSize(size) {
    d3.select('#emphasisCurve').attr('stroke-width', size + 6)
}

// 強調した曲線を解除する
function delEmpasisCurve() {
    d3.selectAll("#emphasisCurve").remove();
}

function handleResize() {
    if (window.innerWidth > 610) {
        containerWidth = container.node().getBoundingClientRect().width;
        sidebarWidth = sidebar.node().getBoundingClientRect().width; // sidebar幅は固定でサイズ変更
        canvasWidth = containerWidth - sidebarWidth - 10;
        if(canvasWidth < 310) { // 最小幅310pxより小さくなるならcanvas幅を310pxで固定し、sidebar幅を変更
            canvasWidth = 310;
            sidebarWidth = containerWidth - canvasWidth - 10;
        }
    
        sidebar.style('flex', `0 0 ${sidebarWidth}px`);
        canvasContainer.style('flex', `0 0 ${canvasWidth}px`);
    } else {
        sidebar.style('flex', '0 0 auto');
        canvasContainer.style('flex', '0 0 auto');
    }
    resizeCanvas();
}

// ドラッグ開始
function dragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.querySelector('.curve-id').textContent);
    e.target.classList.add('dragging');
    selectCurveId = null;
}

// ドラッグ中
function dragOver(e) {
    e.preventDefault();
}

// ドロップ
function drop(e) {
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData('text'));
    const targetId = parseInt(e.target.closest('.curve-item').querySelector('.curve-id').textContent);
    const targetItem = e.target.closest('.curve-item');
    if (targetItem) {
        const targetId = parseInt(targetItem.querySelector('.curve-id').textContent);
        if (draggedId !== targetId) {
            reorderCurves(draggedId, targetId);
        }
    }
}

// ドラッグ終了
function dragEnd(e) {
    e.target.classList.remove('dragging');
}

// 曲線の描画順番変更
function reorderCurves(fromId, toId) {
    const curve = curves[fromId];
    curves.splice(fromId, 1);
    curves.splice(toId, 0, curve);
    
    // idを昇順に更新
    curves.forEach((curve, index) => {
        if (curve) {
            curve.id = index;
        }
    });

    updateCurveList();
    redrawCurves();
    undoStack.push({ type: 'reorder', fromId: fromId, toId: toId });
    redoStack = [];
}

// 曲線の再描画
function redrawCurves() {
    g.selectAll('*').remove();
    curves.forEach(curve => {
        if (curve) {
            curve.path = g.append('path')
                .attr('fill', 'none')
                .attr('stroke', curve.color)
                .attr('stroke-width', curve.size)
                .attr('stroke-linecap', 'round')
                .attr('d', curve.path.attr('d'));
        }
    });
}

// ビューをリセット
function resetView() {
    svg.transition().duration(750).call(zoom.transform, initialTransform);
}

// 元に戻す
function undo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();
    redoStack.push(action);

    switch (action.type) {
        case 'add':
            action.curve.path.remove();
            curves.splice(action.curve.id, 1);
            nextCurveId--; // nextCurveIdを減少
            console.log(action.curve.id, "add");
            break;
        case 'delete':
            curves.splice(action.index, 0, action.curve);
            g.node().appendChild(action.curve.path.node());
            nextCurveId = action.nextCurveId; // 保存されたnextCurveIdを復元
            console.log(action.index, "delete");
            break;
        case 'color':
            curves[action.id].color = action.oldColor;
            curves[action.id].path.attr('stroke', action.oldColor);
            console.log(action.id, "color");
            break;
        case 'size':
            curves[action.id].size = action.oldSize;
            curves[action.id].path.attr('stroke-width', action.oldSize);
            console.log(action.id, "size");
            break;
        case 'clear':
            curves = action.curves;
            redrawCurves();
            console.log("clear");
            break;
        case 'reorder':
            reorderCurves(action.toId, action.fromId);
            undoStack.pop(); // Remove the reorder action added by reorderCurves
            console.log("reorder");
            break;
    }
    
    // IDを再割り当て
    curves.forEach((curve, index) => {
        if (curve) {
            curve.id = index;
        }
    });
    
    updateCurveList();
    redrawCurves();
}

// やり直し
function redo() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();
    undoStack.push(action);

    switch (action.type) {
        case 'add':
            curves.splice(action.curve.id, 0, action.curve);
            g.node().appendChild(action.curve.path.node());
            nextCurveId++; // nextCurveIdを増加
            break;
        case 'delete':
            curves.splice(action.index, 1);
            action.curve.path.remove();
            nextCurveId = curves.length; // nextCurveIdを更新
            break;
        case 'color':
            curves[action.id].color = action.newColor;
            curves[action.id].path.attr('stroke', action.newColor);
            break;
        case 'size':
            curves[action.id].size = action.newSize;
            curves[action.id].path.attr('stroke-width', action.newSize);
            break;
        case 'clear':
            g.selectAll('*').remove();
            curves = [];
            break;
        case 'reorder':
            reorderCurves(action.fromId, action.toId);
            undoStack.pop();
            break;
    }
    
    // IDを再割り当て
    curves.forEach((curve, index) => {
        if (curve) {
            curve.id = index;
        }
    });
    
    updateCurveList();
    redrawCurves();
}

// 初期化
function init() {
    try {
        setupD3();
        setupEventListeners();
        resizeCanvas(); // 初期サイズ調整
        handleResize();
        setActiveTool('pen')
    } catch (error) {
        console.error('初期化中にエラーが発生しました:', error);
    }
}

// アプリケーションの起動
init();