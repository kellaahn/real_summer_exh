import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const videoElement = document.getElementById('webcam');
const sphereCanvas = document.getElementById('eye-sphere-canvas');
const charGridElement = document.querySelector('.char-grid');
const rectGridElement = document.querySelector('.rect-grid');
const questionElement = document.querySelector('.question');

// .char-grid: 촬영 화면 위에 뜨는 글자 칸 그리드. 숫자 네 개만 바꾸면
// 칸 크기(가로/세로 따로)와 가로/세로 칸 수가 즉시 반영된다.
// 칸 크기는 px 고정값 대신 vh(화면 높이 비율)로 둬서, 맥북(14인치)이든
// 아이맥(27인치)이든 화면이 바뀌어도 항상 같은 비율로 보이게 한다.
// 기준: 맥북 14인치 기본 해상도 1512x982에서 105px였던 칸 크기 = 105/982*100vh.
const CHAR_GRID_COLS = 13; // <- 가로 칸 수
const CHAR_GRID_ROWS = 7; // <- 세로 칸 수
const CHAR_GRID_CELL_WIDTH_VH = 105 / 982 * 100; // <- 칸 한 개의 너비(vh)
const CHAR_GRID_CELL_HEIGHT_VH = 105 / 982 * 100; // <- 칸 한 개의 높이(vh)

