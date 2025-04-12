document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('pendulumCanvas');
  const ctx = canvas.getContext('2d');
  const alignmentCountElement = document.getElementById('alignmentCount');
  const startButton = document.getElementById('startButton');
  const resetButton = document.getElementById('resetButton');
  const pendulumCountSlider = document.getElementById('pendulumCount');
  const pendulumCountValue = document.getElementById('pendulumCountValue');
  const gravitySlider = document.getElementById('gravitySlider');
  const gravityValue = document.getElementById('gravityValue');
  const lengthVariationSlider = document.getElementById('lengthVariation');
  const lengthVariationValue = document.getElementById('lengthValue');
  const soundToggle = document.getElementById('soundToggle');
  const trailToggle = document.getElementById('trailToggle');

  // Set canvas dimensions
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  // Audio context for sound generation
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContext();
  let isSoundEnabled = false;
  let isTrailEnabled = true;

  // Game variables
  let animationId;
  let isRunning = false;
  let alignmentCount = 0;
  let pendulums = [];
  let trailPositions = [];
  let lastAlignmentCheck = 0;
  let lastTimestamp = null;
  const ALIGNMENT_CHECK_INTERVAL = 200; // ms
  const ALIGNMENT_THRESHOLD = 0.1; // radians

  // Physics settings
  let gravity = 1.0;
  let dampingFactor = 0.998; // Subtle damping to prevent pendulum from gaining energy
  const pendulumColors = [
    '#04befe', '#4481eb', '#7a36ff', '#c331ff', '#f24ba3',
    '#04d0ff', '#14c2ff', '#24b4ff', '#34a6ff', '#4498ff',
    '#5a6bff', '#705fff', '#8653ff', '#9c47ff', '#b23bff',
    '#c82fff', '#de23ff', '#f417ff', '#ff5ad0', '#ff71b3'
  ];

  // Initialize
  function init() {
    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Reset counters
    alignmentCount = 0;
    alignmentCountElement.textContent = alignmentCount;

    // Update controls
    updateControlValues();

    // Create pendulums
    createPendulums();

    // Draw initial state
    draw();
  }

  // Update control display values
  function updateControlValues() {
    const numPendulums = parseInt(pendulumCountSlider.value);
    pendulumCountValue.textContent = numPendulums;

    gravity = parseFloat(gravitySlider.value);
    gravityValue.textContent = gravity.toFixed(1);

    const lengthVar = parseInt(lengthVariationSlider.value);
    lengthVariationValue.textContent = lengthVar;
  }

  // Create pendulums with varying lengths
  function createPendulums() {
    const numPendulums = parseInt(pendulumCountSlider.value);
    const lengthVar = parseInt(lengthVariationSlider.value) / 100;
    const baseLength = canvas.height * 0.7; // Increased base pendulum length for more visibility

    pendulums = [];
    trailPositions = [];

    // Single anchor point for all pendulums
    const anchorX = canvas.width / 2;
    const anchorY = 60; // Fixed y position near the top

    for (let i = 0; i < numPendulums; i++) {
      // Calculate length - shorter pendulums oscillate faster
      const ratio = i / (numPendulums - 1 || 1);
      const length = baseLength * (1 - (ratio * lengthVar));

      pendulums.push({
        x: anchorX, // All pendulums at same x position
        y: anchorY, // All pendulums at same y position
        length: length,
        angle: Math.PI / 3, // Initial angle (60 degrees)
        angularVelocity: 0,
        angularAcceleration: 0,
        color: pendulumColors[i % pendulumColors.length],
        mass: 30 - (ratio * 20), // Varying mass (not physically necessary but visually nice)
        frequency: calculateFrequency(length)
      });

      // Initialize empty trail arrays for each pendulum
      trailPositions.push([]);
    }
  }

  // Calculate natural frequency of pendulum
  function calculateFrequency(length) {
    // f = (1/2π) * √(g/L)
    return 1 / (2 * Math.PI) * Math.sqrt(gravity / (length / 100));
  }

  // Update pendulum physics
  function update(deltaTime) {
    for (let i = 0; i < pendulums.length; i++) {
      const p = pendulums[i];

      // Calculate angular acceleration (a = -g/L * sin(θ))
      p.angularAcceleration = -gravity / p.length * Math.sin(p.angle);

      // Update angular velocity
      p.angularVelocity += p.angularAcceleration;
      p.angularVelocity *= dampingFactor; // Apply damping

      // Update angle
      p.angle += p.angularVelocity;

      // Calculate bob position
      const bobX = p.x + Math.sin(p.angle) * p.length;
      const bobY = p.y + Math.cos(p.angle) * p.length;

      // Add to trail if enabled
      if (isTrailEnabled) {
        if (trailPositions[i].length > 30) {
          trailPositions[i].shift();
        }
        trailPositions[i].push({ x: bobX, y: bobY });
      } else {
        trailPositions[i] = [];
      }
    }

    // Check for alignments periodically
    const now = Date.now();
    if (now - lastAlignmentCheck > ALIGNMENT_CHECK_INTERVAL) {
      checkAlignments();
      lastAlignmentCheck = now;
    }
  }

  // Check if pendulums are aligned
  function checkAlignments() {
    // Sort pendulums into groups based on similar angles
    const groups = [];

    for (const p of pendulums) {
      let foundGroup = false;

      for (const group of groups) {
        const referenceAngle = group[0].angle;
        // Check if pendulum is aligned with this group
        if (Math.abs(normalizeAngle(p.angle) - normalizeAngle(referenceAngle)) < ALIGNMENT_THRESHOLD) {
          group.push(p);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.push([p]);
      }
    }

    // Look for significant alignments (3 or more pendulums)
    for (const group of groups) {
      if (group.length >= 3) {
        // Alignment detected
        alignmentCount++;
        alignmentCountElement.textContent = alignmentCount;

        // Visual feedback for alignment
        createAlignmentEffect(group);

        // Audio feedback for alignment
        if (isSoundEnabled) {
          playAlignmentSound(group);
        }
      }
    }
  }

  // Normalize angle to 0-2π range
  function normalizeAngle(angle) {
    return (angle + 2 * Math.PI) % (2 * Math.PI);
  }

  // Create visual effect for alignment
  function createAlignmentEffect(group) {
    // Calculate average position of aligned pendulums
    let avgX = 0;
    let avgY = 0;
    for (const p of group) {
      const bobX = p.x + Math.sin(p.angle) * p.length;
      const bobY = p.y + Math.cos(p.angle) * p.length;
      avgX += bobX;
      avgY += bobY;
    }
    avgX /= group.length;
    avgY /= group.length;

    // Draw radial glow at alignment point
    const glow = ctx.createRadialGradient(avgX, avgY, 0, avgX, avgY, 50);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    glow.addColorStop(0.5, 'rgba(4, 190, 254, 0.3)');
    glow.addColorStop(1, 'rgba(4, 190, 254, 0)');

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(avgX, avgY, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Play sound for alignment
  function playAlignmentSound(group) {
    // Create oscillator
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set up a harmonic sound based on the frequency of aligned pendulums
    const avgFrequency = group.reduce((sum, p) => sum + p.frequency, 0) / group.length;
    const baseFrequency = 220 + avgFrequency * 100;

    oscillator.type = 'sine';
    oscillator.frequency.value = baseFrequency;

    // Volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);

    // Start and stop
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1);
  }

  // Draw game
  function draw() {
    // Semi-transparent background to create trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw pendulums
    for (let i = 0; i < pendulums.length; i++) {
      const p = pendulums[i];

      // Calculate bob position
      const bobX = p.x + Math.sin(p.angle) * p.length;
      const bobY = p.y + Math.cos(p.angle) * p.length;

      // Draw trail
      if (isTrailEnabled && trailPositions[i].length > 0) {
        ctx.beginPath();
        ctx.moveTo(trailPositions[i][0].x, trailPositions[i][0].y);

        for (let j = 1; j < trailPositions[i].length; j++) {
          ctx.lineTo(trailPositions[i][j].x, trailPositions[i][j].y);
        }

        // Create gradient for trail
        const trailGradient = ctx.createLinearGradient(
          trailPositions[i][0].x, trailPositions[i][0].y,
          trailPositions[i][trailPositions[i].length - 1].x,
          trailPositions[i][trailPositions[i].length - 1].y
        );

        trailGradient.addColorStop(0, 'rgba(4, 190, 254, 0)');
        trailGradient.addColorStop(1, p.color);

        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw pendulum string
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(bobX, bobY);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw pendulum bob
      const gradient = ctx.createRadialGradient(
        bobX, bobY, 0,
        bobX, bobY, p.mass
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, p.color);

      ctx.beginPath();
      ctx.arc(bobX, bobY, p.mass, 0, Math.PI * 2);
      ctx.fillStyle = gradient;

      // Add glow effect
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // Game loop - completely rewritten
  function gameLoop(timestamp) {
    // Request next animation frame FIRST to ensure continuous animation
    animationId = requestAnimationFrame(gameLoop);

    // Only process physics and drawing if the game is running
    if (!isRunning) {
      return;
    }

    // Calculate time delta
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
      return; // Skip first frame to establish time reference
    }

    const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // Convert to seconds, cap at 0.1s
    lastTimestamp = timestamp;

    // Update physics and draw
    update(deltaTime);
    draw();
  }

  // Event listeners for controls
  startButton.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Toggle running state
    isRunning = !isRunning;

    // Update button text
    startButton.textContent = isRunning ? 'Pause' : 'Start';

    // No need to start animation frame here - it's always running
    // Only reset timestamp when starting
    if (isRunning) {
      lastTimestamp = null;
    }
  });

  resetButton.addEventListener('click', () => {
    // Stop simulation but keep animation running
    isRunning = false;
    startButton.textContent = 'Start';
    init();
  });

  pendulumCountSlider.addEventListener('input', () => {
    pendulumCountValue.textContent = pendulumCountSlider.value;
    if (!isRunning) {
      createPendulums();
      draw();
    }
  });

  gravitySlider.addEventListener('input', () => {
    gravity = parseFloat(gravitySlider.value);
    gravityValue.textContent = gravity.toFixed(1);

    // Update pendulum frequencies
    for (const p of pendulums) {
      p.frequency = calculateFrequency(p.length);
    }
  });

  lengthVariationSlider.addEventListener('input', () => {
    lengthVariationValue.textContent = lengthVariationSlider.value;
    if (!isRunning) {
      createPendulums();
      draw();
    }
  });

  soundToggle.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    soundToggle.textContent = `Sound: ${isSoundEnabled ? 'ON' : 'OFF'}`;
    soundToggle.classList.toggle('off', !isSoundEnabled);

    // Resume audio context on user interaction
    if (isSoundEnabled && audioContext.state === 'suspended') {
      audioContext.resume();
    }
  });

  trailToggle.addEventListener('click', () => {
    isTrailEnabled = !isTrailEnabled;
    trailToggle.textContent = `Trails: ${isTrailEnabled ? 'ON' : 'OFF'}`;
    trailToggle.classList.toggle('off', !isTrailEnabled);

    if (!isTrailEnabled) {
      trailPositions = pendulums.map(() => []);
    }
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    if (!isRunning) {
      createPendulums();
      draw();
    }
  });

  // Initialize the game
  init();

  // Start the animation loop immediately - it will run continuously
  // even when the simulation is paused
  animationId = requestAnimationFrame(gameLoop);
}); 