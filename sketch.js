import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const videoElement = document.getElementById('webcam');
const pontElement = document.querySelector('.pont');

// 블렌드셰이프 점수(0~1) 기준 — 값이 높을수록 눈을 세게 감은 상태.
const BLINK_THRESHOLD = 0.4;
const OPEN_OPACITY = '1';
const CLOSED_OPACITY = '0.1';

// FaceLandmarker 478포인트 기준 홍채 중심/눈 양끝 인덱스.
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const EYE_HOLE_RADIUS_MULTIPLIER = 2; // <- 눈 폭 대비 구멍 반지름. 숫자만 바꾸면 즉시 반영된다.
const EYE_HOLE_SPACING_MULTIPLIER = 1.7; // <- 두 원 사이 간격. 1보다 크면 더 벌어지고, 작으면 좁아진다.

let faceLandmarker;
let lastVideoTime = -1;

// 원래는 눈 추적 원이 보이지 않다가, 단어를 처음 클릭하면 3초 뒤부터 나타난다.
const REVEAL_DELAY_MS = 3000;
let eyeRevealEnabled = false;
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
                eyeRevealEnabled = true;
                pontElement.classList.add('eye-mask');
            }, REVEAL_DELAY_MS);
        }
    });
}

// 눈(홍채) 위치를 화면 좌표로 변환해 .pont의 마스크 구멍 위치/반경을 갱신한다.
// .pont 자체는 미러링 변환이 없으므로, 여기서는 화면에 실제로 보이는(미러링된) 좌표로 바꿔서 쓴다.
function updateEyeReveal(landmarks) {
    if (!pontElement) return;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (!eyeRevealEnabled || !landmarks || !vw || !vh) {
        pontElement.style.setProperty('--eye-r', '0px');
        return;
    }

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

    pontElement.style.setProperty('--lx', `${leftEye.x}px`);
    pontElement.style.setProperty('--ly', `${leftEye.y}px`);
    pontElement.style.setProperty('--rx', `${rightEye.x}px`);
    pontElement.style.setProperty('--ry', `${rightEye.y}px`);
    pontElement.style.setProperty('--eye-r', `${radius}px`);
}

function onResults(results) {
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        updateEyeReveal(results.faceLandmarks[0]);
    } else {
        updateEyeReveal(null);
    }

    if (pontElement && results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        const categories = results.faceBlendshapes[0].categories;
        const blinkLeft = categories.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
        const blinkRight = categories.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;
        const blink = Math.max(blinkLeft, blinkRight);
        pontElement.style.opacity = blink > BLINK_THRESHOLD ? CLOSED_OPACITY : OPEN_OPACITY;
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
    videoElement.addEventListener('loadeddata', () => {
        requestAnimationFrame(renderLoop);
    });
}

init();