function buildCharGrid() {
    if (!charGridElement) return;

    // table-layout:fixed는 셀 하나하나의 width/height가 아니라 테이블
    // 전체 크기를 열/행 개수로 나눠서 칸 크기를 정하므로, 전체 크기를
    // 여기서 직접 계산해서 지정해야 CHAR_GRID_CELL_WIDTH_VH/HEIGHT_VH가 먹힌다.
    charGridElement.style.width = `${CHAR_GRID_COLS * CHAR_GRID_CELL_WIDTH_VH}vh`;
    charGridElement.style.height = `${CHAR_GRID_ROWS * CHAR_GRID_CELL_HEIGHT_VH}vh`;

    const tbody = charGridElement.querySelector('tbody');
    tbody.innerHTML = '';

    for (let r = 0; r < CHAR_GRID_ROWS; r++) {
        const row = document.createElement('tr');
        for (let c = 0; c < CHAR_GRID_COLS; c++) {
            const cell = document.createElement('td');
            cell.className = 'char-cell';
            cell.style.width = `${CHAR_GRID_CELL_WIDTH_VH}vh`;
            cell.style.height = `${CHAR_GRID_CELL_HEIGHT_VH}vh`;

            // 글자는 이 span(position:absolute)에 넣는다. 흐름에서 빠져 있어서
            // 글자 크기/내용이 td(칸) 크기에 전혀 영향을 주지 않고, 칸 정중앙에
            // 위치만 잡힌다.
            const textEl = document.createElement('span');
            textEl.className = 'char-cell-text';
            cell.appendChild(textEl);

            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
}

buildCharGrid();

// .char-grid와 정확히 같은 칸 크기/개수(CHAR_GRID_COLS/ROWS/CELL_WIDTH/HEIGHT)로
// 사각형 레이어를 만든다. CSS grid를 써서 칸마다 <div>를 하나씩 두고,
// setRectGridCell로 각 칸의 배경색을 개별로 정할 수 있다.
function buildRectGrid() {
    if (!rectGridElement) return;

    // buildCharGrid와 완전히 같은 계산식/같은 표 구조(<table>+border-collapse)라서
    // 크기가 항상 표와 정확히 겹친다.
    rectGridElement.style.width = `${CHAR_GRID_COLS * CHAR_GRID_CELL_WIDTH_VH}vh`;
    rectGridElement.style.height = `${CHAR_GRID_ROWS * CHAR_GRID_CELL_HEIGHT_VH}vh`;

    const tbody = rectGridElement.querySelector('tbody');
    tbody.innerHTML = '';

    for (let r = 0; r < CHAR_GRID_ROWS; r++) {
        const row = document.createElement('tr');
        for (let c = 0; c < CHAR_GRID_COLS; c++) {
            const cell = document.createElement('td');
            cell.className = 'rect-cell';
            cell.style.width = `${CHAR_GRID_CELL_WIDTH_VH}vh`;
            cell.style.height = `${CHAR_GRID_CELL_HEIGHT_VH}vh`;
            // 드래그 중에 이 칸이 "정답 칸"인지 확인할 때 쓴다.
            cell.dataset.row = r;
            cell.dataset.col = c;
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
}

buildRectGrid();

// .question(그 안의 .ques_1 검은 박스가 "낱말찾기" 배경)의 왼쪽 경계를
// .char-grid(표)의 왼쪽 경계와 맞춘다. .ques_1이 .question의 첫 글자이자
// 첫 자식이라, .question의 left만 맞추면 검은 박스 왼쪽 경계도 같이 맞는다.
// CSS의 %/고정값 대신 실제 렌더링된 위치(getBoundingClientRect)를 그대로
// 읽어와서 맞추므로, 칸 크기/개수나 창 크기가 바뀌어도 항상 정확히 맞는다.
function alignQuestionWithCharGrid() {
    if (!questionElement || !charGridElement) return;
    questionElement.style.left = `${charGridElement.getBoundingClientRect().left}px`;
}

alignQuestionWithCharGrid();
window.addEventListener('resize', alignQuestionWithCharGrid);

// 사각형 칸을 마우스로 누른 채 드래그하면, 시작 칸에서 처음 움직인 방향
// (위/아래/왼쪽/오른쪽 중 하나, 처음 움직인 축으로 고정)으로 정확히 3칸을
// 선택한 것으로 본다. 그 3칸이 실제로 "고등어"인지는 상관없이 — 드래그가
// 지나간 칸에는 항상 rgb(1,161,234)에서 흰색으로 이어지는 그라데이션이
// 글자 뒤(이 사각형 레이어)에 이어 붙여 그려진다. 다만 그 3칸이 정확히
// "고등어" 정답 세트(wordOccurrenceGroups, 아래쪽에서 findWordOccurrences로
// 계산해서 채워 넣는다)와 순서까지 일치하면, 그 위에 투명으로 덮어써서
// 정답을 찾았다는 걸 보여준다.
// td 하나하나에 리스너를 달지 않고 rectGridElement에서 위임(delegate)해서
// 이벤트가 발생한 지점이 속한 .rect-cell을 찾는다.
// 마우스를 누른 지점에서 이만큼(px) 움직여야 진짜 드래그로 인정한다.
// 숫자만 바꾸면 감도(드래그 시작 거리)가 즉시 반영된다. 작을수록 살짝만
// 움직여도 바로 드래그로 인식되고(예민), 클수록 확실히 끌어야 인식된다(둔감).
const DRAG_START_THRESHOLD_PX = 12;

// 드래그 선택 그라데이션의 시작색(진한 파랑)과 끝색(흰색). 숫자만 바꾸면
// 즉시 반영된다.
const SELECTION_GRADIENT_START_RGB = [1, 161, 234];
const SELECTION_GRADIENT_END_RGB = [255, 255, 255];
// 각 방향으로 드래그할 때 물리적으로(화면상) 어느 쪽을 향해 그라데이션이
// 진행돼야 하는지를 CSS linear-gradient 방향 키워드로 매핑한 것.
const DIRECTION_TO_CSS_ANGLE = { right: 'to right', left: 'to left', down: 'to bottom', up: 'to top' };

// 드래그를 놓은 뒤(mouseup) 그라데이션이 사라지기까지 기다리는 시간(ms).
// 숫자만 바꾸면 즉시 반영된다. 단, 정답(고등어)으로 확인돼서 이미 투명하게
// 바뀐 칸에는 적용되지 않는다 — 그건 계속 투명 상태로 남는다.
const SELECTION_GRADIENT_FADE_DELAY_MS = 500;

// 정답(고등어)이 확인된 시점부터 실제로 투명하게 바뀌기까지 기다리는 시간(ms).
// 숫자만 바꾸면 즉시 반영된다. 0으로 두면 확인되자마자 바로 투명해진다.
const SOLVED_REVEAL_DELAY_MS = 500;

let isDraggingRectCell = false;
let dragPath = []; // 이번 드래그로 확정된 칸 좌표 배열(["row,col", ...]) — 방향이 정해지는 순간 한 번에 계산됨
let dragDirection = null; // 'right' | 'left' | 'down' | 'up'
let dragProgressIndex = 0; // dragPath에서 실제로 마우스가 지나가서(칠해진) 칸 수
let dragWasSolved = false; // 이번 드래그가 "고등어" 정답과 일치해서 이미 투명 처리됐는지
let wordOccurrenceGroups = []; // 각 원소가 "고등어" 순서대로 정렬된 칸 배열
let pendingDrag = null; // { startX, startY, row, col } — 문턱값을 넘기 전까지의 대기 상태

function cellKey(cell) {
    return `${cell.dataset.row},${cell.dataset.col}`;
}

function getRectCellElement(row, col) {
    const rowEl = rectGridElement.querySelector('tbody').children[row];
    if (!rowEl) return null;
    return rowEl.children[col] || null;
}

function lerpRgb(a, b, t) {
    return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// (row, col)에서 시작해서 direction 방향으로 "고등어" 길이(targetWordLength)만큼
// 이어지는 칸 좌표 배열을 만든다. 격자 밖으로 나가면 거기서 멈춘다(그만큼 짧게
// 나올 수 있다 — 예: 가장자리에서 드래그를 시작한 경우).
function buildDragPath(row, col, direction) {
    const { dr, dc } = DIRECTION_STEPS[direction];
    const path = [];
    for (let i = 0; i < targetWordLength; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r < 0 || r >= CHAR_GRID_ROWS || c < 0 || c >= CHAR_GRID_COLS) break;
        path.push(`${r},${c}`);
    }
    return path;
}

// dragPath의 index번째 칸에, 전체 그라데이션(시작 칸 = 진한 파랑 → 마지막 칸 = 흰색)
// 중 그 칸이 차지하는 구간만 잘라 그려 넣는다. 칸마다 이렇게 이어 붙이면 옆 칸과
// 자연스럽게 하나로 이어진 그라데이션처럼 보인다.
function paintDragCell(index) {
    const [row, col] = dragPath[index].split(',');
    const cellEl = getRectCellElement(row, col);
    if (!cellEl) return;
    // 이미 정답으로 확인돼서 투명해진 칸은 그라데이션으로 덮어쓰지 않는다.
    if (cellEl.style.backgroundColor === 'transparent') return;
    const from = lerpRgb(SELECTION_GRADIENT_START_RGB, SELECTION_GRADIENT_END_RGB, index / targetWordLength);
    const to = lerpRgb(SELECTION_GRADIENT_START_RGB, SELECTION_GRADIENT_END_RGB, (index + 1) / targetWordLength);
    cellEl.style.backgroundImage = `linear-gradient(${DIRECTION_TO_CSS_ANGLE[dragDirection]}, rgb(${from.join(',')}), rgb(${to.join(',')}))`;
}

// dragPath가 실제 "고등어" 정답 세트와 순서까지 정확히 일치하는지 확인한다.
function dragPathMatchesWord() {
    return wordOccurrenceGroups.some((seq) => seq.length === dragPath.length && seq.every((key, i) => key === dragPath[i]));
}

if (rectGridElement) {
    rectGridElement.addEventListener('mousedown', (e) => {
        const cell = e.target.closest('.rect-cell');
        if (!cell) return;
        // 여기서는 아직 드래그를 시작하지 않는다. mousemove에서 문턱값을
        // 넘는 순간에야 방향이 정해지면서 실제로 드래그가 시작된다.
        pendingDrag = { startX: e.clientX, startY: e.clientY, row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    }, { passive: true });

    // passive:true로 등록하면 브라우저가 "이 리스너는 preventDefault를 호출하지
    // 않는다"는 걸 미리 알아서, 스크롤/입력 처리를 리스너 실행과 동기적으로
    // 기다리지 않고 더 빨리 넘길 수 있다(실제로 여기서 preventDefault를 쓰지 않으므로 안전).
    window.addEventListener('mousemove', (e) => {
        if (!pendingDrag || isDraggingRectCell) return;
        const dx = e.clientX - pendingDrag.startX;
        const dy = e.clientY - pendingDrag.startY;
        if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) return;

        // 더 많이 움직인 축을 따라 방향을 하나로 고정한다(가로 vs 세로).
        dragDirection = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up');

        isDraggingRectCell = true;
        dragPath = buildDragPath(pendingDrag.row, pendingDrag.col, dragDirection);
        dragProgressIndex = 0;
        if (dragPath.length > 0) {
            paintDragCell(0);
            dragProgressIndex = 1;
        }
    }, { passive: true });

    rectGridElement.addEventListener('mouseover', (e) => {
        if (!isDraggingRectCell || dragProgressIndex >= dragPath.length) return;
        const cell = e.target.closest('.rect-cell');
        if (!cell || cellKey(cell) !== dragPath[dragProgressIndex]) return;

        paintDragCell(dragProgressIndex);
        dragProgressIndex++;

        // 3칸을 다 지나갔고, 그 3칸이 실제 "고등어" 정답 세트와 일치하면
        // SOLVED_REVEAL_DELAY_MS 뒤에 그라데이션 위에 투명을 덮어써서 정답임을
        // 보여준다. dragWasSolved는 지금 바로 켜서, mouseup의 fade 타이머가
        // 이 칸들을 (틀린 것으로 착각해서) 지우지 않게 막는다.
        if (dragProgressIndex === targetWordLength && dragPathMatchesWord()) {
            dragWasSolved = true;
            const solvedPath = dragPath;
            setTimeout(() => {
                solvedPath.forEach((key) => {
                    const [row, col] = key.split(',');
                    const cellEl = getRectCellElement(row, col);
                    if (!cellEl) return;
                    cellEl.style.backgroundImage = '';
                    cellEl.style.backgroundColor = 'transparent';
                });
            }, SOLVED_REVEAL_DELAY_MS);
        }
    }, { passive: true });

    // mouseup은 그리드 밖에서 손을 놓을 수도 있으니 window 전체에서 받는다.
    window.addEventListener('mouseup', () => {
        // 정답이 아니었다면, 지금까지 칠해진 칸들을 SELECTION_GRADIENT_FADE_DELAY_MS
        // 뒤에 지운다. dragPath/dragWasSolved는 곧 초기화되므로 지금 값을 따로 담아둔다.
        if (isDraggingRectCell && !dragWasSolved && dragPath.length > 0) {
            const pathToClear = dragPath;
            setTimeout(() => {
                pathToClear.forEach((key) => {
                    const [row, col] = key.split(',');
                    const cellEl = getRectCellElement(row, col);
                    if (cellEl) cellEl.style.backgroundImage = '';
                });
            }, SELECTION_GRADIENT_FADE_DELAY_MS);
        }

        isDraggingRectCell = false;
        dragPath = [];
        dragDirection = null;
        dragWasSolved = false;
        dragProgressIndex = 0;
        pendingDrag = null;
    }, { passive: true });
}

// (row, col)은 0부터 시작. 해당 칸 사각형의 배경색을 바꾼다(어떤 CSS color든 가능:
// '#ff0000', 'red', 'rgb(0,0,0)' 등). 콘솔에서 바로 써볼 수 있게 window에도 노출해 둔다:
// setRectGridCell(0, 0, '#ff0000')
function setRectGridCell(row, col, color) {
    if (!rectGridElement) return;
    const rowEl = rectGridElement.querySelector('tbody').children[row];
    if (!rowEl) return;
    const cellEl = rowEl.children[col];
    if (!cellEl) return;
    cellEl.style.backgroundColor = color;
}
window.setRectGridCell = setRectGridCell;

// 칸마다 색을 여기서 직접 정한다. 두 번째 인자(row, col)는 setCharGridCell과 같고,
// 세 번째 인자에 원하는 CSS 색(예: '#ff0000', 'red', 'rgb(0,0,0)', 'transparent')을 넣으면 된다.
setRectGridCell(0, 0, '#ffffff')
setRectGridCell(0, 1, '#ffffff')
setRectGridCell(0, 2, '#ffffff')
setRectGridCell(0, 3, '#ffffff')
setRectGridCell(0, 4, '#ffffff')
setRectGridCell(0, 5, '#ffffff')
setRectGridCell(0, 6, '#ffffff')
setRectGridCell(0, 7, '#ffffff')
setRectGridCell(0, 8, '#ffffff')
setRectGridCell(0, 9, '#ffffff')
setRectGridCell(0, 10, '#ffffff')
setRectGridCell(0, 11, '#ffffff')
setRectGridCell(0, 12, '#ffffff')

setRectGridCell(1, 0, '#ffffff')
setRectGridCell(1, 1, '#ffffff')
setRectGridCell(1, 2, '#ffffff')
setRectGridCell(1, 3, '#ffffff')
setRectGridCell(1, 4, '#ffffff')
setRectGridCell(1, 5, '#ffffff')
setRectGridCell(1, 6, '#ffffff')
setRectGridCell(1, 7, '#ffffff')
setRectGridCell(1, 8, '#ffffff')
setRectGridCell(1, 9, '#ffffff')
setRectGridCell(1, 10, '#ffffff')
setRectGridCell(1, 11, '#ffffff')
setRectGridCell(1, 12, '#ffffff')

setRectGridCell(2, 0, '#ffffff')
setRectGridCell(2, 1, '#ffffff')
setRectGridCell(2, 2, '#ffffff')
setRectGridCell(2, 3, '#ffffff')
setRectGridCell(2, 4, '#ffffff')
setRectGridCell(2, 5, '#ffffff')
setRectGridCell(2, 6, '#ffffff')
setRectGridCell(2, 7, '#ffffff')
setRectGridCell(2, 8, '#ffffff')
setRectGridCell(2, 9, '#ffffff')
setRectGridCell(2, 10, '#ffffff')
setRectGridCell(2, 11, '#ffffff')
setRectGridCell(2, 12, '#ffffff')

setRectGridCell(3, 0, '#ffffff')
setRectGridCell(3, 1, '#ffffff')
setRectGridCell(3, 2, '#ffffff')
setRectGridCell(3, 3, '#ffffff')
setRectGridCell(3, 4, '#ffffff')
setRectGridCell(3, 5, '#ffffff')
setRectGridCell(3, 6, '#ffffff')
setRectGridCell(3, 7, '#ffffff')
setRectGridCell(3, 8, '#ffffff')
setRectGridCell(3, 9, '#ffffff')
setRectGridCell(3, 10, '#ffffff')
setRectGridCell(3, 11, '#ffffff')
setRectGridCell(3, 12, '#ffffff')

setRectGridCell(4, 0, '#ffffff')
setRectGridCell(4, 1, '#ffffff')
setRectGridCell(4, 2, '#ffffff')
setRectGridCell(4, 3, '#ffffff')
setRectGridCell(4, 4, '#ffffff')
setRectGridCell(4, 5, '#ffffff')
setRectGridCell(4, 6, '#ffffff')
setRectGridCell(4, 7, '#ffffff')
setRectGridCell(4, 8, '#ffffff')
setRectGridCell(4, 9, '#ffffff')
setRectGridCell(4, 10, '#ffffff')
setRectGridCell(4, 11, '#ffffff')
setRectGridCell(4, 12, '#ffffff')

setRectGridCell(5, 0, '#ffffff')
setRectGridCell(5, 1, '#ffffff')
setRectGridCell(5, 2, '#ffffff')
setRectGridCell(5, 3, '#ffffff')
setRectGridCell(5, 4, '#ffffff')
setRectGridCell(5, 5, '#ffffff')
setRectGridCell(5, 6, '#ffffff')
setRectGridCell(5, 7, '#ffffff')
setRectGridCell(5, 8, '#ffffff')
setRectGridCell(5, 9, '#ffffff')
setRectGridCell(5, 10, '#ffffff')
setRectGridCell(5, 11, '#ffffff')
setRectGridCell(5, 12, '#ffffff')

setRectGridCell(6, 0, '#ffffff')
setRectGridCell(6, 1, '#ffffff')
setRectGridCell(6, 2, '#ffffff')
setRectGridCell(6, 3, '#ffffff')
setRectGridCell(6, 4, '#ffffff')
setRectGridCell(6, 5, '#ffffff')
setRectGridCell(6, 6, '#ffffff')
setRectGridCell(6, 7, '#ffffff')
setRectGridCell(6, 8, '#ffffff')
setRectGridCell(6, 9, '#ffffff')
setRectGridCell(6, 10, '#ffffff')
setRectGridCell(6, 11, '#ffffff')
setRectGridCell(6, 12, '#ffffff')


setCharGridCell(0, 0, '고')
setCharGridCell(0, 1, '등')
setCharGridCell(0, 2, '어')
setCharGridCell(0, 3, '아')
setCharGridCell(0, 4, '구')
setCharGridCell(0, 5, '든')
setCharGridCell(0, 6, '고')
setCharGridCell(0, 7, '고')
setCharGridCell(0, 8, '어')
setCharGridCell(0, 9, '구')
setCharGridCell(0, 10, '고')
setCharGridCell(0, 11, '아')
setCharGridCell(0, 12, '고')

setCharGridCell(1, 0, '등')
setCharGridCell(1, 1, '고')
setCharGridCell(1, 2, '든')
setCharGridCell(1, 3, '가')
setCharGridCell(1, 4, '고')
setCharGridCell(1, 5, '고')
setCharGridCell(1, 6, '등')
setCharGridCell(1, 7, '등')
setCharGridCell(1, 8, '등')
setCharGridCell(1, 9, '일')
setCharGridCell(1, 10, '어')
setCharGridCell(1, 11, '고')
setCharGridCell(1, 12, '나')

setCharGridCell(2, 0, '원')
setCharGridCell(2, 1, '고')
setCharGridCell(2, 2, '고')
setCharGridCell(2, 3, '등')
setCharGridCell(2, 4, '어')
setCharGridCell(2, 5, '등')
setCharGridCell(2, 6, '어')
setCharGridCell(2, 7, '어')
setCharGridCell(2, 8, '고')
setCharGridCell(2, 9, '등')
setCharGridCell(2, 10, '곤')
setCharGridCell(2, 11, '등')
setCharGridCell(2, 12, '은')

setCharGridCell(3, 0, '구')
setCharGridCell(3, 1, '등')
setCharGridCell(3, 2, '거')
setCharGridCell(3, 3, '고')
setCharGridCell(3, 4, '고')
setCharGridCell(3, 5, '어')
setCharGridCell(3, 6, '고')
setCharGridCell(3, 7, '등')
setCharGridCell(3, 8, '어')
setCharGridCell(3, 9, '곤')
setCharGridCell(3, 10, '골')
setCharGridCell(3, 11, '어')
setCharGridCell(3, 12, '든')

setCharGridCell(4, 0, '월')
setCharGridCell(4, 1, '어')
setCharGridCell(4, 2, '이')
setCharGridCell(4, 3, '등')
setCharGridCell(4, 4, '너')
setCharGridCell(4, 5, '고')
setCharGridCell(4, 6, '등')
setCharGridCell(4, 7, '어')
setCharGridCell(4, 8, '워')
setCharGridCell(4, 9, '고')
setCharGridCell(4, 10, '구')
setCharGridCell(4, 11, '고')
setCharGridCell(4, 12, '엉')

setCharGridCell(5, 0, '구')
setCharGridCell(5, 1, '기')
setCharGridCell(5, 2, '오')
setCharGridCell(5, 3, '어')
setCharGridCell(5, 4, '어')
setCharGridCell(5, 5, '등')
setCharGridCell(5, 6, '고')
setCharGridCell(5, 7, '구')
setCharGridCell(5, 8, '고')
setCharGridCell(5, 9, '등')
setCharGridCell(5, 10, '어')
setCharGridCell(5, 11, '이')
setCharGridCell(5, 12, '곧')

setCharGridCell(6, 0, '갈')
setCharGridCell(6, 1, '고')
setCharGridCell(6, 2, '등')
setCharGridCell(6, 3, '어')
setCharGridCell(6, 4, '어')
setCharGridCell(6, 5, '등')
setCharGridCell(6, 6, '굴')
setCharGridCell(6, 7, '일')
setCharGridCell(6, 8, '고')
setCharGridCell(6, 9, '든')
setCharGridCell(6, 10, '이')
setCharGridCell(6, 11, '가')
setCharGridCell(6, 12, '은')






















// (row, col)은 0부터 시작. 해당 칸에 글자(문자 하나든 문자열이든)를 넣는다.
// 콘솔에서 바로 써볼 수 있게 window에도 노출해 둔다: setCharGridCell(0, 0, '가')
function setCharGridCell(row, col, char) {
    const rowEl = charGridElement.querySelector('tbody').children[row];
    if (!rowEl) return;
    const cellEl = rowEl.children[col];
    if (!cellEl) return;
    const textEl = cellEl.querySelector('.char-cell-text');
    if (!textEl) return;
    textEl.textContent = char;
}
window.setCharGridCell = setCharGridCell;

// (row, col)에 있는 글자를 읽어온다. 칸이 없거나 글자가 없으면 null.
function getCharGridCell(row, col) {
    const rowEl = charGridElement.querySelector('tbody').children[row];
    if (!rowEl) return null;
    const cellEl = rowEl.children[col];
    if (!cellEl) return null;
    const textEl = cellEl.querySelector('.char-cell-text');
    return textEl ? textEl.textContent : null;
}
window.getCharGridCell = getCharGridCell;

// 네 방향(오른쪽/왼쪽/아래/위)으로 한 칸씩 이동할 때의 (row 증가량, col 증가량).
// 대각선은 다루지 않는다.
const DIRECTION_STEPS = {
    right: { dr: 0, dc: 1 },
    left: { dr: 0, dc: -1 },
    down: { dr: 1, dc: 0 },
    up: { dr: -1, dc: 0 }
};

// word(예: '고등어')가 격자 안에서 오른쪽/왼쪽/아래/위, 이 네 방향 중 어느
// 하나로 연속해서 놓여 있는 모든 자리를 찾는다(대각선은 보지 않는다).
// 반환값: [{ row, col, direction }, ...] — row/col은 항상 단어의 첫 글자가
// 있는 칸(예: "고등어"라면 '고'가 있는 칸)이고, direction은
// 'right' | 'left' | 'down' | 'up' 중 하나로, 그 방향을 따라가며 읽으면
// 단어 순서 그대로 나온다는 뜻이다.
// getCharGridCell은 범위를 벗어난 (row, col)에는 그냥 null을 돌려주므로,
// 격자 밖으로 나가는 경우는 별도 처리 없이 자동으로 걸러진다.
// 콘솔에서 바로 써볼 수 있게 window에도 노출해 둔다: findWordOccurrences('고등어')
function findWordOccurrences(word) {
    const chars = Array.from(word);
    const len = chars.length;
    const matches = [];

    for (let r = 0; r < CHAR_GRID_ROWS; r++) {
        for (let c = 0; c < CHAR_GRID_COLS; c++) {
            for (const direction in DIRECTION_STEPS) {
                const { dr, dc } = DIRECTION_STEPS[direction];
                let ok = true;
                for (let i = 0; i < len; i++) {
                    if (getCharGridCell(r + dr * i, c + dc * i) !== chars[i]) { ok = false; break; }
                }
                if (ok) matches.push({ row: r, col: c, direction });
            }
        }
    }

    return matches;
}
window.findWordOccurrences = findWordOccurrences;

// findWordOccurrences가 찾은 자리 하나(시작 칸 + 방향)를, 그 방향을 따라
// 실제로 단어가 지나가는 칸 좌표 배열로 풀어준다. 예를 들어 direction이
// 'up'이면 [시작 칸, 그 위 칸, 그 위의 위 칸, ...] 순서가 된다.
function occurrenceToOrderedCells({ row, col, direction }, len) {
    const { dr, dc } = DIRECTION_STEPS[direction];
    const cells = [];
    for (let i = 0; i < len; i++) {
        cells.push(`${row + dr * i},${col + dc * i}`);
    }
    return cells;
}

const TARGET_WORD = '고등어';
const targetWordLength = Array.from(TARGET_WORD).length;
const targetWordOccurrences = findWordOccurrences(TARGET_WORD);
console.log(`${TARGET_WORD} 위치(위/아래/왼쪽/오른쪽 전부):`, targetWordOccurrences);

// 세트별로 "고등어" 순서를 지키는 칸 배열(예: ["2,4", "2,3", "2,2"])을
// wordOccurrenceGroups에 채운다. 드래그는 반드시 배열의 첫 칸(= "고")에서
// 시작해서 순서대로 지나가야만 인정된다.
wordOccurrenceGroups = targetWordOccurrences.map((occ) => occurrenceToOrderedCells(occ, targetWordLength));

// FaceLandmarker 478포인트 기준 홍채 중심/눈 양끝 인덱스.
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const EYE_HOLE_RADIUS_MULTIPLIER = 1; // <- 눈 폭 대비 구멍 반지름. 숫자만 바꾸면 즉시 반영된다.
const EYE_HOLE_SPACING_MULTIPLIER = 1; // <- 두 원 사이 간격. 1이면 원 중심이 동공 중심과 정확히 일치한다.
const EYE_SPHERE_RADIUS_MULTIPLIER = 1; // <- --eye-r 대비 눈 확대(bulge) 반경. 1이어야 셰이더의 왜곡 0 지점(r=1)이 눈에 보이는 원(링/마스크) 경계와 정확히 겹친다.
const EYE_SPHERE_ZOOM_POWER = 2.2; // <- 동공 확대 배율. 1이면 확대 없음(배경과 완전히 동일), 클수록 중심이 더 세게 확대된다. 실행 중엔 콘솔에서 setEyeZoomPower(값)으로 바로 바꿔볼 수 있다.
// r(0~1, 중심~반경 끝)이 이 값을 넘어서면 확대 배율을 서서히(smoothstep) 1(확대 없음)로
// 되돌린다. 이게 없으면 r=1 지점에서 "값"은 배경과 같아도 배율(미분)이 뚝 끊겨서 아주 얇은
// 렌즈 테두리처럼 보일 수 있다 — 숫자를 낮출수록(예: 0.4) 더 일찍부터 넓게 부드러워지고,
// 1에 가까울수록 거의 끝까지 확대율을 유지하다 좁은 폭에서 급히 되돌아간다.
const EYE_WARP_FEATHER_START = 0.55;
// 공포감을 위해 처음부터 화면 전체를 흑백으로 유지한다. CSS filter/backdrop-filter로
// 흑백을 입히면 브라우저가 화면 실제 해상도 그대로 매 프레임 다시 필터링해야 해서
// 아이맥(5K) 등 고해상도 화면에서 렉이 심해진다 — 이 프로젝트에서 이미 한 번 겪은
// 문제(backdrop-filter 제거 사유)와 같은 종류다. 대신 이미 매 프레임 그리고 있는
// 배경 셰이더 안에서 dot product 한 번으로 처리하면 별도 레이어/패스가 없고,
// computeRendererPixelRatio()가 걸어둔 픽셀 예산 안에서만 계산되므로 화면 크기와
// 무관하게 비용이 거의 늘지 않는다.
// 실행 중 window.setEyeFilterGrayscale(0~1) / window.setEyeFilterSoftness(0~1)로
// 바로 값을 바꿔볼 수 있다.
const EYE_FILTER_GRAYSCALE_DEFAULT = 1; // <- 0=원본 컬러, 1=완전 흑백. 공포 연출용으로 처음부터 1.
const EYE_FILTER_SOFTNESS_DEFAULT = 0; // <- 0=선명, 1=최대 소프트(뿌연) 효과

// 화면 픽셀 좌표를 그대로 world 좌표로 쓰기 위한 직교 카메라. left=0,right=dw,top=0,bottom=dh로
// 두면 화면처럼 원점이 왼쪽 위, y가 아래로 증가하는 좌표계가 그대로 맞아떨어진다.
let threeScene, threeCamera, threeRenderer, backgroundPlane, backgroundMaterial;

// 맥북 14인치(1512x982) 기준, DPR 캡 1.5로 실제로 그리던 렌더 버퍼 픽셀 수(≈330만)를
// "기준 예산"으로 삼는다. 아이맥 27" 5K처럼 논리 해상도 자체가 훨씬 큰 화면(2560x1440,
// DPR 2)은 캡을 1.5로 고정해도 버퍼가 3840x2160(≈830만, 맥북의 2.5배)까지 커져서
// 셰이더가 매 프레임 처리해야 할 픽셀 수가 그만큼 늘어난다 — 이 프로젝트에서 풀스크린
// 효과가 아이맥에서만 렉났던 전례(backdrop-filter 제거 사유)가 있어서, 화면이 클수록
// 오히려 배율을 낮춰 실제 그리는 픽셀 수를 이 예산 근처로 맞춘다.
const RENDER_PIXEL_BUDGET = 1512 * 982 * 1.5 * 1.5;
// 예산에 맞춰 계산한 배율이 너무 낮아지면(초고해상도 화면) 화질이 눈에 띄게 물러지므로
// 이 아래로는 떨어뜨리지 않는다.
const MIN_PIXEL_RATIO = 0.75;
const MAX_PIXEL_RATIO = 1.5;

// 화면 크기(dw, dh: CSS px)에 맞춰 "예산을 넘지 않는 선에서 가능한 한 선명하게" 배율을
// 정한다. 화면이 작으면(맥북 등) 예산 대비 여유가 있으니 기존처럼 min(DPR, 1.5)가 그대로
// 나오고, 화면이 크면(아이맥 등) 예산에 맞춰 자동으로 낮아진다.
function computeRendererPixelRatio(dw, dh) {
    const nativeRatio = window.devicePixelRatio || 1;
    const budgetRatio = Math.sqrt(RENDER_PIXEL_BUDGET / (dw * dh));
    return Math.min(nativeRatio, MAX_PIXEL_RATIO, Math.max(budgetRatio, MIN_PIXEL_RATIO));
}

// 위 예산 계산은 "이 정도 픽셀 수면 어떤 기기에서든 괜찮을 것"이라는 추정일 뿐,
// 실제 기기(특히 인텔 아이맥처럼 세대/모델에 따라 GPU 성능 차이가 큰 경우)에서도
// 맞으리라는 보장은 없다. 그래서 실제 프레임 속도를 재서, 일정 시간 이상 계속
// 느리면 렌더 해상도를 스스로 한 단계씩 낮추는 안전장치를 둔다 — 계산이 아니라
// 실측 기반이라 어떤 기종을 갖다 놔도 결국 버벅이지 않는 지점을 스스로 찾아간다.
// 한번 낮아진 뒤에는 다시 자동으로 올리지 않는다(성능이 오르내릴 때마다 화질이
// 깜빡이며 바뀌는 걸 막기 위해서다) — 창 크기가 바뀌면 그 시점 화면 기준으로 다시 잰다.
const ADAPTIVE_TARGET_FPS = 24; // <- 평균이 이 밑으로 떨어지면 해상도를 낮춘다.
const ADAPTIVE_MEASURE_WINDOW_MS = 2000; // <- 이 시간(ms) 동안의 평균으로 판단한다. 순간적인 한두 프레임 버벅임에는 반응하지 않는다.
const ADAPTIVE_STEP_DOWN_FACTOR = 0.85; // <- 느릴 때마다 배율을 이 비율만큼 곱해서 낮춘다.
const ADAPTIVE_MIN_PIXEL_RATIO = 0.5; // <- 아무리 느려도 이 밑으로는 안 내려간다(최소 화질 하한선).

let currentPixelRatio = 1;
let adaptiveWindowStart = 0;
let adaptiveFrameCount = 0;
let adaptiveFrameTimeSum = 0;

// 렌더러 픽셀 배율을 실제로 적용하면서 지금 배율을 기록해 둔다(다음 단계 낮출 때 기준값으로 씀).
function applyPixelRatio(ratio) {
    currentPixelRatio = ratio;
    threeRenderer.setPixelRatio(ratio);
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
}

// 리사이즈 등으로 측정 구간을 새로 시작해야 할 때 부른다.
function resetAdaptiveMeasurement(now) {
    adaptiveWindowStart = now;
    adaptiveFrameCount = 0;
    adaptiveFrameTimeSum = 0;
}

// requestAnimationFrame 간격(frameMs)을 계속 누적하다가, 측정 구간(ADAPTIVE_MEASURE_WINDOW_MS)이
// 차면 그 구간 평균 fps를 계산해서 목표(ADAPTIVE_TARGET_FPS) 밑이면 해상도를 한 단계 낮춘다.
function maybeStepDownQuality(frameMs, now) {
    adaptiveFrameCount++;
    adaptiveFrameTimeSum += frameMs;
    if (now - adaptiveWindowStart < ADAPTIVE_MEASURE_WINDOW_MS) return;

    const avgFps = 1000 / (adaptiveFrameTimeSum / adaptiveFrameCount);
    if (avgFps < ADAPTIVE_TARGET_FPS && currentPixelRatio > ADAPTIVE_MIN_PIXEL_RATIO) {
        const next = Math.max(currentPixelRatio * ADAPTIVE_STEP_DOWN_FACTOR, ADAPTIVE_MIN_PIXEL_RATIO);
        console.warn(`[성능] 평균 ${avgFps.toFixed(1)}fps로 느려서 렌더 해상도를 ${currentPixelRatio.toFixed(2)} → ${next.toFixed(2)}로 낮춤`);
        applyPixelRatio(next);
    }
    resetAdaptiveMeasurement(now);
}

function initThreeScene() {
    if (!sphereCanvas) return;

    threeScene = new THREE.Scene();

    const dw = window.innerWidth;
    const dh = window.innerHeight;
    threeCamera = new THREE.OrthographicCamera(0, dw, 0, dh, 0.1, 2000);
    threeCamera.position.z = 1000;

    threeRenderer = new THREE.WebGLRenderer({ canvas: sphereCanvas, alpha: true, antialias: false });
    currentPixelRatio = computeRendererPixelRatio(dw, dh);
    threeRenderer.setPixelRatio(currentPixelRatio);
    threeRenderer.setSize(dw, dh);
    threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.flipY = false;

    // 화면 전체를 덮는 배경 영상과 눈 확대(bulge distortion)를 한 셰이더 안에서 같이
    // 그린다. 예전에는 배경 <video> 위에 별도 3D 구 오브젝트를 "겹쳐서" 그렸는데,
    // 그러면 구/배경이 서로 다른 렌더링 경로(비디오 태그 vs. GL 텍스처)를 타면서
    // 디스플레이의 색상 처리 차이에 따라 경계가 보이거나 안 보이거나 했다(맥북에서는
    // 안 보이고 아이맥에서는 보임). 방송 카메라 앱의 "눈 확대" 필터처럼, 같은 영상을
    // 같은 자리에서 그대로 국소적으로만 왜곡시키면 애초에 다른 레이어가 없으니 경계나
    // 색 차이가 구조적으로 생길 수 없다.
    //
    // 원리: 화면의 각 픽셀은 기본적으로 "배경 UV"(cover 스케일/오프셋을 거꾸로 계산해서
    // 얻은, 그 픽셀이 원래 보여줘야 할 비디오 좌표)를 그대로 샘플링한다. 다만 눈 중심에서
    // 반경(uEyeRadiusPx) 안에 있는 픽셀은 중심으로 갈수록 샘플링 좌표를 눈 UV 쪽으로
    // 끌어당겨서(r^(zoom-1) 배로 좁혀서) 확대돼 보이게 한다. 반경 경계(r=1)에서는 이
    // 배율이 정확히 1이 되어 "배경 UV"와 완전히 같은 값을 내므로(수학적으로 증명 가능),
    // 이음매 없이 자연스럽게 배경과 이어진다.
    const vertexShader = `
        varying vec2 vScreenPos;
        void main() {
            vScreenPos = (modelMatrix * vec4(position, 1.0)).xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const fragmentShader = `
        varying vec2 vScreenPos;
        uniform sampler2D map;
        uniform vec2 uScreenSize;
        uniform vec2 uVideoSize;
        uniform float uCoverScale;
        uniform vec2 uCoverOffset;
        uniform vec2 uEye1Px;
        uniform float uEye1RadiusPx;
        uniform vec2 uEye2Px;
        uniform float uEye2RadiusPx;
        uniform float uZoomPower;
        uniform float uFeatherStart;
        uniform float uGrayscale;
        uniform float uSoftness;

        // object-fit:cover + 좌우 미러(셀피)를 거꾸로 계산해서, 화면 픽셀이 원래
        // 보여줘야 할 비디오 UV를 구한다. #webcam이 예전에 CSS로 하던 것과 정확히 같은 계산.
        vec2 backgroundUV(vec2 screenP) {
            float u = (uScreenSize.x - uCoverOffset.x - screenP.x) / (uVideoSize.x * uCoverScale);
            float v = (screenP.y - uCoverOffset.y) / (uVideoSize.y * uCoverScale);
            return vec2(u, v);
        }

        // "화면 좌표 자체"를 눈 중심 쪽으로 당겨서 반환한다 — sphere 같은 3D 오브젝트가
        // 아니라, 이 픽셀이 원래 봤어야 할 비디오 좌표를 눈 중심에 더 가까운 좌표로
        // 바꿔치기하는 것뿐이라 렌즈 확대와 똑같이 보인다. r(0=중심,1=반경 끝)이
        // uFeatherStart를 넘어서면 배율을 smoothstep으로 서서히 1(원본 그대로)까지
        // 되돌리기 때문에, r=1에서 값뿐 아니라 배율(미분)까지 매끄럽게 이어져 동그란
        // 테두리가 생기지 않는다. 반경 밖(r>=1)은 이 함수를 아예 부르지 않고 원래
        // 좌표를 그대로 쓴다.
        vec2 warpScreenPos(vec2 screenP, vec2 eyePx, float radiusPx) {
            vec2 d = screenP - eyePx;
            float r = length(d) / radiusPx;
            float rawShrink = pow(max(r, 0.0001), uZoomPower - 1.0);
            float shrink = mix(rawShrink, 1.0, smoothstep(uFeatherStart, 1.0, r));
            return eyePx + d * shrink;
        }

        void main() {
            vec2 p = vScreenPos;

            // 두 눈의 원이 서로 겹칠 일은 거의 없지만, 혹시 겹쳐도 항상 더 가까운(강하게
            // 걸리는) 눈 하나만 적용해서 이중으로 왜곡되지 않게 한다.
            float n1 = (uEye1RadiusPx > 0.0001) ? length(vScreenPos - uEye1Px) / uEye1RadiusPx : 1.0e6;
            float n2 = (uEye2RadiusPx > 0.0001) ? length(vScreenPos - uEye2Px) / uEye2RadiusPx : 1.0e6;

            if (n1 <= n2 && n1 < 1.0) {
                p = warpScreenPos(vScreenPos, uEye1Px, uEye1RadiusPx);
            } else if (n2 < 1.0) {
                p = warpScreenPos(vScreenPos, uEye2Px, uEye2RadiusPx);
            }

            vec3 color = texture2D(map, backgroundUV(p)).rgb;

            // 아래는 눈 확대와 무관하게 화면 전체에 얹을 수 있는 추가 필터. 텍셀 크기만큼만
            // 주변 4점을 더 찍는 저비용 블러라 매 프레임 비용이 거의 늘지 않는다.
            if (uSoftness > 0.0001) {
                vec2 texel = 1.0 / max(uVideoSize * uCoverScale, vec2(1.0));
                vec2 uv = backgroundUV(p);
                vec3 blurred = color;
                blurred += texture2D(map, uv + vec2(texel.x, 0.0)).rgb;
                blurred += texture2D(map, uv - vec2(texel.x, 0.0)).rgb;
                blurred += texture2D(map, uv + vec2(0.0, texel.y)).rgb;
                blurred += texture2D(map, uv - vec2(0.0, texel.y)).rgb;
                color = mix(color, blurred / 5.0, uSoftness);
            }

            if (uGrayscale > 0.0001) {
                float gray = dot(color, vec3(0.299, 0.587, 0.114));
                color = mix(color, vec3(gray), uGrayscale);
            }

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    backgroundMaterial = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: videoTexture },
            uScreenSize: { value: new THREE.Vector2(dw, dh) },
            uVideoSize: { value: new THREE.Vector2(1, 1) },
            uCoverScale: { value: 1 },
            uCoverOffset: { value: new THREE.Vector2(0, 0) },
            uEye1Px: { value: new THREE.Vector2(-9999, -9999) },
            uEye1RadiusPx: { value: 0 },
            uEye2Px: { value: new THREE.Vector2(-9999, -9999) },
            uEye2RadiusPx: { value: 0 },
            uZoomPower: { value: EYE_SPHERE_ZOOM_POWER },
            uFeatherStart: { value: EYE_WARP_FEATHER_START },
            uGrayscale: { value: EYE_FILTER_GRAYSCALE_DEFAULT },
            uSoftness: { value: EYE_FILTER_SOFTNESS_DEFAULT }
        },
        vertexShader,
        fragmentShader,
        // 화면 y가 아래로 증가하게 하려고 카메라를 top=0/bottom=dh로 "뒤집어" 만들었는데
        // (위 OrthographicCamera 생성부 참고), 이 y-flip이 이 평면의 정점 감김 방향도
        // 같이 뒤집어버린다. 기본값 FrontSide(뒷면 컬링)로 두면 매 프레임 이 평면 전체가
        // 백페이스로 판정돼 통째로 컬링되어 아무것도 안 그려지고 캔버스가 계속 투명한
        // 채로 남는다(= 뒤에 있는 body 배경색만 보임, 지금까지 "촬영본이 안 나온다"던
        // 증상의 원인). 화면 전체를 덮는 평면 하나뿐이라 양면 그리기 비용도 무시할 만해서
        // DoubleSide로 컬링 자체를 꺼서 해결한다.
        side: THREE.DoubleSide
    });

    // 단위 평면(1x1)을 화면 크기만큼 scale해서 쓰면, 리사이즈 때 geometry를 새로
    // 만들 필요 없이 scale/position만 갱신하면 된다.
    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    backgroundPlane = new THREE.Mesh(planeGeometry, backgroundMaterial);
    backgroundPlane.position.set(dw / 2, dh / 2, 0);
    backgroundPlane.scale.set(dw, dh, 1);
    threeScene.add(backgroundPlane);

    window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        threeCamera.right = w;
        threeCamera.bottom = h;
        threeCamera.updateProjectionMatrix();
        currentPixelRatio = computeRendererPixelRatio(w, h);
        threeRenderer.setPixelRatio(currentPixelRatio);
        threeRenderer.setSize(w, h);
        backgroundPlane.position.set(w / 2, h / 2, 0);
        backgroundPlane.scale.set(w, h, 1);
        backgroundMaterial.uniforms.uScreenSize.value.set(w, h);
        // 화면 크기가 바뀌면 그 순간의 튐이 이전 측정 평균에 섞이지 않도록 새로 잰다.
        resetAdaptiveMeasurement(performance.now());
    });
}

