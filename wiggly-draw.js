const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let img = null;
let drawing = false;
let mode = 'draw';
let activeLayer = 'fg';
let color = '#ff3333';
let frame = 0;
let holdFrames = 3;

let fgStrokes = [], bgStrokes = [], current = null;
let noiseCache = new Map();

// undo/redo stacks
let fgUndo = [], bgUndo = [];
let fgRedo = [], bgRedo = [];

function setActiveButton(group, activeBtn) {
  group.forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

// Buttons
const bgBtn = document.getElementById('bgBtn');
const fgBtn = document.getElementById('fgBtn');
const drawBtn = document.getElementById('drawBtn');
const eraseBtn = document.getElementById('eraseBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const upload = document.getElementById('upload');
const thick = document.getElementById('thick');
const jitter = document.getElementById('jitter');
const speed = document.getElementById('speed');
const cursor = document.getElementById('cursor');

bgBtn.onclick = () => { activeLayer = 'bg'; setActiveButton([bgBtn, fgBtn], bgBtn); };
fgBtn.onclick = () => { activeLayer = 'fg'; setActiveButton([bgBtn, fgBtn], fgBtn); };
drawBtn.onclick = () => { mode = 'draw'; setActiveButton([drawBtn, eraseBtn], drawBtn); };
eraseBtn.onclick = () => { mode = 'erase'; setActiveButton([drawBtn, eraseBtn], eraseBtn); };
undoBtn.onclick = () => { undo(); };
redoBtn.onclick = () => { redo(); };

// Colors
document.querySelectorAll('[data-color]').forEach(b => {
  b.onclick = () => {
    color = b.dataset.color;
    setActiveButton(document.querySelectorAll('[data-color]'), b);
  };
});

// Upload image
upload.onchange = e => {
  const r = new FileReader();
  r.onload = ev => {
    img = new Image();
    img.onload = () => {
  // resize canvas to match image
  canvas.width = img.width;
  canvas.height = img.height;

  // draw image at full size
  ctx.drawImage(img, 0, 0);
};

    img.src = ev.target.result;
  };
  r.readAsDataURL(e.target.files[0]);
};

canvas.onmousedown = e => {
  drawing = true;
  if (mode === 'draw') {
    current = { layer: activeLayer, color, thick: parseInt(thick.value), id: Math.random(), pts: [] };
    (activeLayer === 'fg' ? fgStrokes : bgStrokes).push(current);
    // push to undo stack
    if (activeLayer === 'fg') fgUndo.push(current); else bgUndo.push(current);
    // clear redo
    if (activeLayer === 'fg') fgRedo = []; else bgRedo = [];
  }
};
canvas.onmouseup = () => drawing = false;

canvas.onmousemove = e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  cursor.style.left = e.clientX - 20 + 'px';
  cursor.style.top = e.clientY - 20 + 'px';
  cursor.style.width = '40px';
  cursor.style.height = '40px';
  cursor.style.display = mode === 'erase' ? 'block' : 'none';

  if (!drawing) return;

  if (mode === 'erase') { eraseAt(x, y); return; }
  current.pts.push({ x, y });
};

// eraser
function eraseAt(x, y) {
  const R = 20;
  function hit(s) { return s.pts.some(p => Math.hypot(p.x - x, p.y - y) < R); }
  fgStrokes = fgStrokes.filter(s => !hit(s));
  bgStrokes = bgStrokes.filter(s => !hit(s));
}

// undo/redo functions
function undo() {
  if (activeLayer === 'fg' && fgUndo.length) {
    const s = fgUndo.pop(); fgRedo.push(s);
    fgStrokes = fgStrokes.filter(st => st !== s);
  } else if (activeLayer === 'bg' && bgUndo.length) {
    const s = bgUndo.pop(); bgRedo.push(s);
    bgStrokes = bgStrokes.filter(st => st !== s);
  }
}
function redo() {
  if (activeLayer === 'fg' && fgRedo.length) {
    const s = fgRedo.pop(); fgUndo.push(s); fgStrokes.push(s);
  } else if (activeLayer === 'bg' && bgRedo.length) {
    const s = bgRedo.pop(); bgUndo.push(s); bgStrokes.push(s);
  }
}

// original-style jitter
function rand(v) { return (Math.random() - 0.5) * v * 2; }
function getNoise(key, j) { if (frame % holdFrames === 0 || !noiseCache.has(key)) noiseCache.set(key, rand(j)); return noiseCache.get(key); }
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

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawStrokes(bgStrokes);
  drawStrokes(fgStrokes);
  holdFrames = Math.max(1, 21 - parseInt(speed.value));
  frame++;
  requestAnimationFrame(render);
}
render();

canvas.onmousemove = e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // update cursor for eraser
  cursor.style.left = e.clientX - 20 + 'px';
  cursor.style.top = e.clientY - 20 + 'px';
  cursor.style.width = '40px';
  cursor.style.height = '40px';

  if (!drawing) return;

  if (mode === 'erase') { eraseAt(x, y); return; }

  current.pts.push({ x, y });
};

canvas.onmousedown = e => {
  drawing = true;
  
  // get scaled coordinates
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (mode === 'draw') {
    current = {
      layer: activeLayer,
      color,
      thick: parseInt(thick.value),
      id: Math.random(),
      pts: [{ x, y }] // start with first point
    };
    (activeLayer === 'fg' ? fgStrokes : bgStrokes).push(current);

    // push to undo stack
    if (activeLayer === 'fg') fgUndo.push(current);
    else bgUndo.push(current);
    // clear redo
    if (activeLayer === 'fg') fgRedo = []; else bgRedo = [];
  }
};

canvas.onmouseup = () => drawing = false;
canvas.onmouseleave = () => drawing = false; // important: stop drawing if mouse leaves
