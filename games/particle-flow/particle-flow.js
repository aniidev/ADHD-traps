class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.history = [];
    this.maxHistory = 20;
  }

  update(flowField, flowSpeed) {
    const x = Math.floor(this.x / fieldScale);
    const y = Math.floor(this.y / fieldScale);
    const index = x + y * cols;

    if (index < 0 || index >= flowField.length) {
      this.reset();
      return;
    }

    const force = flowField[index];
    this.vx += force.x * flowSpeed;
    this.vy += force.y * flowSpeed;

    // Add some drag
    this.vx *= 0.99;
    this.vy *= 0.99;

    this.x += this.vx;
    this.y += this.vy;

    // Store position history for trails
    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = 0;
    this.vy = 0;
    this.history = [];
  }

  draw(ctx, showTrails) {
    if (showTrails) {
      ctx.beginPath();
      ctx.moveTo(this.history[0].x, this.history[0].y);
      for (let i = 1; i < this.history.length; i++) {
        ctx.lineTo(this.history[i].x, this.history[i].y);
      }
      ctx.strokeStyle = `rgba(0, 255, 135, ${0.1})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const hue = (speed * 50) % 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
  }
}

// Canvas setup
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let width, height;
let cols, rows;
let fieldScale = 50;
let flowField = [];
let particles = [];
let isRunning = false;
let showTrails = true;
let animationFrameId = null;
let lastTime = 0;
const FPS = 60;
const frameInterval = 1000 / FPS;

// UI Elements
const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');
const particleCountSlider = document.getElementById('particleCount');
const particleCountValue = document.getElementById('particleCountValue');
const flowSpeedSlider = document.getElementById('flowSpeed');
const flowSpeedValue = document.getElementById('flowSpeedValue');
const fieldScaleSlider = document.getElementById('fieldScale');
const fieldScaleValue = document.getElementById('fieldScaleValue');
const colorToggle = document.getElementById('colorToggle');
const trailToggle = document.getElementById('trailToggle');

function resizeCanvas() {
  width = canvas.parentElement.clientWidth;
  height = canvas.parentElement.clientHeight;
  canvas.width = width;
  canvas.height = height;
  cols = Math.floor(width / fieldScale);
  rows = Math.floor(height / fieldScale);
  initFlowField();
  initParticles();
}

function initFlowField() {
  flowField = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const angle = noise(x * 0.1, y * 0.1) * Math.PI * 2;
      const v = {
        x: Math.cos(angle),
        y: Math.sin(angle)
      };
      flowField.push(v);
    }
  }
}

function initParticles() {
  particles = [];
  const count = parseInt(particleCountSlider.value);
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(
      Math.random() * width,
      Math.random() * height
    ));
  }
}

function noise(x, y) {
  return Math.sin(x * 0.01 + y * 0.01) * Math.cos(x * 0.01 - y * 0.01);
}

function animate(timestamp) {
  if (!isRunning) {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    return;
  }

  const elapsed = timestamp - lastTime;

  if (elapsed > frameInterval) {
    lastTime = timestamp - (elapsed % frameInterval);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);

    const flowSpeed = parseFloat(flowSpeedSlider.value);

    particles.forEach(particle => {
      particle.update(flowField, flowSpeed);
      particle.draw(ctx, showTrails);
    });
  }

  animationFrameId = requestAnimationFrame(animate);
}

// Event Listeners
window.addEventListener('resize', resizeCanvas);
startButton.addEventListener('click', () => {
  isRunning = !isRunning;
  startButton.textContent = isRunning ? 'Pause' : 'Start';
  if (isRunning && !animationFrameId) {
    lastTime = performance.now();
    animate(lastTime);
  }
});
resetButton.addEventListener('click', () => {
  initParticles();
  initFlowField();
});

particleCountSlider.addEventListener('input', () => {
  particleCountValue.textContent = particleCountSlider.value;
  initParticles();
});

flowSpeedSlider.addEventListener('input', () => {
  flowSpeedValue.textContent = flowSpeedSlider.value;
});

fieldScaleSlider.addEventListener('input', () => {
  fieldScale = parseInt(fieldScaleSlider.value);
  fieldScaleValue.textContent = fieldScale;
  resizeCanvas();
});

trailToggle.addEventListener('click', () => {
  showTrails = !showTrails;
  trailToggle.textContent = `Trails: ${showTrails ? 'ON' : 'OFF'}`;
});

// Initialize
resizeCanvas();
initParticles();
isRunning = true;
startButton.textContent = 'Pause';
lastTime = performance.now();
animate(lastTime); 