// object-fit:cover 스케일/오프셋 값을 셰이더에 매 프레임 넘겨서, 배경 영상이 화면
// 크기·비디오 크기에 맞게 항상 올바르게 표시되도록 한다(리사이즈 즉시 대응).
function updateBackgroundUniforms(dw, dh, vw, vh, scale, offsetX, offsetY) {
    if (!backgroundMaterial) return;
    const u = backgroundMaterial.uniforms;
    u.uScreenSize.value.set(dw, dh);
    u.uVideoSize.value.set(vw, vh);
    u.uCoverScale.value = scale;
    u.uCoverOffset.value.set(offsetX, offsetY);
}

// 눈이 인식되지 않을 때 확대 효과를 끈다(반경 0 → 셰이더가 배경 UV만 쓰게 됨).
// 배경 영상 자체는 이 캔버스가 계속 그려야 하므로(더 이상 별도 <video> 표시가 없음)
// render()는 매번 그대로 호출해서 영상이 계속 살아있게 한다.
function disableEyeWarp() {
    if (!backgroundMaterial) return;
    backgroundMaterial.uniforms.uEye1RadiusPx.value = 0;
    backgroundMaterial.uniforms.uEye2RadiusPx.value = 0;
    threeRenderer.render(threeScene, threeCamera);
}

