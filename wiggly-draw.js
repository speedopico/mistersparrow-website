// ===============================
// STATE
// ===============================
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');
const videoUpload = document.getElementById('videoUpload');
const upload = document.getElementById('upload');

let state = {
  usingVideo: false,
  img: null,
  drawing: false,
  mode: 'draw',
  activeLayer: 'fg',
  color: '#ff3333',
  frame: 0,
  holdFrames: 3,
  animateMode: false,
  echoMode: false,
  brushMode: 'normal',
  pencilDensity: 0.7,
  pencilRoughness: 0.4,
  speedScaling: false,
  animateShape: 'circle', 
  
  // ⭐ ADDED: SPEED SCALING STATE VARIABLES
  minThickness: 1,
  maxThickness: 200,
  speedHistory: [],
  smoothedSpeed: 0,
  lastPos: null,
  lastTime: null
};

let strokes = { fg: [], bg: [] };
let animatedStrokes = { fg: [], bg: [] };
let history = { fg: { undo: [], redo: [] }, bg: { undo: [], redo: [] } };
let current = null;
let noiseCache = new Map();

// UI elements
const thick = document.getElementById('thick');
const jitter = document.getElementById('jitter');
const speedSlider = document.getElementById('speed');
const animateCheckbox = document.getElementById('animateMode');
const echoCheckbox = document.getElementById('echoMode');
const playbackSlider = document.getElementById('playbackSpeed');
const playbackLabel = document.getElementById('playbackLabel');
const echoDelaySlider = document.getElementById('echoDelay');
const echoDelayLabel = document.getElementById('echoDelayLabel');
const echoCountSlider = document.getElementById('echoCount');
const echoCountLabel = document.getElementById('echoCountLabel');
const echoFadeSlider = document.getElementById('echoFade');
const echoFadeLabel = document.getElementById('echoFadeLabel');

// ===============================
// CANVAS SETUP
// ===============================
function initCanvas() {
  const container = document.querySelector('.canvas-main');
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = width;
  canvas.height = height;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ===============================
// MOUSE POSITION
// ===============================
function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
    time: Date.now() // ⭐ IMPORTANT: time property for speed calculation
  };
}

// ===============================
// ⭐ ADDED: SPEED SCALING FUNCTIONS
// ===============================
function calculateSpeed(pos) {
  if (!state.lastPos || !state.lastTime) return 0;
  
  const distance = Math.sqrt(
    Math.pow(pos.x - state.lastPos.x, 2) + 
    Math.pow(pos.y - state.lastPos.y, 2)
  );
  
  const timeDelta = pos.time - state.lastTime;
  if (timeDelta === 0) return 0;
  
  return distance / timeDelta; // pixels per millisecond
}

function updateSmoothedSpeed(rawSpeed) {
  state.speedHistory.push(rawSpeed);
  
  if (state.speedHistory.length > 10) {
    state.speedHistory.shift();
  }
  
  const sum = state.speedHistory.reduce((a, b) => a + b, 0);
  state.smoothedSpeed = sum / state.speedHistory.length;
  
  return state.smoothedSpeed;
}

function getThicknessFromSpeed(smoothedSpeed) {
  if (!state.speedScaling) return parseInt(thick.value, 10);
  
  const speedThresholdForMaxThinness = 2.0;
  const speedRatio = Math.min(smoothedSpeed / speedThresholdForMaxThinness, 1);
  
  if (!window.lastThickness) window.lastThickness = state.maxThickness;
  
  let targetThicknessRatio;
  
  if (speedRatio < 0.2) {
    targetThicknessRatio = 0.9 + (0.1 * (1 - speedRatio / 0.2));
  } else if (speedRatio < 0.6) {
    const zoneProgress = (speedRatio - 0.2) / 0.4;
    targetThicknessRatio = 0.9 - (zoneProgress * zoneProgress * 0.6);
  } else {
    const zoneProgress = (speedRatio - 0.6) / 0.4;
    targetThicknessRatio = 0.3 - (zoneProgress * 0.25);
  }
  
  const targetThickness = state.minThickness + 
    (targetThicknessRatio * (state.maxThickness - state.minThickness));
  
  const currentThickness = window.lastThickness;
  let newThickness;
  
  if (targetThickness < currentThickness) {
    newThickness = currentThickness * 0.05 + targetThickness * 0.95;
  } else {
    newThickness = currentThickness * 0.9 + targetThickness * 0.1;
  }
  
  window.lastThickness = newThickness;
  
  const minimumVisibleThickness = Math.max(state.minThickness, 6);
  return Math.max(minimumVisibleThickness, Math.min(state.maxThickness, newThickness));
}
// ⭐ END OF ADDED SPEED SCALING FUNCTIONS

