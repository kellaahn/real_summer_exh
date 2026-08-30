import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const videoElement = document.getElementById('webcam');
const eyesVideoElement = document.getElementById('webcam-eyes');
const pontElement = document.querySelector('.pont');
const geulsElement = document.querySelector('.geuls');
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
    });

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
    });

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
    });

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
    });
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
setCharGridCell(0, 12, '') // <- 여기에 글자 채우기

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
setCharGridCell(1, 12, '') // <- 여기에 글자 채우기

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
setCharGridCell(2, 12, '') // <- 여기에 글자 채우기

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
setCharGridCell(3, 12, '') // <- 여기에 글자 채우기

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
setCharGridCell(4, 12, '') // <- 여기에 글자 채우기

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
setCharGridCell(5, 12, '') // <- 여기에 글자 채우기

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
setCharGridCell(6, 12, '') // <- 여기에 글자 채우기






















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
const EYE_SPHERE_RADIUS_MULTIPLIER = 1; // <- --eye-r 대비 구 반지름. 1이어야 셰이더의 왜곡 0 지점(r=1)이 눈에 보이는 원(링/마스크) 경계와 정확히 겹친다.
const EYE_SPHERE_ZOOM_POWER = 2.2; // <- 동공 확대 배율. 1이면 확대 없음(배경과 완전히 동일), 클수록 중심이 더 세게 확대된다.

// 화면 픽셀 좌표를 그대로 world 좌표로 쓰기 위한 직교 카메라. left=0,right=dw,top=0,bottom=dh로
// 두면 화면처럼 원점이 왼쪽 위, y가 아래로 증가하는 좌표계가 그대로 맞아떨어진다.
let threeScene, threeCamera, threeRenderer, sphereLeft, sphereRight;

