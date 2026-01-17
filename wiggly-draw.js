// =====================================================
// STATE
// =====================================================

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const video = document.getElementById('video');
const videoUpload = document.getElementById('videoUpload');
const upload = document.getElementById('upload');

let state = {
  usingVideo: false,
  img: null,

  drawing: false,
  mode: 'draw',          // "draw" or "erase"
  activeLayer: 'fg',     // "fg" or "bg"
  color: '#ff3333',

  frame: 0,
  holdFrames: 3,
};

let strokes = {
  fg: [],
  bg: [],
};

let history = {
  fg: { undo: [], redo: [] },
  bg: { undo: [], redo: [] },
};

let current = null;
let noiseCache = new Map();

// UI refs
const thick = document.getElementById('thick');
const jitter = document.getElementById('jitter');
const speed = document.getElementById('speed');
const cursor = document.getElementById('cursor');

// =====================================================
// HELPERS
// =====================================================

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function setActiveButton(group, activeBtn) {
  group.forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

function rand(v) {
  return (Math.random() - 0.5) * v * 2;
}

function getNoise(key, j) {
  if (state.frame % state.holdFrames === 0 || !noiseCache.has(key)) {
    noiseCache.set(key, rand(j));
  }
  return noiseCache.get(key);
}

// =====================================================
// MEDIA LOADING
// =====================================================

function resizeCanvasToMedia(width, height) {
  const maxW = window.innerWidth * 0.9;
  const maxH = window.innerHeight * 0.8;
  const scale = Math.min(maxW / width, maxH / height);

  canvas.width = width * scale;
  canvas.height = height * scale;
}

upload.onchange = e => {
  state.usingVideo = false;

  const r = new FileReader();
  r.onload = ev => {
    state.img = new Image();
    state.img.onload = () => {
      resizeCanvasToMedia(state.img.width, state.img.height);
    };
    state.img.src = ev.target.result;
  };

  r.readAsDataURL(e.target.files[0]);
};

videoUpload.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  state.usingVideo = true;
  video.src = URL.createObjectURL(file);
  video.play();

  video.onloadedmetadata = () => {
    resizeCanvasToMedia(video.videoWidth, video.videoHeight);
  };
};

// =====================================================
// DRAWING
// =====================================================

canvas.onmousedown = e => {
  state.drawing = true;

  const { x, y } = getMousePos(e);

  if (state.mode === 'draw') {
    current = {
      layer: state.activeLayer,
      color: state.color,
      thick: parseInt(thick.value),
      id: Math.random(),
      pts: [{ x, y }]
    };
    strokes[state.activeLayer].push(current);
    history[state.activeLayer].undo.push(current);
    history[state.activeLayer].redo = [];
  }
};

canvas.onmousemove = e => {
  const { x, y } = getMousePos(e);

  // Eraser cursor
  if (state.mode === 'erase') {
    cursor.style.display = 'block';
    cursor.style.left = `${e.clientX - cursor.offsetWidth/2}px`;
    cursor.style.top = `${e.clientY - cursor.offsetHeight/2}px`;
  } else {
    cursor.style.display = 'none';
  }

  if (!state.drawing) return;

  if (state.mode === 'draw' && current) {
    current.pts.push({ x, y });
  } else if (state.mode === 'erase') {
    eraseAt(x, y);
  }
};

canvas.onmouseup = () => state.drawing = false;
canvas.onmouseleave = () => state.drawing = false;

// =====================================================
// ERASER
// =====================================================

function eraseAt(x, y) {
  const R = 20;

  function hit(s) {
    return s.pts.some(p => Math.hypot(p.x - x, p.y - y) < R);
  }

  strokes.fg = strokes.fg.filter(s => !hit(s));
  strokes.bg = strokes.bg.filter(s => !hit(s));
}

// =====================================================
// UNDO / REDO
// =====================================================

function undo() {
  const h = history[state.activeLayer];
  if (!h.undo.length) return;
  const s = h.undo.pop();
  h.redo.push(s);
  strokes[state.activeLayer] = strokes[state.activeLayer].filter(st => st !== s);
}

function redo() {
  const h = history[state.activeLayer];
  if (!h.redo.length) return;
  const s = h.redo.pop();
  h.undo.push(s);
  strokes[state.activeLayer].push(s);
}

// =====================================================
// DRAW RENDERING
// =====================================================

function drawStrokes(list) {
  const j = parseFloat(jitter.value);
  list.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.thick;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    s.pts.forEach((p, i) => {
      const x = p.x + getNoise(s.id + 'x' + i, j);
      const y = p.y + getNoise(s.id + 'y' + i, j);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

// =====================================================
// VIDEO / IMAGE DRAW
// =====================================================

function drawMedia() {
  if (state.usingVideo && video.readyState >= 2) {
    // maintain aspect ratio
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.min(canvas.width / vw, canvas.height / vh);
    const w = vw * scale;
    const h = vh * scale;
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, w, h);
  } else if (state.img) {
    const iw = state.img.width;
    const ih = state.img.height;
    const scale = Math.min(canvas.width / iw, canvas.height / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.drawImage(state.img, 0, 0, iw, ih, 0, 0, w, h);
  }
}

// =====================================================
// UI BUTTONS
// =====================================================

document.getElementById('bgBtn').onclick = () => state.activeLayer = 'bg';
document.getElementById('fgBtn').onclick = () => state.activeLayer = 'fg';
document.getElementById('drawBtn').onclick = () => state.mode = 'draw';
document.getElementById('eraseBtn').onclick = () => state.mode = 'erase';
document.getElementById('undoBtn').onclick = undo;
document.getElementById('redoBtn').onclick = redo;
document.getElementById('clearBtn').onclick = () => {
  strokes.fg = [];
  strokes.bg = [];
  history.fg = { undo: [], redo: [] };
  history.bg = { undo: [], redo: [] };
};

document.querySelectorAll('[data-color]').forEach(b => {
  b.onclick = () => state.color = b.dataset.color;
});

// =====================================================
// RENDER LOOP
// =====================================================

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMedia();
  drawStrokes(strokes.bg);
  drawStrokes(strokes.fg);

  state.holdFrames = Math.max(1, 21 - parseInt(speed.value));
  state.frame++;
  requestAnimationFrame(render);
}

render();