// ===============================
// IMAGE LOADING
// ===============================
upload.addEventListener('change', function(e) {
  state.usingVideo = false;
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(event) {
    state.img = new Image();
    state.img.onload = function() {
      console.log("Image loaded:", state.img.width, "x", state.img.height);
      drawImageToCanvas();
    };
    state.img.onerror = function() {
      console.error("Failed to load image");
      state.img = null;
    };
    state.img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

function drawImageToCanvas() {
  if (state.img) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const imgRatio = state.img.width / state.img.height;
    const canvasRatio = canvas.width / canvas.height;
    
    let drawWidth, drawHeight, x, y;
    
    if (imgRatio > canvasRatio) {
      drawWidth = canvas.width;
      drawHeight = canvas.width / imgRatio;
      x = 0;
      y = (canvas.height - drawHeight) / 2;
    } else {
      drawHeight = canvas.height;
      drawWidth = canvas.height * imgRatio;
      x = (canvas.width - drawWidth) / 2;
      y = 0;
    }
    
    ctx.drawImage(state.img, x, y, drawWidth, drawHeight);
  }
}

// ===============================
// VIDEO LOADING
// ===============================
videoUpload.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  state.usingVideo = true;
  state.img = null;
  
  video.src = URL.createObjectURL(file);
  video.load();
  
  video.onloadeddata = function() {
    console.log("Video loaded:", video.videoWidth, "x", video.videoHeight);
  };
});

// ===============================
// DRAWING FUNCTIONS
// ===============================
function rand(v) { 
  return (Math.random() - 0.5) * v * 2; 
}

function getNoise(key, j) {
  if (state.frame % state.holdFrames === 0 || !noiseCache.has(key)) {
    noiseCache.set(key, rand(j));
  }
  return noiseCache.get(key);
}

// ===============================
// ANIMATION SETTINGS
// ===============================
if (animateCheckbox) {
  animateCheckbox.addEventListener('change', () => {
    state.animateMode = animateCheckbox.checked;
    console.log("Animate mode:", state.animateMode);
  });
}

if (echoCheckbox) {
  echoCheckbox.addEventListener('change', () => {
    state.echoMode = echoCheckbox.checked;
    console.log("Echo mode:", state.echoMode);
  });
}

if (playbackSlider && playbackLabel) {
  playbackSlider.addEventListener('input', () => {
    playbackLabel.textContent = `${playbackSlider.value}ms`;
  });
}

if (echoDelaySlider && echoDelayLabel) {
  echoDelaySlider.addEventListener('input', () => {
    echoDelayLabel.textContent = `${echoDelaySlider.value}ms`;
  });
}

if (echoCountSlider && echoCountLabel) {
  echoCountSlider.addEventListener('input', () => {
    echoCountLabel.textContent = echoCountSlider.value;
  });
}

if (echoFadeSlider && echoFadeLabel) {
  echoFadeSlider.addEventListener('input', () => {
    echoFadeLabel.textContent = `${echoFadeSlider.value}%`;
  });
}

// ===============================
// MOUSE EVENT HANDLERS
// ===============================
canvas.addEventListener('mousedown', function(e) {
  state.drawing = true;
  const pos = getMousePos(e);
  
  console.log("Mouse down at:", pos.x, pos.y, "Mode:", state.mode);

  // ⭐ ADDED: Initialize speed tracking for animation mode
  if (state.animateMode && state.speedScaling) {
    state.lastPos = pos;
    state.lastTime = pos.time;
    state.speedHistory = [];
    state.smoothedSpeed = 0;
  }

  if (state.mode === 'draw') {
    const initialThickness = parseInt(thick.value, 10);
    const now = performance.now();

    if (state.animateMode) {
      current = {
        layer: state.activeLayer,
        color: state.color,
        baseThickness: initialThickness,
        id: Math.random(),
        path: [{ 
          x: pos.x, 
          y: pos.y, 
          time: 0,
          thickness: initialThickness
        }],
        createdAt: now,
        echoAlpha: 1,
        isEcho: false,
        echoDelay: 0,
        hasSpeedScaling: state.speedScaling
      };
      animatedStrokes[state.activeLayer].push(current);
      console.log("Started animated stroke");
    } else {
      current = {
        layer: state.activeLayer,
        color: state.color,
        thick: initialThickness,
        id: Math.random(),
        pts: [{ x: pos.x, y: pos.y }],
        brushMode: state.brushMode
      };
      strokes[state.activeLayer].push(current);
      history[state.activeLayer].undo.push(current);
      history[state.activeLayer].redo = [];
      console.log("Started regular stroke, brush mode:", state.brushMode);
    }
  } else if (state.mode === 'erase') {
    eraseAt(pos.x, pos.y);
  }
});