// 동공 위치(화면 좌표, y는 위에서부터)로 왜곡 중심/범위를 갱신하고 다시 그린다.
// 셰이더가 화면 좌표를 직접 눈 중심 쪽으로 당겨서 샘플링하므로(warpScreenPos),
// 홍채 UV를 따로 넘겨줄 필요가 없다 — UV/픽셀 두 좌표계를 손으로 맞추다 어긋나는
// 실수 자체가 구조적으로 사라진다.
function updateEyeWarp(leftEye, rightEye, radius) {
    if (!backgroundMaterial) return;
    const r = radius * EYE_SPHERE_RADIUS_MULTIPLIER;
    const u = backgroundMaterial.uniforms;

    u.uEye1Px.value.set(leftEye.x, leftEye.y);
    u.uEye1RadiusPx.value = r;

    u.uEye2Px.value.set(rightEye.x, rightEye.y);
    u.uEye2RadiusPx.value = r;

    threeRenderer.render(threeScene, threeCamera);
}

// 눈 확대 배율을 실행 중에 바로 조절해볼 수 있게 window에 노출해 둔다. 1이면 확대
// 없음(배경과 완전히 동일), 클수록 눈 중심이 더 세게 확대된다. 코드의 기본값
// (EYE_SPHERE_ZOOM_POWER, 지금 2.2)을 바꾸지 않고도 콘솔에서 바로 값을 바꿔가며
// 원하는 확대 정도를 찾아볼 수 있다: setEyeZoomPower(3.5)
function setEyeZoomPower(power) {
    if (!backgroundMaterial) return;
    backgroundMaterial.uniforms.uZoomPower.value = Math.max(power, 1);
}
window.setEyeZoomPower = setEyeZoomPower;

