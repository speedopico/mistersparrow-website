/***********************
 * Gradient Background *
 ***********************/
const colors = [
  ['#ff4d4d', '#6b00ff'],
  ['#ff9a4d', '#00eaff'],
  ['#6b00ff', '#ff4d4d'],
  ['#00eaff', '#ff9a4d']
];

let step = 0;
let colorIndices = [0, 1];
const gradientSpeed = 0.002;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolateColor(c1, c2, t) {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function updateGradient() {
  const c0_0 = hexToRgb(colors[colorIndices[0]][0]);
  const c0_1 = hexToRgb(colors[colorIndices[0]][1]);
  const c1_0 = hexToRgb(colors[colorIndices[1]][0]);
  const c1_1 = hexToRgb(colors[colorIndices[1]][1]);

  const t = step;

  const colorA = interpolateColor(c0_0, c1_0, t);
  const colorB = interpolateColor(c0_1, c1_1, t);

  document.body.style.background = `radial-gradient(circle at top left, ${colorA}, ${colorB})`;

  step += gradientSpeed;
  if (step >= 1) {
    step %= 1;
    colorIndices[0] = colorIndices[1];
    colorIndices[1] = (colorIndices[1] + 1) % colors.length;
  }

  requestAnimationFrame(updateGradient);
}

updateGradient();

/***********************
 * TV Static Animation *
 ***********************/
const canvas = document.getElementById('tvStatic');
const ctx = canvas.getContext('2d');

const width = canvas.width;
const height = canvas.height;

function drawStatic() {
  const imageData = ctx.createImageData(width, height);
  const buffer = imageData.data;

  for (let i = 0; i < buffer.length; i += 4) {
    // Pure black or white
    const val = Math.random() < 0.5 ? 0 : 255;
    buffer[i] = val;      // R
    buffer[i+1] = val;    // G
    buffer[i+2] = val;    // B
    buffer[i+3] = 150;    // alpha (0-255) semi-transparent
  }

  ctx.putImageData(imageData, 0, 0);
  requestAnimationFrame(drawStatic);
}

drawStatic();