canvas.addEventListener('mousemove', function(e) {
  const pos = getMousePos(e);
  
  if (!state.drawing) return;

  // ⭐ ADDED: Calculate current thickness with speed scaling
  let currentThickness = parseInt(thick.value, 10);
  
  if (state.animateMode && state.speedScaling && state.drawing) {
    if (state.lastPos && state.lastTime) {
      const rawSpeed = calculateSpeed(pos);
      const smoothedSpeed = updateSmoothedSpeed(rawSpeed);
      currentThickness = getThicknessFromSpeed(smoothedSpeed);
      
      // Update slider to show current thickness
      thick.value = Math.round(currentThickness);
      document.getElementById('thickValue').textContent = Math.round(currentThickness);
    }
    
    state.lastPos = pos;
    state.lastTime = pos.time;
  }

  if (state.mode === 'draw' && current) {
    if (state.animateMode) {
      const now = performance.now();
      const elapsed = now - current.createdAt;
      
      // ⭐ MODIFIED: Use currentThickness instead of thick.value
      current.path.push({ 
        x: pos.x, 
        y: pos.y, 
        time: elapsed,
        thickness: currentThickness
      });
    } else {
      current.pts.push({ x: pos.x, y: pos.y });
    }
  } else if (state.mode === 'erase') {
    eraseAt(pos.x, pos.y);
  }
});

canvas.addEventListener('mouseup', function() {
  if (state.drawing && current && state.animateMode && state.echoMode) {
    const echoDelay = echoDelaySlider ? parseInt(echoDelaySlider.value, 10) : 1000;
    const maxEchoCount = echoCountSlider ? parseInt(echoCountSlider.value, 10) : 3;
    const echoFade = echoFadeSlider ? parseInt(echoFadeSlider.value, 10) / 100 : 0.7;

    const pathDuration = current.path[current.path.length - 1].time;
    const realEchoCount = Math.min(maxEchoCount, Math.floor(pathDuration / echoDelay));

    for (let echoNum = 1; echoNum <= realEchoCount; echoNum++) {
      const minAlpha = 1 - echoFade;
      const alpha = minAlpha + (echoFade * (1 - echoNum / (realEchoCount + 1)));

      const echoStroke = {
        ...JSON.parse(JSON.stringify(current)),
        id: Math.random(),
        echoAlpha: alpha,
        isEcho: true,
        echoDelay: echoNum * echoDelay 
      };

      animatedStrokes[current.layer].push(echoStroke);
    }
  }

  state.drawing = false;
  current = null;
  
  // ⭐ ADDED: Reset speed tracking
  state.lastPos = null;
  state.lastTime = null;
  state.speedHistory = [];
  state.smoothedSpeed = 0;
  
  console.log("Mouse up");
});

canvas.addEventListener('mouseleave', function() {
  state.drawing = false;
  current = null;
  
  // ⭐ ADDED: Reset speed tracking
  state.lastPos = null;
  state.lastTime = null;
});

// ===============================
// ERASER
// ===============================
function eraseAt(x, y) {
  const R = 20;
  function hit(s) {
    if (s.pts) return s.pts.some(p => Math.hypot(p.x - x, p.y - y) < R);
    if (s.path) return s.path.some(p => Math.hypot(p.x - x, p.y - y) < R);
    return false;
  }
  strokes.fg = strokes.fg.filter(s => !hit(s));
  strokes.bg = strokes.bg.filter(s => !hit(s));
  animatedStrokes.fg = animatedStrokes.fg.filter(s => !hit(s));
  animatedStrokes.bg = animatedStrokes.bg.filter(s => !hit(s));
}

// ===============================
// DRAW STROKES
// ===============================
function drawStrokes(list) {
  const j = parseFloat(jitter.value);
  list.forEach(s => {
    if (s.brushMode === 'pencil') {
      drawPencilStroke(s, j);
    } else {
      drawNormalStroke(s, j);
    }
  });
}