function initThreeScene() {
    if (!sphereCanvas) return;

    threeScene = new THREE.Scene();

    const dw = window.innerWidth;
    const dh = window.innerHeight;
    threeCamera = new THREE.OrthographicCamera(0, dw, 0, dh, 0.1, 2000);
    threeCamera.position.z = 1000;

    threeRenderer = new THREE.WebGLRenderer({ canvas: sphereCanvas, alpha: true, antialias: true });
    threeRenderer.setPixelRatio(window.devicePixelRatio || 1);
    threeRenderer.setSize(dw, dh);
    threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

    // 구를 정면(직교 카메라를 바라보는 면)에서 보면, 구 표면의 로컬 노멀 vNormal.xy가 바로
    // 그 프래그먼트의 화면상 오프셋(중심 대비, 반지름 1 = 구의 실제 반지름 uSphereRadiusPx)과
    // 정확히 같다. 이 성질을 이용해 "화면에 실제로 보였을 픽셀"을 역산한 뒤, 그 오프셋을
    // r^(zoom-1) 배로 줄여서 샘플링한다 — r=1(테두리)에서는 배율이 1이 되어 배경 화면과 완전히
    // 같은 픽셀을 보여주고(이음매 없이 자연스럽게 이어짐), r=0(동공 중심)로 갈수록 아주 좁은
    // 영역을 크게 확대해서 보여준다. flipY=false로 두고 landmark의 x/y(0~1, 좌상단 기준)를
    // 그대로 UV 기준으로 쓴다. x축은 배경 #webcam과 같은 미러(셀피) 방향으로 맞춰서 뺀다.
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.flipY = false;

    const eyeSphereVertexShader = `
        varying vec3 vNormal;
        void main() {
            vNormal = normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const eyeSphereFragmentShader = `
        varying vec3 vNormal;
        uniform sampler2D map;
        uniform vec2 uEyeUV;
        uniform vec2 uPixelsPerUV;
        uniform float uSphereRadiusPx;
        uniform float uZoomPower;
        void main() {
            vec2 n = vNormal.xy;
            float r = min(length(n), 1.0);
            float shrink = (r > 0.0001) ? pow(r, uZoomPower - 1.0) : 0.0;
            vec2 screenOffsetPx = uSphereRadiusPx * n * shrink;
            vec2 uv = vec2(
                uEyeUV.x - screenOffsetPx.x / uPixelsPerUV.x,
                uEyeUV.y + screenOffsetPx.y / uPixelsPerUV.y
            );
            gl_FragColor = texture2D(map, uv);
        }
    `;

    function makeEyeSphereMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                map: { value: videoTexture },
                uEyeUV: { value: new THREE.Vector2(0.5, 0.5) },
                uPixelsPerUV: { value: new THREE.Vector2(1, 1) },
                uSphereRadiusPx: { value: 0 },
                uZoomPower: { value: EYE_SPHERE_ZOOM_POWER }
            },
            vertexShader: eyeSphereVertexShader,
            fragmentShader: eyeSphereFragmentShader
        });
    }

    const sphereGeometry = new THREE.SphereGeometry(1, 48, 48);
    sphereLeft = new THREE.Mesh(sphereGeometry, makeEyeSphereMaterial());
    sphereRight = new THREE.Mesh(sphereGeometry, makeEyeSphereMaterial());
    sphereLeft.scale.set(0, 0, 0);
    sphereRight.scale.set(0, 0, 0);
    threeScene.add(sphereLeft, sphereRight);

    window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        threeCamera.right = w;
        threeCamera.bottom = h;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(w, h);
    });
}

// 눈이 인식되지 않을 때 구를 완전히 숨긴다.
function disableEyeSpheres() {
    if (!sphereLeft || !sphereRight) return;
    sphereLeft.scale.set(0, 0, 0);
    sphereRight.scale.set(0, 0, 0);
    threeRenderer.render(threeScene, threeCamera);
}

// 동공 위치(화면 좌표, y는 위에서부터)에 맞춰 구 위치/크기를 갱신하고, 구 표면에 비칠 영상도
// 각 눈의 홍채 UV(leftIrisUV/rightIrisUV, 0~1)를 중심으로 다시 잡아준 뒤 다시 그린다.
// pixelsPerUV(=vw*scale, vh*scale)는 화면 픽셀 오프셋을 UV 오프셋으로 되돌리기 위한 값으로,
// 셰이더가 "가장자리는 배경과 같은 픽셀, 중심은 확대"를 계산하는 데 그대로 쓰인다.
function updateEyeSpheres(leftEye, rightEye, radius, leftIrisUV, rightIrisUV, pixelsPerUV) {
    if (!sphereLeft || !sphereRight) return;
    const r = radius * EYE_SPHERE_RADIUS_MULTIPLIER;

    sphereLeft.position.set(leftEye.x, leftEye.y, 0);
    sphereLeft.scale.set(r, r, r);
    sphereLeft.material.uniforms.uEyeUV.value.set(leftIrisUV.x, leftIrisUV.y);
    sphereLeft.material.uniforms.uPixelsPerUV.value.set(pixelsPerUV.x, pixelsPerUV.y);
    sphereLeft.material.uniforms.uSphereRadiusPx.value = r;

    sphereRight.position.set(rightEye.x, rightEye.y, 0);
    sphereRight.scale.set(r, r, r);
    sphereRight.material.uniforms.uEyeUV.value.set(rightIrisUV.x, rightIrisUV.y);
    sphereRight.material.uniforms.uPixelsPerUV.value.set(pixelsPerUV.x, pixelsPerUV.y);
    sphereRight.material.uniforms.uSphereRadiusPx.value = r;

    threeRenderer.render(threeScene, threeCamera);
}

initThreeScene();

let faceLandmarker;
let lastVideoTime = -1;

// 눈 위치 측정은 처음부터 계속 돌아가지만, 마스크(원 뚫기)는 단어를 처음 클릭하고
// 3초가 지나야 화면에 나타난다.
const REVEAL_DELAY_MS = 3000;
let eyeRevealTriggered = false;

// 단어별로 span을 씌워서 마우스를 올린 단어만 폰트를 바꿀 수 있게 한다.
function wrapWordsInSpans(el) {
    const tokens = el.textContent.split(/(\s+)/);
    el.innerHTML = '';
    for (const token of tokens) {
        if (token === '' || /^\s+$/.test(token)) {
            el.appendChild(document.createTextNode(token));
        } else {
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = token;
            el.appendChild(span);
        }
    }
}

// 클릭한 단어를 기준으로 가까운 단어부터 순서대로 클릭한 단어로 바꾼다.
const WORD_SPREAD_STEP_MS = 40;

function spreadWordFromClick(clickedSpan) {
    const words = Array.from(pontElement.querySelectorAll('.word'));
    const clickedIndex = words.indexOf(clickedSpan);
    const clickedText = clickedSpan.textContent;

    words.forEach((word, i) => {
        if (i === clickedIndex) return;
        const distance = Math.abs(i - clickedIndex);
        setTimeout(() => {
            word.textContent = clickedText;
        }, distance * WORD_SPREAD_STEP_MS);
    });
}

if (pontElement) {
    wrapWordsInSpans(pontElement);
    pontElement.addEventListener('click', (e) => {
        const clickedSpan = e.target.closest('.word');
        if (!clickedSpan) return;
        spreadWordFromClick(clickedSpan);

        if (!eyeRevealTriggered) {
            eyeRevealTriggered = true;
            setTimeout(() => {
                pontElement.classList.add('eye-mask');
            }, REVEAL_DELAY_MS);
        }
    });
}

// geul 단어를 누르면, 클릭한 단어와 가까운(그리드상 거리) 단어부터 순서대로
// "고등어"로 바뀐다.
const GEUL_TARGET_WORD = '고등어';
const GEUL_SPREAD_STEP_MS = 900; // <- 단어 사이 전파 속도. 숫자만 바꾸면 즉시 반영된다.
const GEUL_GRID_COLUMNS = 4;
let geulSpreadTriggered = false;

function spreadGeulFromClick(clickedWord) {
    const words = Array.from(geulsElement.querySelectorAll('.geuls > div'));
    const clickedIndex = words.indexOf(clickedWord);
    if (clickedIndex === -1) return;

    const clickedRow = Math.floor(clickedIndex / GEUL_GRID_COLUMNS);
    const clickedCol = clickedIndex % GEUL_GRID_COLUMNS;

    words.forEach((word, i) => {
        const row = Math.floor(i / GEUL_GRID_COLUMNS);
        const col = i % GEUL_GRID_COLUMNS;
        const distance = Math.hypot(row - clickedRow, col - clickedCol);

        setTimeout(() => {
            word.textContent = GEUL_TARGET_WORD;
        }, distance * GEUL_SPREAD_STEP_MS);
    });
}

if (geulsElement) {
    geulsElement.addEventListener('click', (e) => {
        const clickedWord = e.target.closest('.geuls > div');
        if (!clickedWord || geulSpreadTriggered) return;
        geulSpreadTriggered = true;
        spreadGeulFromClick(clickedWord);
    });
}

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

// 눈(홍채) 위치를 화면 좌표로 변환해 마스크 구멍 위치/반경과 눈 확대 구를 갱신한다.
// 좌표 자체는 미러링 변환이 없으므로, 여기서는 화면에 실제로 보이는(미러링된) 좌표로 바꿔서 쓴다.
// .pont가 없어도(지금처럼 .geuls로 대체된 경우) 눈 추적/확대는 계속 동작해야 하므로
// pontElement 존재 여부로 이 함수 전체를 막지 않는다.
function updateEyeReveal(landmarks) {
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (!landmarks || !vw || !vh) {
        document.documentElement.style.setProperty('--eye-r', '0px');
        disableEyeSpheres();
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

    const dw = window.innerWidth;
    const dh = window.innerHeight;
    const scale = Math.max(dw / vw, dh / vh);
    const offsetX = (dw - vw * scale) / 2;
    const offsetY = (dh - vh * scale) / 2;

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

    // #webcam-eyes는 scaleX(-1)로 화면 전체가 미러링되므로, 마스크 구멍은 미러링되기 전
    // 좌표(= dw - 미러링된 좌표)에 뚫어야 결과적으로 --lx/--rx와 같은 화면 위치에 나타난다.
    root.setProperty('--vlx', `${dw - leftEye.x}px`);
    root.setProperty('--vly', `${leftEye.y}px`);
    root.setProperty('--vrx', `${dw - rightEye.x}px`);
    root.setProperty('--vry', `${rightEye.y}px`);

    const leftIrisUV = { x: landmarks[LEFT_IRIS_CENTER].x, y: landmarks[LEFT_IRIS_CENTER].y };
    const rightIrisUV = { x: landmarks[RIGHT_IRIS_CENTER].x, y: landmarks[RIGHT_IRIS_CENTER].y };
    const pixelsPerUV = { x: vw * scale, y: vh * scale };
    updateEyeSpheres(leftEye, rightEye, radius, leftIrisUV, rightIrisUV, pixelsPerUV);
}

function onResults(results) {
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        updateEyeReveal(results.faceLandmarks[0]);
    } else {
        updateEyeReveal(null);
    }
}

function renderLoop() {
    if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        const results = faceLandmarker.detectForVideo(videoElement, performance.now());
        onResults(results);
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
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
    });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } });
    videoElement.srcObject = stream;
    if (eyesVideoElement) eyesVideoElement.srcObject = stream;
    videoElement.addEventListener('loadeddata', () => {
        requestAnimationFrame(renderLoop);
    });
}

init();
