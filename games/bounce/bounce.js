document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bounceCanvas');
  const ctx = canvas.getContext('2d');
  const bounceCountElement = document.getElementById('bounceCount');
  const startButton = document.getElementById('startButton');
  const resetButton = document.getElementById('resetButton');
  const gravitySlider = document.getElementById('gravitySlider');
  const ballSizeSlider = document.getElementById('ballSizeSlider');
  const modeToggle = document.getElementById('modeToggle');
  const ballGraph = document.getElementById('ballGraph');
  const graphCtx = ballGraph.getContext('2d');

  // Set canvas dimensions
  canvas.width = 500;
  canvas.height = 500;

  // Game variables
  let animationId;
  let isRunning = false;
  let bounceCount = 0;
  let gameOver = false;
  let isNormalMode = true;
  let balls = [];
  let lastCollisionTime = 0;
  const COLLISION_COOLDOWN = 100; // Cooldown in milliseconds
  const SPAWN_DELAY = 300; // 300ms delay before spawning new ball
  const SPLIT_MODE_GRAVITY_MULTIPLIER = 0.05; // Reduced from 0.2 to 0.05 for much slower movement

  // Audio setup
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  let isSoundEnabled = true;

  // Create a pool of oscillators for better performance
  const oscillatorPool = [];
  const maxPoolSize = 5;

  // Initialize oscillator pool
  for (let i = 0; i < maxPoolSize; i++) {
    oscillatorPool.push({
      oscillator: null,
      gainNode: null,
      inUse: false
    });
  }

  // Graph variables
  const MAX_HISTORY = 1000; // Increased from 100 to 1000 to store more data
  const ballHistory = [];
  let lastGraphUpdate = 0;
  const GRAPH_UPDATE_INTERVAL = 100; // Update graph every 100ms
  const GRAPH_POINT_WIDTH = 2; // Width of each data point in pixels

  // Function to play bounce sound
  function playBounceSound(sizeFactor, velocity) {
    if (!isSoundEnabled || !isRunning) return;

    // Find an available oscillator in the pool
    const oscillatorObject = oscillatorPool.find(obj => !obj.inUse);
    if (!oscillatorObject) return;

    oscillatorObject.inUse = true;

    // Create oscillator and gain node
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillatorObject.oscillator = oscillator;
    oscillatorObject.gainNode = gainNode;

    // Adjust frequency based on ball size (smaller balls = higher pitch)
    const baseFrequency = 600;
    const sizeAdjustment = 1 - Math.min(0.8, sizeFactor);
    const velocityFactor = Math.min(1.5, Math.abs(velocity) / 10);
    const frequency = baseFrequency * sizeAdjustment * velocityFactor;

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set oscillator properties
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    // Envelope settings
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);

    // Start and stop
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);

    // Reset after sound is done
    oscillator.onended = () => {
      oscillatorObject.inUse = false;
      oscillatorObject.oscillator = null;
      oscillatorObject.gainNode = null;
    };
  }

  // Ball properties
  const createBall = (x, y) => ({
    x: x,
    y: y,
    radius: parseInt(ballSizeSlider.value),
    initialRadius: parseInt(ballSizeSlider.value),
    maxRadius: 245,
    growthRate: 3,
    vx: 0,
    vy: 0,
    originalVx: 0,
    originalVy: 0,
    gravity: 0.5,
    bounce: 1.0,
    friction: 1.0,
    minVelocity: 14.0,
    boostFactor: 1.5,
    antiRollFactor: 0.8,
    perpBoost: 1,
    colorStart: '#ff00ff',
    colorEnd: '#6600cc',
    trail: [],
    lastCollision: 0,
    spawnTimer: 0,
    canSpawn: true,
    isDeleting: false,
    deleteProgress: 0
  });

  // Circle boundary
  const circle = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: canvas.width / 2 - 2, // Account for border
  };

  // Function to update the graph
  function updateGraph() {
    const currentTime = Date.now();
    if (currentTime - lastGraphUpdate < GRAPH_UPDATE_INTERVAL) return;
    lastGraphUpdate = currentTime;

    // Add current data point to history
    if (isNormalMode) {
      // In normal mode, track ball size
      ballHistory.push(balls[0]?.radius || 0);
    } else {
      // In split mode, track ball count
      ballHistory.push(balls.length);
    }

    if (ballHistory.length > MAX_HISTORY) {
      ballHistory.shift();
    }

    // Clear graph
    graphCtx.clearRect(0, 0, ballGraph.width, ballGraph.height);

    // Draw grid
    graphCtx.strokeStyle = '#333333';
    graphCtx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = i * (ballGraph.height / 4);
      graphCtx.beginPath();
      graphCtx.moveTo(0, y);
      graphCtx.lineTo(ballGraph.width, y);
      graphCtx.stroke();
    }

    // Draw graph line
    graphCtx.strokeStyle = '#ff00ff';
    graphCtx.lineWidth = 2;
    graphCtx.beginPath();

    const maxValue = Math.max(10, ...ballHistory); // Ensure at least 10 for scale
    const xStep = ballGraph.width / (ballHistory.length - 1);

    ballHistory.forEach((value, index) => {
      const x = index * xStep;
      const y = ballGraph.height - (value / maxValue) * ballGraph.height;
      if (index === 0) {
        graphCtx.moveTo(x, y);
      } else {
        graphCtx.lineTo(x, y);
      }
    });

    graphCtx.stroke();

    // Draw current value
    graphCtx.fillStyle = '#ffffff';
    graphCtx.font = '12px Arial';
    graphCtx.textAlign = 'right';
    if (isNormalMode) {
      graphCtx.fillText(`Size: ${Math.round(balls[0]?.radius || 0)}px`, ballGraph.width - 5, 15);
    } else {
      graphCtx.fillText(`Balls: ${balls.length}`, ballGraph.width - 5, 15);
    }

    // Draw time indicator
    const totalTime = (ballHistory.length * GRAPH_UPDATE_INTERVAL) / 1000; // Convert to seconds
    graphCtx.textAlign = 'left';
    graphCtx.fillText(`Time: ${totalTime.toFixed(1)}s`, 5, 15);
  }

  // Initialize
  function init() {
    balls = [createBall(canvas.width / 2, canvas.height / 4)];
    const ball = balls[0];
    ball.vx = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 2);
    ball.vy = 2;
    // Store original velocity for speed limiting
    ball.originalVx = ball.vx;
    ball.originalVy = ball.vy;
    ball.gravity = parseFloat(gravitySlider.value);
    ball.trail = [];
    bounceCount = 0;
    gameOver = false;
    bounceCountElement.textContent = bounceCount;

    // Clear ball history
    ballHistory.length = 0;

    // Set growth rate based on mode
    if (!isNormalMode) {
      ball.growthRate = 0;
    }

    gravitySlider.addEventListener('input', () => {
      const newGravity = parseFloat(gravitySlider.value);
      balls.forEach(ball => {
        ball.gravity = newGravity;
      });
    });

    // Draw initial state
    draw();
  }

  // Check for ball collisions
  function checkBallCollisions() {
    const currentTime = Date.now();
    const COLLISION_DELETION_COOLDOWN = 500; // 500ms cooldown before balls can be deleted
    const DELETE_ANIMATION_DURATION = 300; // 300ms animation duration
    const DELETE_DELAY = 100; // 100ms delay before starting deletion

    let collisionDetected = false;

    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const ball1 = balls[i];
        const ball2 = balls[j];

        // Skip if either ball is still in cooldown period or already being deleted
        if (currentTime - ball1.lastCollision < COLLISION_DELETION_COOLDOWN ||
          currentTime - ball2.lastCollision < COLLISION_DELETION_COOLDOWN ||
          ball1.isDeleting || ball2.isDeleting) {
          continue;
        }

        const dx = ball2.x - ball1.x;
        const dy = ball2.y - ball1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < ball1.radius + ball2.radius) {
          // Start deletion animation for both balls
          ball1.isDeleting = true;
          ball2.isDeleting = true;
          ball1.deleteProgress = 0;
          ball2.deleteProgress = 0;
          collisionDetected = true;
        }
      }
    }

    // Play pop sound only once if a collision was detected
    if (collisionDetected) {
      playPopSound();
    }

    return collisionDetected;
  }

  // Function to play pop sound
  function playPopSound() {
    if (!isSoundEnabled) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set up a short, high-pitched pop sound
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);

    // Quick fade out
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  }

  // Update game state
  function update() {
    if (gameOver) return;

    const currentTime = Date.now();
    const DELETE_ANIMATION_DURATION = 300; // 300ms animation duration

    // Update all balls
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];

      // Handle deletion animation
      if (ball.isDeleting) {
        ball.deleteProgress += 16; // Assuming 60fps, each frame is ~16ms
        if (ball.deleteProgress >= DELETE_ANIMATION_DURATION) {
          balls.splice(i, 1);
          continue;
        }
        // Skip normal movement during deletion
        continue;
      }

      // Update spawn timer
      if (!ball.canSpawn) {
        ball.spawnTimer += 16; // Assuming 60fps, each frame is ~16ms
        if (ball.spawnTimer >= SPAWN_DELAY) {
          ball.canSpawn = true;
          ball.spawnTimer = 0;
        }
      }

      // Apply gravity with split mode multiplier
      const gravityMultiplier = isNormalMode ? 1 : SPLIT_MODE_GRAVITY_MULTIPLIER;
      ball.vy += ball.gravity * gravityMultiplier;

      // Add a small random movement to prevent getting stuck
      if (Math.abs(ball.vx) < 0.2) {
        ball.vx += (Math.random() * 2 - 1) * 0.5;
      }

      // Update position
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Add position to trail
      ball.trail.push({ x: ball.x, y: ball.y });

      // Limit trail length
      if (ball.trail.length > 20) {
        ball.trail.shift();
      }

      // Check collision with circle boundary
      const dx = ball.x - circle.x;
      const dy = ball.y - circle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If ball hits or exceeds boundary
      if (distance + ball.radius >= circle.radius) {
        // Check if enough time has passed since last collision
        if (currentTime - ball.lastCollision < COLLISION_COOLDOWN) {
          continue;
        }

        // Calculate where ball should be at boundary
        const angle = Math.atan2(dy, dx);
        const newX = circle.x + (circle.radius - ball.radius) * Math.cos(angle);
        const newY = circle.y + (circle.radius - ball.radius) * Math.sin(angle);

        // Calculate normal vector at collision point
        const nx = (newX - circle.x) / circle.radius;
        const ny = (newY - circle.y) / circle.radius;

        // Calculate dot product of velocity and normal
        const dotProduct = ball.vx * nx + ball.vy * ny;

        // Calculate tangential vector (perpendicular to normal)
        const tx = -ny;
        const ty = nx;

        // Calculate tangential velocity component
        const tangentVelocity = ball.vx * tx + ball.vy * ty;

        // Reduce tangential component to prevent rolling along the walls
        const reducedTangentVelocity = tangentVelocity * ball.antiRollFactor;

        // Reflect velocity vector with perfect elasticity
        const reflectedNormalVelocity = -dotProduct * ball.perpBoost;

        // Reconstruct the velocity from normal and tangential components
        ball.vx = reflectedNormalVelocity * nx + reducedTangentVelocity * tx;
        ball.vy = reflectedNormalVelocity * ny + reducedTangentVelocity * ty;

        // Check if the ball hit the bottom half of the circle
        const isBottomHalf = ny > 0.3;

        // Apply extra boost when hitting the bottom
        if (isBottomHalf) {
          ball.vy *= ball.boostFactor;

          // Ensure horizontal movement is significant
          if (Math.abs(ball.vx) < 1.5) {
            ball.vx = (ball.vx < 0 ? -1.5 : 1.5);
          }
        }

        // Ensure minimum velocity after bounce to prevent stopping
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed < ball.minVelocity) {
          const ratio = ball.minVelocity / speed;
          ball.vx *= ratio;
          ball.vy *= ratio;
        }

        // Randomize slightly to prevent repetitive patterns
        ball.vx += (Math.random() - 0.5) * 0.5;
        ball.vy += (Math.random() - 0.5) * 0.5;

        // In split mode, don't increase speed after wall collision
        if (!isNormalMode) {
          const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          const originalSpeed = Math.sqrt(ball.originalVx * ball.originalVx + ball.originalVy * ball.originalVy);
          if (currentSpeed > originalSpeed) {
            const ratio = originalSpeed / currentSpeed;
            ball.vx *= ratio;
            ball.vy *= ratio;
          }
        }

        // Position ball on the boundary
        ball.x = newX;
        ball.y = newY;

        // Play bounce sound
        const sizeFactor = ball.radius / ball.maxRadius;
        playBounceSound(sizeFactor, dotProduct);

        // Count bounce
        bounceCount++;
        bounceCountElement.textContent = bounceCount;

        // Grow the ball
        ball.radius += ball.growthRate;

        // Check if ball has reached maximum size
        if (ball.radius >= ball.maxRadius) {
          endGame();
        }

        // In split mode, spawn a new ball if allowed
        if (!isNormalMode && ball.canSpawn) {
          // Calculate spawn position slightly inside the circle
          const angle = Math.atan2(dy, dx);
          const spawnDistance = circle.radius - ball.radius - 10; // 10 pixels from wall
          const spawnX = circle.x + spawnDistance * Math.cos(angle);
          const spawnY = circle.y + spawnDistance * Math.sin(angle);

          const newBall = createBall(spawnX, spawnY);
          // Make the new ball go in a random direction
          const randomAngle = Math.random() * Math.PI * 2;
          const speed = Math.sqrt(ball.originalVx * ball.originalVx + ball.originalVy * ball.originalVy);
          newBall.vx = Math.cos(randomAngle) * speed;
          newBall.vy = Math.sin(randomAngle) * speed;
          // Store original velocity for speed limiting
          newBall.originalVx = newBall.vx;
          newBall.originalVy = newBall.vy;
          // Keep the same size as the original ball
          newBall.radius = ball.radius;
          newBall.growthRate = 0; // No growth in split mode
          newBall.lastCollision = currentTime;
          newBall.canSpawn = false; // New ball can't spawn immediately
          balls.push(newBall);

          // Reset spawn timer for this ball
          ball.canSpawn = false;
          ball.spawnTimer = 0;
        }

        // Update last collision time
        ball.lastCollision = currentTime;
      }

      // Prevent getting stuck at the bottom
      if (Math.abs(ball.vx) < 0.1 && Math.abs(ball.vy) < 0.1) {
        ball.vx = 2 - Math.random() * 4;
        ball.vy = -5;
      }
    }

    // Check for ball collisions in split mode
    if (!isNormalMode) {
      checkBallCollisions();
    }
  }

  // End the game
  function endGame() {
    gameOver = true;
    isRunning = false;
    cancelAnimationFrame(animationId);

    // Play game over sound
    if (isSoundEnabled) {
      const endGameSound = audioContext.createOscillator();
      const endGameGain = audioContext.createGain();

      endGameSound.connect(endGameGain);
      endGameGain.connect(audioContext.destination);

      endGameSound.type = 'sine';
      endGameSound.frequency.setValueAtTime(400, audioContext.currentTime);
      endGameSound.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 1.5);

      endGameGain.gain.setValueAtTime(0, audioContext.currentTime);
      endGameGain.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + 0.1);
      endGameGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);

      endGameSound.start();
      endGameSound.stop(audioContext.currentTime + 1.5);
    }

    // Draw game over message
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 40px Orbitron';
    ctx.fillStyle = '#ff00ff';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);

    ctx.font = '20px Orbitron';
    ctx.fillStyle = 'white';
    ctx.fillText(`Final Bounces: ${bounceCount}`, canvas.width / 2, canvas.height / 2 + 20);

    startButton.textContent = 'Play Again';
  }

  // Draw game
  function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw circle boundary
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw all balls
    balls.forEach(ball => {
      // Draw trail
      for (let i = 0; i < ball.trail.length; i++) {
        const alpha = i / ball.trail.length;
        const trailRadius = ball.radius * (0.3 + 0.7 * alpha);
        ctx.beginPath();
        ctx.arc(ball.trail[i].x, ball.trail[i].y, trailRadius * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(102, 0, 204, ${alpha * 0.3})`;
        ctx.fill();
      }

      // Draw ball with gradient
      const gradient = ctx.createRadialGradient(
        ball.x - ball.radius / 3, ball.y - ball.radius / 3, 0,
        ball.x, ball.y, ball.radius
      );

      if (ball.isDeleting) {
        // Calculate animation progress (0 to 1)
        const progress = ball.deleteProgress / 300;

        // Pop effect: first expand then shrink
        let currentRadius;
        if (progress < 0.3) {
          // Expand phase (first 30% of animation)
          currentRadius = ball.radius * (1 + progress * 0.5);
        } else {
          // Shrink phase (remaining 70% of animation)
          currentRadius = ball.radius * (1.15 - (progress - 0.3) * 1.5);
        }

        // Fade out and turn red
        const opacity = 1 - progress;
        const redIntensity = Math.min(1, progress * 2); // Gradually increase red intensity

        // Blend between original color and red
        const startColor = `rgba(255, ${255 * (1 - redIntensity)}, ${255 * (1 - redIntensity)}, ${opacity})`;
        const endColor = `rgba(255, ${102 * (1 - redIntensity)}, ${0 * (1 - redIntensity)}, ${opacity})`;

        gradient.addColorStop(0, startColor);
        gradient.addColorStop(1, endColor);

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      } else {
        gradient.addColorStop(0, ball.colorStart);
        gradient.addColorStop(1, ball.colorEnd);

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    });

    // Draw sound toggle button
    ctx.fillStyle = isSoundEnabled ? '#ff00ff' : '#333333';
    ctx.beginPath();
    ctx.moveTo(450, 25);
    ctx.lineTo(470, 25);
    ctx.lineTo(480, 15);
    ctx.lineTo(480, 35);
    ctx.lineTo(470, 25);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(450, 25, 5, 0, Math.PI * 2);
    ctx.fill();

    if (!isSoundEnabled) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(440, 15);
      ctx.lineTo(485, 35);
      ctx.stroke();
    }

    // Update and draw the graph
    updateGraph();
  }

  // Game loop
  function gameLoop() {
    if (isRunning) {
      update();
      draw();
      animationId = requestAnimationFrame(gameLoop);
    }
  }

  // Sound toggle handler
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if sound button area was clicked
    if (x >= 440 && x <= 485 && y >= 10 && y <= 40) {
      isSoundEnabled = !isSoundEnabled;

      // Resume audio context if it was suspended (autoplay policy)
      if (isSoundEnabled && audioContext.state === 'suspended') {
        audioContext.resume();
      }
    }
  });

  // Event listeners
  startButton.addEventListener('click', () => {
    // Resume audio context on user interaction (to comply with autoplay policies)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    if (gameOver) {
      init();
      isRunning = true;
      gameLoop();
      startButton.textContent = 'Pause';
    } else if (!isRunning) {
      isRunning = true;
      gameLoop();
      startButton.textContent = 'Pause';
    } else {
      isRunning = false;
      cancelAnimationFrame(animationId);
      startButton.textContent = 'Start';
    }
  });

  resetButton.addEventListener('click', () => {
    // Resume audio context on user interaction
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    isRunning = false;
    cancelAnimationFrame(animationId);
    startButton.textContent = 'Start';
    init();
  });

  // Add mode toggle event listener
  modeToggle.addEventListener('click', () => {
    isNormalMode = !isNormalMode;
    modeToggle.textContent = isNormalMode ? 'Normal Mode' : 'Split Mode';
    if (!isRunning) {
      init();
    }
  });

  // Add event listener for ball size slider
  ballSizeSlider.addEventListener('input', () => {
    if (!isRunning) {
      // Update ball size if game is not running
      balls.forEach(ball => {
        ball.radius = parseInt(ballSizeSlider.value);
        ball.initialRadius = parseInt(ballSizeSlider.value);
      });
    }
  });

  // Initialize the game
  init();
}); 