function drawNormalStroke(s, j) {
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
}

function drawPencilStroke(s, j) {
  const baseThickness = Math.max(1, s.thick * 0.15);
  const sketchCount = Math.max(1, Math.floor(state.pencilDensity * 3));
  
  for (let sketch = 0; sketch < sketchCount; sketch++) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = baseThickness * (0.8 + Math.random() * 0.4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    let isDrawing = true;
    let segmentStart = 0;
    
    s.pts.forEach((p, i) => {
      const roughness = state.pencilRoughness * 8;
      const x = p.x + getNoise(s.id + 'x' + i + sketch * 1000, j + roughness);
      const y = p.y + getNoise(s.id + 'y' + i + sketch * 1000, j + roughness);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const liftChance = 0.03 + (state.pencilRoughness * 0.02);
        if (Math.random() < liftChance && (i - segmentStart) > 3) {
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          segmentStart = i;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();
  }
}

// ===============================
// ANIMATION FUNCTIONS
// ===============================
function getPositionAtTime(path, targetTime) {
  if (!path.length) return null;
  if (targetTime <= 0) return path[0];

  for (let i = 0; i < path.length - 1; i++) {
    if (path[i].time <= targetTime && path[i + 1].time > targetTime) {
      return path[i];
    }
  }
  return path[path.length - 1];
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawAnimatedStrokes(list, globalNow) {
  const echoDelay = echoDelaySlider ? parseInt(echoDelaySlider.value, 10) : 1000;
  const echoCount = echoCountSlider ? parseInt(echoCountSlider.value, 10) : 3;
  const sliderVal = playbackSlider ? parseFloat(playbackSlider.value) : 1;
  const speedFactor = 1 / (sliderVal > 0 ? sliderVal : 1);

  list.forEach((s) => {
    if (!s.path || s.path.length < 1) return;

    const pathDuration = s.path[s.path.length - 1].time || 1;

    if (state.drawing && current === s) {
      const elapsed = (globalNow - s.createdAt) * speedFactor;
      if (state.echoMode) {
        for (let echoNum = echoCount; echoNum >= 0; echoNum--) {
          const t = elapsed - (echoNum * echoDelay);
          if (t < 0) continue;
          const pos = getPositionAtTime(s.path, t);
          if (!pos) continue;

          const alpha = 0.3 + (0.7 * (1 - echoNum / (echoCount + 1)));
          ctx.fillStyle = s.color.startsWith('#') 
            ? hexToRgba(s.color, alpha) 
            : s.color;
          
          const dotSize = pos.thickness || s.baseThickness;
          if (state.animateShape === 'square') {
          const halfSize = dotSize / 2;
          ctx.fillRect(pos.x - halfSize, pos.y - halfSize, dotSize, dotSize);
        } else {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        }
      } else {
        const currentPos = s.path[s.path.length - 1];
        ctx.fillStyle = s.color;
        
        const dotSize = currentPos.thickness || s.baseThickness;
        if (state.animateShape === 'square') {
          const halfSize = dotSize / 2;
          ctx.fillRect(currentPos.x - halfSize, currentPos.y - halfSize, dotSize, dotSize);
        } else {
          ctx.beginPath();
          ctx.arc(currentPos.x, currentPos.y, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    const baseElapsed = globalNow - s.createdAt;
    const delay = s.echoDelay || 0;
    const effectiveElapsed = (baseElapsed - delay) * speedFactor;
    
    if (effectiveElapsed < 0) return; 

    const frameDt = 16.67;
    const timeStep = frameDt * speedFactor;
    
    const loopedTime = effectiveElapsed % pathDuration;
    const prevTimeRaw = effectiveElapsed - timeStep;
    const prevLoopedTime = prevTimeRaw % pathDuration;

    const hasLooped = loopedTime < prevLoopedTime || prevTimeRaw < 0;

    const pos = getPositionAtTime(s.path, loopedTime);
    const prevPos = hasLooped ? pos : getPositionAtTime(s.path, Math.max(0, prevLoopedTime));

    if (!pos || !prevPos) return;

    const alpha = s.echoAlpha || 1;
    const dx = pos.x - prevPos.x;
    const dy = pos.y - prevPos.y;
    const dist = Math.hypot(dx, dy);

    const dotSize = pos.thickness || s.baseThickness;
    const prevDotSize = prevPos.thickness || s.baseThickness;

    if (dist > (dotSize * 0.75) && !hasLooped) {
      const blurAlpha = Math.min(alpha, 0.6);
      
      // ⭐ DRAW MOTION BLUR BASED ON SHAPE
      if (state.animateShape === 'square') {
        // For squares, draw multiple squares along the path
        ctx.fillStyle = s.color.startsWith('#') 
          ? hexToRgba(s.color, blurAlpha * 0.5) 
          : s.color;
        
        const steps = Math.ceil(dist / (dotSize * 0.3));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = prevPos.x + (pos.x - prevPos.x) * t;
          const y = prevPos.y + (pos.y - prevPos.y) * t;
          const size = prevDotSize + (dotSize - prevDotSize) * t;
          const halfSize = size / 2;
          ctx.fillRect(x - halfSize, y - halfSize, size, size);
        }
      } else {
        // Original circle motion blur
        ctx.strokeStyle = s.color.startsWith('#') 
          ? hexToRgba(s.color, blurAlpha) 
          : s.color;
        
        const avgThickness = (dotSize + prevDotSize) / 2;
        ctx.lineWidth = avgThickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(prevPos.x, prevPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = s.color.startsWith('#') 
        ? hexToRgba(s.color, alpha) 
        : s.color;
      
      // ⭐ DRAW SHAPE BASED ON animateShape STATE
      if (state.animateShape === 'square') {
        const halfSize = dotSize / 2;
        ctx.fillRect(pos.x - halfSize, pos.y - halfSize, dotSize, dotSize);
      } else {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

// ===============================
// UI CONTROLS SETUP
// ===============================
function setupUIControls() {
  document.getElementById('bgBtn').addEventListener('click', function() {
    state.activeLayer = 'bg';
    document.getElementById('bgBtn').classList.add('active');
    document.getElementById('fgBtn').classList.remove('active');
    updateStatusBar();
  });
  
  document.getElementById('fgBtn').addEventListener('click', function() {
    state.activeLayer = 'fg';
    document.getElementById('fgBtn').classList.add('active');
    document.getElementById('bgBtn').classList.remove('active');
    updateStatusBar();
  });
  
  document.getElementById('drawBtn').addEventListener('click', function() {
    state.mode = 'draw';
    document.getElementById('drawBtn').classList.add('active');
    document.getElementById('eraseBtn').classList.remove('active');
    updateStatusBar();
  });
  
  document.getElementById('eraseBtn').addEventListener('click', function() {
    state.mode = 'erase';
    document.getElementById('eraseBtn').classList.add('active');
    document.getElementById('drawBtn').classList.remove('active');
    updateStatusBar();
  });
  
  document.getElementById('pencilModeBtn').addEventListener('click', function() {
    state.brushMode = state.brushMode === 'normal' ? 'pencil' : 'normal';
    this.classList.toggle('active', state.brushMode === 'pencil');
    this.textContent = state.brushMode === 'normal' ? 'Normal' : 'Pencil';
    updateStatusBar();
  });
  
  // ⭐ MODIFIED: Speed scaling button now resets tracking
  document.getElementById('speedScaleBtn').addEventListener('click', function() {
    state.speedScaling = !state.speedScaling;
    const isOn = state.speedScaling;
    this.classList.toggle('active', isOn);
    this.textContent = isOn ? 'Speed: ON' : 'Speed: OFF';
    
    // Reset speed tracking
    state.speedHistory = [];
    state.smoothedSpeed = 0;
    state.lastPos = null;
    state.lastTime = null;
  });

    document.getElementById('shapeBtn').addEventListener('click', function() {
    state.animateShape = state.animateShape === 'circle' ? 'square' : 'circle';
    this.textContent = state.animateShape === 'circle' ? '●' : '■';
    this.classList.toggle('active', state.animateShape === 'square');
  });
  
  document.getElementById('undoBtn').addEventListener('click', function() {
    const h = history[state.activeLayer];
    if (h.undo.length > 0) {
      const stroke = h.undo.pop();
      h.redo.push(stroke);
      strokes[state.activeLayer] = strokes[state.activeLayer].filter(s => s !== stroke);
    }
  });
  
  document.getElementById('redoBtn').addEventListener('click', function() {
    const h = history[state.activeLayer];
    if (h.redo.length > 0) {
      const stroke = h.redo.pop();
      h.undo.push(stroke);
      strokes[state.activeLayer].push(stroke);
    }
  });
  
  document.getElementById('clearBtn').addEventListener('click', function() {
    strokes = { fg: [], bg: [] };
    animatedStrokes = { fg: [], bg: [] };
    history = { fg: { undo: [], redo: [] }, bg: { undo: [], redo: [] } };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawImageToCanvas();
  });
  
  document.querySelectorAll('[data-color]').forEach(button => {
    button.addEventListener('click', function() {
      state.color = this.dataset.color;
      document.querySelectorAll('[data-color]').forEach(btn => btn.classList.remove('active'));
      this.classList.add('active');
    });
  });
  
  document.getElementById('playBtn').addEventListener('click', function() {
    if (video.src) video.play();
  });
  
  document.getElementById('pauseBtn').addEventListener('click', function() {
    video.pause();
  });
  
  const thickSlider = document.getElementById('thick');
  const jitterSlider = document.getElementById('jitter');
  const pencilDensitySlider = document.getElementById('pencilDensity');
  const pencilRoughnessSlider = document.getElementById('pencilRoughness');
  
  thickSlider.addEventListener('input', function() {
    document.getElementById('thickValue').textContent = this.value;
  });
  
  jitterSlider.addEventListener('input', function() {
    document.getElementById('jitterValue').textContent = this.value;
  });
  
  speedSlider.addEventListener('input', function() {
    document.getElementById('speedValue').textContent = this.value;
  });
  
  if (pencilDensitySlider) {
    pencilDensitySlider.addEventListener('input', function() {
      state.pencilDensity = parseFloat(this.value);
      document.getElementById('pencilDensityLabel').textContent = this.value;
    });
  }
  
  if (pencilRoughnessSlider) {
    pencilRoughnessSlider.addEventListener('input', function() {
      state.pencilRoughness = parseFloat(this.value);
      document.getElementById('pencilRoughnessLabel').textContent = this.value;
    });
  }
}

// ===============================
// STATUS BAR
// ===============================
function updateStatusBar() {
  document.getElementById('currentLayer').textContent = state.activeLayer.toUpperCase();
  document.getElementById('currentMode').textContent = state.mode.charAt(0).toUpperCase() + state.mode.slice(1);
  document.getElementById('currentBrush').textContent = state.brushMode.charAt(0).toUpperCase() + state.brushMode.slice(1);
}

// ===============================
// RENDER LOOP
// ===============================
function render() {
  const now = performance.now();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.usingVideo && video.readyState >= 2) {
    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = canvas.width / canvas.height;
    
    let drawWidth, drawHeight, x, y;
    
    if (videoRatio > canvasRatio) {
      drawWidth = canvas.width;
      drawHeight = canvas.width / videoRatio;
      x = 0;
      y = (canvas.height - drawHeight) / 2;
    } else {
      drawHeight = canvas.height;
      drawWidth = canvas.height * videoRatio;
      x = (canvas.width - drawWidth) / 2;
      y = 0;
    }
    
    ctx.drawImage(video, x, y, drawWidth, drawHeight);
  } else if (state.img) {
    drawImageToCanvas();
  }

  drawStrokes(strokes.bg);
  drawAnimatedStrokes(animatedStrokes.bg, now);
  drawStrokes(strokes.fg);
  drawAnimatedStrokes(animatedStrokes.fg, now);

  state.holdFrames = Math.max(1, 21 - parseInt(speedSlider.value, 10));
  state.frame++;

  requestAnimationFrame(render);
}

// ===============================
// INITIALIZATION
// ===============================
function init() {
  initCanvas();
  setupUIControls();
  
  const firstColorBtn = document.querySelector('[data-color]');
  if (firstColorBtn) {
    firstColorBtn.click();
  }
  
  document.getElementById('fgBtn').click();
  document.getElementById('drawBtn').click();
  updateStatusBar();
  
  window.addEventListener('resize', function() {
    setTimeout(initCanvas, 100);
  });
  
  render();
  
  console.log("Wiggly Draw initialized successfully!");
}

document.addEventListener('DOMContentLoaded', init);

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && !e.repeat) {
    e.preventDefault();
    document.getElementById('undoBtn').click();
  }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'y' && !e.repeat) {
    e.preventDefault();
    document.getElementById('redoBtn').click();
  }
  else if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.repeat) {
    e.preventDefault();
    document.getElementById('redoBtn').click();
  }
});