// 눈 확대와 별개로, 화면 전체에 얹는 흑백/소프트 효과를 실행 중에 바로 조절해볼 수
// 있게 window에 노출해 둔다. 콘솔에서: setEyeFilterGrayscale(1), setEyeFilterSoftness(0.5)
function setEyeFilterGrayscale(amount) {
    if (!backgroundMaterial) return;
    backgroundMaterial.uniforms.uGrayscale.value = Math.min(Math.max(amount, 0), 1);
}
function setEyeFilterSoftness(amount) {
    if (!backgroundMaterial) return;
    backgroundMaterial.uniforms.uSoftness.value = Math.min(Math.max(amount, 0), 1);
}
window.setEyeFilterGrayscale = setEyeFilterGrayscale;
window.setEyeFilterSoftness = setEyeFilterSoftness;

initThreeScene();

let faceLandmarker;
let lastVideoTime = -1;

// 사각형 칸 중 이미 "고등어" 정답으로 확인돼서 투명해진 칸들을 전부 원래
// 흰색으로 되돌린다. 사람 눈이 화면에서 사라졌을 때 게임 진행 상태를
// 초기화하는 용도로 쓴다.
function resetSolvedRectCells() {
    if (!rectGridElement) return;
    for (let r = 0; r < CHAR_GRID_ROWS; r++) {
        for (let c = 0; c < CHAR_GRID_COLS; c++) {
            const cellEl = getRectCellElement(r, c);
            if (!cellEl || cellEl.style.backgroundColor !== 'transparent') continue;
            cellEl.style.backgroundImage = '';
            cellEl.style.backgroundColor = '#ffffff';
        }
    }
}
window.resetSolvedRectCells = resetSolvedRectCells;

// 직전 프레임에도 눈이 화면에 보이고 있었는지. 눈이 "보임 → 안 보임"으로
// 바뀌는 그 순간에만 한 번 초기화하면 되므로, 안 보이는 동안 매 프레임
// 반복해서 초기화하지 않으려고 이 플래그로 전환 시점만 잡아낸다.
let eyesWereVisible = false;

// 눈이 안 보이기 시작한 순간, 얼마나 계속 안 보여야 첫 화면(진행 상태 초기화)으로
// 되돌릴지 정하는 유예 시간(ms). 깜빡임이나 순간적인 인식 실패, 화면 가장자리를
// 살짝 스치는 정도로는 초기화되지 않도록 완화하는 용도. 숫자를 늘리면 더 관대해진다.
const EYE_LOST_RESET_GRACE_MS = 1200;
// 눈이 마지막으로 안 보이기 "시작"한 시각(ms). 계속 보이는 동안은 null.
let eyesLostSince = null;

// 눈(홍채) 위치를 화면 좌표로 변환해 마스크 구멍 위치/반경과 눈 확대(bulge) 효과를 갱신한다.
// 좌표 자체는 미러링 변환이 없으므로, 여기서는 화면에 실제로 보이는(미러링된) 좌표로 바꿔서 쓴다.
function updateEyeReveal(landmarks) {
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (!vw || !vh) return; // 비디오 메타데이터가 아직 준비 전이면 아무것도 할 수 없다.

    // 배경 영상 표시는 더 이상 CSS(object-fit:cover)가 아니라 셰이더가 맡으므로,
    // 이 변환 값을 얼굴 인식 여부와 무관하게 매 프레임 셰이더에 넘겨줘야 화면
    // 크기가 바뀌거나 얼굴이 안 보이는 동안에도 배경 영상이 계속 올바르게 보인다.
    const dw = window.innerWidth;
    const dh = window.innerHeight;
    const scale = Math.max(dw / vw, dh / vh);
    const offsetX = (dw - vw * scale) / 2;
    const offsetY = (dh - vh * scale) / 2;
    updateBackgroundUniforms(dw, dh, vw, vh, scale, offsetX, offsetY);

    if (!landmarks) {
        document.documentElement.style.setProperty('--eye-r', '0px');
        disableEyeWarp();
        // 눈이 안 보이기 시작한 순간부터 EYE_LOST_RESET_GRACE_MS(ms) 이상
        // 계속 안 보일 때만 사각형 칸들을 흰색으로 되돌린다. 그 안에 눈이
        // 다시 잡히면(아래 eyesLostSince = null) 초기화 없이 진행 상태가 유지된다.
        if (eyesWereVisible) {
            if (eyesLostSince === null) eyesLostSince = performance.now();
            if (performance.now() - eyesLostSince >= EYE_LOST_RESET_GRACE_MS) {
                resetSolvedRectCells();
                eyesWereVisible = false;
                eyesLostSince = null;
            }
        }
        return;
    }
    eyesWereVisible = true;
    eyesLostSince = null;

    const toScreen = (pt) => ({
        x: dw - (pt.x * vw * scale + offsetX), // 미러링(selfie 시점)
        y: pt.y * vh * scale + offsetY
    });

    const leftEyeRaw = toScreen(landmarks[LEFT_IRIS_CENTER]);
    const rightEyeRaw = toScreen(landmarks[RIGHT_IRIS_CENTER]);

    // 두 눈 중간점을 기준으로 원을 밀어내거나 당겨서 간격을 조절한다.
    const midX = (leftEyeRaw.x + rightEyeRaw.x) / 2;
    const midY = (leftEyeRaw.y + rightEyeRaw.y) / 2;
    const spread = (pt) => ({
        x: midX + (pt.x - midX) * EYE_HOLE_SPACING_MULTIPLIER,
        y: midY + (pt.y - midY) * EYE_HOLE_SPACING_MULTIPLIER
    });
    const leftEye = spread(leftEyeRaw);
    const rightEye = spread(rightEyeRaw);

    const eyeWidthPx = (a, b) => Math.hypot(
        (landmarks[a].x - landmarks[b].x) * vw * scale,
        (landmarks[a].y - landmarks[b].y) * vh * scale
    );
    const radius = Math.max(
        eyeWidthPx(LEFT_EYE_OUTER, LEFT_EYE_INNER),
        eyeWidthPx(RIGHT_EYE_OUTER, RIGHT_EYE_INNER)
    ) * EYE_HOLE_RADIUS_MULTIPLIER;

    const root = document.documentElement.style;
    root.setProperty('--lx', `${leftEye.x}px`);
    root.setProperty('--ly', `${leftEye.y}px`);
    root.setProperty('--rx', `${rightEye.x}px`);
    root.setProperty('--ry', `${rightEye.y}px`);
    root.setProperty('--eye-r', `${radius}px`);

    updateEyeWarp(leftEye, rightEye, radius);
}

function onResults(results) {
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        updateEyeReveal(results.faceLandmarks[0]);
    } else {
        updateEyeReveal(null);
    }
}

let lastFrameTimestamp = 0;

function renderLoop(timestamp) {
    // requestAnimationFrame이 넘겨주는 timestamp로 매 프레임 간격(ms)을 재서
    // maybeStepDownQuality에 넘긴다 — 이 기기에서 실제로 얼마나 느린지는 계산이
    // 아니라 이렇게 재보는 것 외엔 알 방법이 없다.
    if (lastFrameTimestamp) {
        maybeStepDownQuality(timestamp - lastFrameTimestamp, timestamp);
    } else {
        resetAdaptiveMeasurement(timestamp);
    }
    lastFrameTimestamp = timestamp;

    // 이 안에서 예외가 하나라도 던져지면(예: 셰이더/렌더링 버그) try/catch가 없을 때
    // 맨 아래 requestAnimationFrame(renderLoop) 호출까지 도달하지 못해서 루프
    // 자체가 그 프레임에서 영원히 멈춰버린다 — 카메라는 계속 켜져 있는데 화면만
    // 멈추는(지금처럼 파랗게 굳는) 증상이 된다. 그래서 실제로 무슨 에러인지 콘솔에
    // 분명하게 남기고, 다음 프레임은 계속 시도하도록 막는다.
    try {
        if (videoElement.currentTime !== lastVideoTime) {
            lastVideoTime = videoElement.currentTime;
            const results = faceLandmarker.detectForVideo(videoElement, performance.now());
            onResults(results);
        }
    } catch (err) {
        console.error('renderLoop 프레임 처리 중 에러:', err);
    }
    requestAnimationFrame(renderLoop);
}

async function init() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
        },
        // 표정 계수(blendshape)는 코드 어디서도 쓰지 않는데 매 프레임 추가 연산만
        // 발생시켜서 껐다. 얼굴/눈동자 좌표 인식에는 영향 없음 — 그만큼 매 프레임
        // detectForVideo가 가벼워져서 드래그 반응성과 눈 추적 지연이 나아진다.
        outputFaceBlendshapes: false,
        runningMode: "VIDEO",
        numFaces: 1
    });
    // 1920x1080 대신 1280x720으로 요청. 얼굴 인식 모델은 내부적으로 프레임을 훨씬
    // 작은 고정 크기로 다시 리사이즈해서 쓰기 때문에 인식 자체의 정확도 차이는
    // 거의 없고, 그 리사이즈 전 단계(디코드/복사/GPU 업로드)에 드는 비용만 줄어든다.
    // 다만 화면을 꽉 채워 표시하는 원본 영상 자체는 그만큼 살짝 덜 선명해질 수 있다.
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    videoElement.srcObject = stream;
    videoElement.addEventListener('loadeddata', () => {
        requestAnimationFrame(renderLoop);
    });
}

init();
