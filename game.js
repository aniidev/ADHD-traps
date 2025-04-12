const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const scoreElement2 = document.getElementById('score2');
const finalScoreElement = document.getElementById('finalScore');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const wallsToggle = document.getElementById('wallsToggle');
// Set canvas size
canvas.width = Math.min(window.innerWidth - 40, 1000);
canvas.height = Math.min(window.innerHeight - 100, 800);

const GRID_SIZE = 20;
const COLS = Math.floor(canvas.width / GRID_SIZE);
const ROWS = Math.floor(canvas.height / GRID_SIZE);

let snake;
let enemySnake;
let foodArray = [];
let dx;
let dy;
let enemyDx;
let enemyDy;
let score;
let gameActive = false;
let lastTime;
let moveTimer;
const MOVE_INTERVAL = 100; // Snake speed (lower = faster)
const FAST_MOVE_INTERVAL = 12.5; // Fast speed
let currentMoveInterval = MOVE_INTERVAL; // Current speed setting

// Add gradient background colors
const BG_GRADIENT = {
    start: '#1a1a1a',
    end: '#000000'
};

// Add snake colors
const SNAKE_COLORS = {
    player: {
        primary: '#39FF14',
        secondary: '#32CD32',
        dark: '#228B22',
        glow: 'rgba(57, 255, 20, 0.3)'
    },
    enemy: {
        primary: '#FF3333',
        secondary: '#CC0000',
        dark: '#8B0000',
        glow: 'rgba(255, 51, 51, 0.3)'
    }
};

// Add powerup types and their effects
const POWERUPS = {
    SPEED: {
        color: '#00FFFF',
        symbol: '⚡',
        duration: 5000,
        active: false,
        timer: 0
    },
    SIZE: {
        color: '#FFD700',
        symbol: '⭐',
        duration: 8000,
        active: false,
        timer: 0
    },
    GHOST: {
        color: '#9966FF',
        symbol: '👻',
        duration: 4000,
        active: false,
        timer: 0
    }
};

let powerups = [];
let powerupSpawnTimer = 0;
const POWERUP_SPAWN_INTERVAL = 10000; // Spawn every 10 seconds

// Keep these at the top level
let animationFrame;

// Add at the top with other game variables
let isPlayerAI = false;

// Add at the top with other constants
const MAX_APPLES = 3; // Number of apples on screen at once
const MIN_WALL_LENGTH = 4;
const MAX_WALL_LENGTH = 8;
let walls = [];

// A* Pathfinding implementation
class Node {
    constructor(x, y, parent = null) {
        this.x = x;
        this.y = y;
        this.parent = parent;
        this.g = 0; // Cost from start to current node
        this.h = 0; // Heuristic (estimated cost from current to goal)
        this.f = 0; // Total cost (g + h)
    }

    equals(other) {
        return this.x === other.x && this.y === other.y;
    }
}

function heuristic(a, b) {
    // Manhattan distance
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getNeighbors(node, grid) {
    const neighbors = [];
    const dirs = [
        { x: 0, y: -1 }, // up
        { x: 1, y: 0 },  // right
        { x: 0, y: 1 },  // down
        { x: -1, y: 0 }  // left
    ];

    for (const dir of dirs) {
        const newX = node.x + dir.x;
        const newY = node.y + dir.y;

        // Check bounds
        if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) {
            continue;
        }

        // Check if cell is occupied
        if (grid[newY][newX]) {
            continue;
        }

        neighbors.push(new Node(newX, newY, node));
    }

    return neighbors;
}

function aStar(start, goal, grid) {
    const openSet = [new Node(start.x, start.y)];
    const closedSet = new Set();

    while (openSet.length > 0) {
        // Find node with lowest f cost
        let current = openSet[0];
        let currentIndex = 0;
        for (let i = 1; i < openSet.length; i++) {
            if (openSet[i].f < current.f) {
                current = openSet[i];
                currentIndex = i;
            }
        }

        // Remove current from openSet
        openSet.splice(currentIndex, 1);
        closedSet.add(`${current.x},${current.y}`);

        // Found the goal
        if (current.x === goal.x && current.y === goal.y) {
            const path = [];
            let temp = current;
            while (temp.parent) {
                path.push({ x: temp.x, y: temp.y });
                temp = temp.parent;
            }
            return path.reverse();
        }

        // Get neighbors
        const neighbors = getNeighbors(current, grid);
        for (const neighbor of neighbors) {
            if (closedSet.has(`${neighbor.x},${neighbor.y}`)) {
                continue;
            }

            // Calculate new g cost
            const newG = current.g + 1;

            // Check if this path is better
            if (newG < neighbor.g || !openSet.some(n => n.equals(neighbor))) {
                neighbor.g = newG;
                neighbor.h = heuristic(neighbor, goal);
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = current;

                if (!openSet.some(n => n.equals(neighbor))) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return []; // No path found
}

function createGrid() {
    const grid = Array(ROWS).fill().map(() => Array(COLS).fill(false));

    // Mark walls
    walls.forEach(wall => {
        wall.cells.forEach(cell => {
            grid[cell.y][cell.x] = true;
        });
    });

    // Mark snake segments
    snake.forEach(segment => {
        grid[segment.y][segment.x] = true;
    });

    // Mark enemy snake segments
    enemySnake.forEach(segment => {
        grid[segment.y][segment.x] = true;
    });

    return grid;
}

function evaluateSpace(position, grid) {
    let spaceScore = 0;
    const floodFillGrid = grid.map(row => [...row]);
    const queue = [position];
    const visited = new Set();

    while (queue.length > 0) {
        const current = queue.shift();
        const key = `${current.x},${current.y}`;

        if (visited.has(key)) continue;
        visited.add(key);
        spaceScore++;

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const neighbor of neighbors) {
            if (neighbor.x >= 0 && neighbor.x < COLS &&
                neighbor.y >= 0 && neighbor.y < ROWS &&
                !floodFillGrid[neighbor.y][neighbor.x]) {
                queue.push(neighbor);
                floodFillGrid[neighbor.y][neighbor.x] = true;
            }
        }
    }

    return spaceScore;
}

function findSafestPath(start, goal, grid) {
    const path = aStar(start, goal, grid);
    if (!path.length) return null;

    // Check if the path leads to enough open space
    const lastPos = path[path.length - 1];
    const spaceAfterPath = evaluateSpace(lastPos, grid);

    // If there's not enough space after reaching the goal, try to find a safer path
    if (spaceAfterPath < enemySnake.length * 2) {
        return null;
    }

    return path;
}

function findTailPath(head, grid) {
    const tail = enemySnake[enemySnake.length - 1];
    // Create a temporary grid without the tail position marked as occupied
    const tempGrid = grid.map(row => [...row]);
    tempGrid[tail.y][tail.x] = false;
    return aStar(head, tail, tempGrid);
}

function updateEnemyDirection() {
    const head = enemySnake[0];
    const grid = createGrid();

    // Calculate available space
    const availableSpace = evaluateSpace(head, grid);
    const inSurvivalMode = availableSpace < enemySnake.length * 3;

    let bestPath = null;
    let bestFood = null;

    if (!inSurvivalMode) {
        // Try to find path to food
        for (const food of foodArray) {
            const path = findSafestPath(head, food, grid);
            if (path && (!bestPath || path.length < bestPath.length)) {
                // Check if we can reach food before player
                const playerPath = aStar(snake[0], food, grid);
                if (!playerPath.length || path.length <= playerPath.length) {
                    bestPath = path;
                    bestFood = food;
                }
            }
        }
    }

    // If no safe path to food or in survival mode, try to follow tail
    if (!bestPath) {
        bestPath = findTailPath(head, grid);
    }

    // If we have a path, use it
    if (bestPath && bestPath.length > 0) {
        const nextMove = bestPath[0];
        enemyDx = nextMove.x - head.x;
        enemyDy = nextMove.y - head.y;
    } else {
        // Last resort: find the move that leads to the most open space
        const possibleMoves = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 }
        ];

        let bestMove = null;
        let bestSpaceScore = -1;

        for (const move of possibleMoves) {
            const newX = head.x + move.dx;
            const newY = head.y + move.dy;

            if (newX >= 0 && newX < COLS &&
                newY >= 0 && newY < ROWS &&
                !grid[newY][newX]) {
                const tempGrid = grid.map(row => [...row]);
                tempGrid[newY][newX] = true;
                const spaceScore = evaluateSpace({ x: newX, y: newY }, tempGrid);

                if (spaceScore > bestSpaceScore) {
                    bestSpaceScore = spaceScore;
                    bestMove = move;
                }
            }
        }

        if (bestMove) {
            enemyDx = bestMove.dx;
            enemyDy = bestMove.dy;
        }
    }
}

function initGame() {
    // Initialize player snake with size 3
    snake = [
        { x: Math.floor(COLS * 3 / 4), y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS * 3 / 4) - 1, y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS * 3 / 4) - 2, y: Math.floor(ROWS / 2) }
    ];

    // Initialize enemy snake with size 3
    enemySnake = [
        { x: Math.floor(COLS / 4), y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS / 4) + 1, y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS / 4) + 2, y: Math.floor(ROWS / 2) }
    ];

    foodArray = [];
    dx = 0;
    dy = 0;
    enemyDx = 0;
    enemyDy = 0;
    score = 0;
    score2 = 0;
    scoreElement.textContent = '0';
    scoreElement2.textContent = '0';
    gameActive = false;
    moveTimer = 0;
    powerupSpawnTimer = 0;

    // Reset all powerups
    Object.values(POWERUPS).forEach(powerup => {
        powerup.active = false;
        powerup.timer = 0;
    });
}

function getRandomFood() {
    let position;
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loops

    do {
        position = {
            x: Math.floor(Math.random() * COLS),
            y: Math.floor(Math.random() * ROWS)
        };

        // Create a grid for pathfinding
        const grid = createGrid();

        // Temporarily remove the potential food position from being marked as occupied
        if (grid[position.y] && grid[position.y][position.x]) {
            grid[position.y][position.x] = false;
        }

        // Check if both snakes can reach this food position
        const isReachableByPlayer = hasPath(snake[0], position, grid);
        const isReachableByEnemy = hasPath(enemySnake[0], position, grid);

        attempts++;

        // Return position if it's valid and reachable by both snakes
        if (!snake.some(segment => segment.x === position.x && segment.y === position.y) &&
            !enemySnake.some(segment => segment.x === position.x && segment.y === position.y) &&
            !foodArray.some(food => food.x === position.x && food.y === position.y) &&
            !walls.some(wall => wall.cells.some(cell => cell.x === position.x && cell.y === position.y)) &&
            isReachableByPlayer && isReachableByEnemy) {
            return position;
        }
    } while (attempts < maxAttempts);

    // If we couldn't find a valid position after max attempts, try to find any reachable position
    // This is a fallback to prevent the game from getting stuck
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            position = { x, y };
            const grid = createGrid();

            if (grid[y] && grid[y][x]) {
                grid[y][x] = false;
            }

            const isReachableByPlayer = hasPath(snake[0], position, grid);
            const isReachableByEnemy = hasPath(enemySnake[0], position, grid);

            if (!snake.some(segment => segment.x === x && segment.y === y) &&
                !enemySnake.some(segment => segment.x === x && segment.y === y) &&
                !foodArray.some(food => food.x === x && food.y === y) &&
                !walls.some(wall => wall.cells.some(cell => cell.x === x && cell.y === y)) &&
                isReachableByPlayer && isReachableByEnemy) {
                return position;
            }
        }
    }

    // If still no valid position found, remove some walls near the snakes to ensure food can be placed
    const nearestWalls = walls.filter(wall =>
        wall.cells.some(cell =>
            Math.abs(cell.x - snake[0].x) + Math.abs(cell.y - snake[0].y) < 5 ||
            Math.abs(cell.x - enemySnake[0].x) + Math.abs(cell.y - enemySnake[0].y) < 5
        )
    );

    if (nearestWalls.length > 0) {
        // Remove the first wall that's causing accessibility issues
        walls = walls.filter(wall => wall !== nearestWalls[0]);
        // Try getting food position again
        return getRandomFood();
    }

    // Absolute fallback - return a position next to the player snake
    // This should rarely if ever happen
    return {
        x: snake[0].x + 1,
        y: snake[0].y
    };
}

function spawnFood() {
    while (foodArray.length < MAX_APPLES) {
        foodArray.push(getRandomFood());
    }
}

// Add this new function to predict if a snake will reach food first
function willReachFoodFirst(snake, food, otherSnake) {
    const snakeHead = snake[0];
    const otherHead = otherSnake[0];

    // Calculate Manhattan distance for both snakes
    const snakeDistance = Math.abs(food.x - snakeHead.x) + Math.abs(food.y - snakeHead.y);
    const otherDistance = Math.abs(food.x - otherHead.x) + Math.abs(food.y - otherHead.y);

    // If other snake is closer, they'll likely get it first
    return snakeDistance <= otherDistance;
}

// Update findNearestFood to consider opponent's path
function findNearestFood(position, isEnemy = false) {
    let bestFood = null;
    let bestScore = -Infinity;

    foodArray.forEach(food => {
        // Calculate base distance score (closer is better)
        const distance = Math.abs(food.x - position.x) + Math.abs(food.y - position.y);
        let score = -distance; // Negative because lower distance is better

        // If this is enemy AI, consider player's path
        if (isEnemy) {
            // If player will likely get this food first, reduce its score
            if (!willReachFoodFirst(enemySnake, food, snake)) {
                score -= 10; // Penalty for food that player will likely get first
            }
        } else {
            // If enemy will likely get this food first, reduce its score
            if (!willReachFoodFirst(snake, food, enemySnake)) {
                score -= 10; // Penalty for food that enemy will likely get first
            }
        }

        // Update best food if this one has a better score
        if (score > bestScore) {
            bestScore = score;
            bestFood = food;
        }
    });

    return bestFood;
}

function spawnPowerup() {
    const types = Object.keys(POWERUPS);
    const type = types[Math.floor(Math.random() * types.length)];

    let x, y;
    do {
        x = Math.floor(Math.random() * COLS);
        y = Math.floor(Math.random() * ROWS);
    } while (
        snake.some(segment => segment.x === x && segment.y === y) ||
        enemySnake.some(segment => segment.x === x && segment.y === y) ||
        foodArray.some(food => food.x === x && food.y === y) ||
        powerups.some(p => p.x === x && p.y === y)
    );

    powerups.push({ x, y, type });
}

function updatePowerups(deltaTime) {
    // Update active powerup timers
    Object.entries(POWERUPS).forEach(([key, powerup]) => {
        if (powerup.active) {
            powerup.timer += deltaTime;
            if (powerup.timer >= powerup.duration) {
                powerup.active = false;
                powerup.timer = 0;
            }
        }
    });

    // Spawn new powerups
    powerupSpawnTimer += deltaTime;
    if (powerupSpawnTimer >= POWERUP_SPAWN_INTERVAL) {
        spawnPowerup();
        powerupSpawnTimer = 0;
    }
}

function activatePowerup(type) {
    const powerup = POWERUPS[type];
    powerup.active = true;
    powerup.timer = 0;

    switch (type) {
        case 'SPEED':
            currentMoveInterval = FAST_MOVE_INTERVAL; // Faster movement
            break;
        case 'SIZE':
            // Add two segments to the snake
            const tail = snake[snake.length - 1];
            snake.push({ ...tail }, { ...tail });
            score += 20;
            scoreElement.textContent = score;
            break;
        case 'GHOST':
            // Ghost mode handled in collision detection
            break;
    }
}

function deactivatePowerup(type) {
    switch (type) {
        case 'SPEED':
            currentMoveInterval = MOVE_INTERVAL; // Reset speed
            break;
    }
}

function drawPowerups() {
    powerups.forEach(powerup => {
        const { x, y, type } = powerup;
        const powerupInfo = POWERUPS[type];

        // Draw glow
        ctx.shadowColor = powerupInfo.color;
        ctx.shadowBlur = 15;

        // Draw circle
        ctx.fillStyle = powerupInfo.color;
        ctx.beginPath();
        ctx.arc(
            x * GRID_SIZE + GRID_SIZE / 2,
            y * GRID_SIZE + GRID_SIZE / 2,
            GRID_SIZE / 3,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Draw symbol
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `${GRID_SIZE / 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            powerupInfo.symbol,
            x * GRID_SIZE + GRID_SIZE / 2,
            y * GRID_SIZE + GRID_SIZE / 2
        );
    });
}

function drawPowerupStatus() {
    let y = 50;
    Object.entries(POWERUPS).forEach(([type, powerup]) => {
        if (powerup.active) {
            const timeLeft = Math.ceil((powerup.duration - powerup.timer) / 1000);
            ctx.fillStyle = powerup.color;
            ctx.font = '20px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(
                `${powerup.symbol} ${timeLeft}s`,
                10,
                y
            );
            y += 30;
        }
    });
}

function moveSnakes() {
    // Update enemy direction before moving
    updateEnemyDirection();

    const playerHead = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(playerHead);

    const enemyHead = { x: enemySnake[0].x + enemyDx, y: enemySnake[0].y + enemyDy };
    enemySnake.unshift(enemyHead);

    let playerAteFood = false;
    let enemyAteFood = false;

    foodArray = foodArray.filter(food => {
        if (playerHead.x === food.x && playerHead.y === food.y) {
            score += 10;
            scoreElement.textContent = score;
            playerAteFood = true;
            const newWall = generateWall();
            if (newWall) walls.push(newWall);
            return false;
        }
        if (enemyHead.x === food.x && enemyHead.y === food.y) {
            enemyAteFood = true;
            score2 += 10;
            scoreElement2.textContent = score2;
            const newWall = generateWall();
            if (newWall) walls.push(newWall);
            return false;
        }
        return true;
    });

    if (!playerAteFood) snake.pop();
    if (!enemyAteFood) enemySnake.pop();

    spawnFood();
}

function drawSnake(segments, isEnemy) {
    const colors = isEnemy ? SNAKE_COLORS.enemy : SNAKE_COLORS.player;
    const direction = isEnemy ? { dx: enemyDx, dy: enemyDy } : { dx, dy };

    // Draw body segments first
    for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        const x = segment.x * GRID_SIZE;
        const y = segment.y * GRID_SIZE;
        const isHead = i === 0;

        // Create gradient for segment
        const gradient = ctx.createLinearGradient(x, y, x + GRID_SIZE, y + GRID_SIZE);
        gradient.addColorStop(0, colors.primary);
        gradient.addColorStop(1, colors.secondary);

        // Add glow effect for head
        if (isHead) {
            ctx.shadowColor = colors.glow;
            ctx.shadowBlur = 10;
        }

        // Draw segment
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(
            x + 1,
            y + 1,
            GRID_SIZE - 2,
            GRID_SIZE - 2,
            isHead ? 8 : 4
        );
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Add details for head
        if (isHead) {
            // Draw eyes
            const eyeSize = 6;
            const pupilSize = 3;
            const eyeOffset = GRID_SIZE * 0.25;

            function drawEye(eyeX, eyeY) {
                // Eye white with gradient
                const eyeGradient = ctx.createRadialGradient(
                    eyeX, eyeY, 0,
                    eyeX, eyeY, eyeSize
                );
                eyeGradient.addColorStop(0, '#FFFFFF');
                eyeGradient.addColorStop(1, '#CCCCCC');

                ctx.fillStyle = eyeGradient;
                ctx.beginPath();
                ctx.ellipse(eyeX, eyeY, eyeSize, eyeSize, 0, 0, Math.PI * 2);
                ctx.fill();

                // Pupil with shine
                ctx.fillStyle = '#000000';
                const pupilX = eyeX + direction.dx * 2;
                const pupilY = eyeY + direction.dy * 2;
                ctx.beginPath();
                ctx.ellipse(pupilX, pupilY, pupilSize, pupilSize, 0, 0, Math.PI * 2);
                ctx.fill();

                // Eye shine
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.ellipse(pupilX - 1, pupilY - 1, 1, 1, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Position eyes based on direction
            if (direction.dx === 1) { // Right
                drawEye(x + GRID_SIZE * 0.7, y + GRID_SIZE * 0.3);
                drawEye(x + GRID_SIZE * 0.7, y + GRID_SIZE * 0.7);
                // Tongue
                drawTongue(x + GRID_SIZE, y + GRID_SIZE * 0.5, 0);
            } else if (direction.dx === -1) { // Left
                drawEye(x + GRID_SIZE * 0.3, y + GRID_SIZE * 0.3);
                drawEye(x + GRID_SIZE * 0.3, y + GRID_SIZE * 0.7);
                // Tongue
                drawTongue(x, y + GRID_SIZE * 0.5, Math.PI);
            } else if (direction.dy === -1) { // Up
                drawEye(x + GRID_SIZE * 0.3, y + GRID_SIZE * 0.3);
                drawEye(x + GRID_SIZE * 0.7, y + GRID_SIZE * 0.3);
                // Tongue
                drawTongue(x + GRID_SIZE * 0.5, y, -Math.PI / 2);
            } else if (direction.dy === 1) { // Down
                drawEye(x + GRID_SIZE * 0.3, y + GRID_SIZE * 0.7);
                drawEye(x + GRID_SIZE * 0.7, y + GRID_SIZE * 0.7);
                // Tongue
                drawTongue(x + GRID_SIZE * 0.5, y + GRID_SIZE, Math.PI / 2);
            }
        }
    }
}

function drawTongue(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw forked tongue
    ctx.fillStyle = '#FF3333';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, -4);
    ctx.lineTo(8, 4);
    ctx.lineTo(0, 0);
    ctx.moveTo(8, -4);
    ctx.lineTo(12, -6);
    ctx.moveTo(8, 4);
    ctx.lineTo(12, 6);
    ctx.fill();

    ctx.restore();
}

function drawFood() {
    foodArray.forEach(food => {
        // Add glow effect
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 15;

        // Draw apple shape
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(
            food.x * GRID_SIZE + GRID_SIZE / 2,
            food.y * GRID_SIZE + GRID_SIZE / 2,
            GRID_SIZE / 3,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Add shine effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(
            food.x * GRID_SIZE + GRID_SIZE / 3,
            food.y * GRID_SIZE + GRID_SIZE / 3,
            GRID_SIZE / 8,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;
    });
}

function drawBackground() {
    // Fill background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    // Draw vertical lines
    for (let x = 0; x <= canvas.width; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Draw horizontal lines
    for (let y = 0; y <= canvas.height; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function checkCollision() {
    const head = snake[0];

    // Wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        return true;
    }

    // Generated walls collision
    if (walls.some(wall =>
        wall.cells.some(cell => cell.x === head.x && cell.y === head.y)
    )) {
        return true;
    }

    // Self collision
    if (snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
        return true;
    }

    // Enemy collision
    if (enemySnake.some(segment => segment.x === head.x && segment.y === head.y)) {
        return true;
    }

    // Check enemy head collision with walls
    const enemyHead = enemySnake[0];
    if (walls.some(wall =>
        wall.cells.some(cell => cell.x === enemyHead.x && cell.y === enemyHead.y)
    )) {
        return true;
    }

    return false;
}

// Update updatePlayerAI to use the new findNearestFood
function updatePlayerAI() {
    if (!isPlayerAI) return;

    const head = snake[0];
    const grid = createGrid();

    // Calculate available space
    const availableSpace = evaluateSpace(head, grid);
    const inSurvivalMode = availableSpace < snake.length * 3;

    let bestPath = null;
    let bestFood = null;

    if (!inSurvivalMode) {
        // Try to find path to food
        for (const food of foodArray) {
            const path = findSafestPath(head, food, grid);
            if (path && (!bestPath || path.length < bestPath.length)) {
                // Check if we can reach food before enemy
                const enemyPath = aStar(enemySnake[0], food, grid);
                if (!enemyPath.length || path.length <= enemyPath.length) {
                    bestPath = path;
                    bestFood = food;
                }
            }
        }
    }

    // If no safe path to food or in survival mode, try to follow tail
    if (!bestPath) {
        bestPath = findTailPath(head, grid);
    }

    // If we have a path, use it
    if (bestPath && bestPath.length > 0) {
        const nextMove = bestPath[0];
        dx = nextMove.x - head.x;
        dy = nextMove.y - head.y;
    } else {
        // Last resort: find the move that leads to the most open space
        const possibleMoves = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 }
        ];

        let bestMove = null;
        let bestSpaceScore = -1;

        for (const move of possibleMoves) {
            const newX = head.x + move.dx;
            const newY = head.y + move.dy;

            if (newX >= 0 && newX < COLS &&
                newY >= 0 && newY < ROWS &&
                !grid[newY][newX]) {
                const tempGrid = grid.map(row => [...row]);
                tempGrid[newY][newX] = true;
                const spaceScore = evaluateSpace({ x: newX, y: newY }, tempGrid);

                if (spaceScore > bestSpaceScore) {
                    bestSpaceScore = spaceScore;
                    bestMove = move;
                }
            }
        }

        if (bestMove) {
            dx = bestMove.dx;
            dy = bestMove.dy;
        }
    }
}

// Update the changeDirection function to handle 'E' key
function changeDirection(event) {
    if (!gameActive) return;

    const keyPressed = event.key.toLowerCase();

    // Toggle speed with 'F' key
    if (keyPressed === 'f') {
        currentMoveInterval = currentMoveInterval === MOVE_INTERVAL ? FAST_MOVE_INTERVAL : MOVE_INTERVAL;
        // Add visual feedback
        const speedStatus = document.getElementById('speedStatus');
        if (speedStatus) {
            speedStatus.textContent = currentMoveInterval === FAST_MOVE_INTERVAL ? '2X SPEED ON' : '2X SPEED OFF';
            speedStatus.style.opacity = '1';
            setTimeout(() => {
                speedStatus.style.opacity = '0';
            }, 1000);
        }
        return;
    }

    // Toggle AI mode with 'E' key
    if (keyPressed === 'e') {
        isPlayerAI = !isPlayerAI;
        // Add visual feedback
        const aiStatus = document.getElementById('aiStatus');
        if (aiStatus) {
            aiStatus.textContent = isPlayerAI ? 'AI MODE ON' : 'AI MODE OFF';
            aiStatus.style.opacity = '1';
            setTimeout(() => {
                aiStatus.style.opacity = '0';
            }, 1000);
        }
        return;
    }

    // Only process movement keys if not in AI mode
    if (!isPlayerAI) {
        const goingUp = dy === -1;
        const goingDown = dy === 1;
        const goingRight = dx === 1;
        const goingLeft = dx === -1;

        if ((keyPressed === 'arrowleft' || keyPressed === 'a') && !goingRight) {
            dx = -1;
            dy = 0;
        }
        if ((keyPressed === 'arrowup' || keyPressed === 'w') && !goingDown) {
            dx = 0;
            dy = -1;
        }
        if ((keyPressed === 'arrowright' || keyPressed === 'd') && !goingLeft) {
            dx = 1;
            dy = 0;
        }
        if ((keyPressed === 'arrowdown' || keyPressed === 's') && !goingUp) {
            dx = 0;
            dy = 1;
        }
    }
}

// Update the gameLoop to use currentMoveInterval
function gameLoop(currentTime) {
    if (!gameActive) return;

    if (!lastTime) {
        lastTime = currentTime;
    }
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    moveTimer += deltaTime;
    if (moveTimer >= currentMoveInterval) {
        // Update AI movement if enabled
        if (isPlayerAI) {
            updatePlayerAI();
        }
        moveSnakes();

        if (checkCollision()) {
            gameActive = false;
            finalScoreElement.textContent = score;
            document.getElementById('finalEnemyScore').textContent = score2;

            // Determine and display the result
            const resultMessage = document.getElementById('resultMessage');
            if (score > score2) {
                resultMessage.textContent = "You Won! 🎉";
                resultMessage.style.color = "#4CAF50";
            } else if (score < score2) {
                resultMessage.textContent = "You Lost! 😢";
                resultMessage.style.color = "#FF3333";
            } else {
                resultMessage.textContent = "It's a Tie! 🤝";
                resultMessage.style.color = "#FFD700";
            }

            showScreen(gameOverScreen);
            return;
        }

        moveTimer = 0;
    }

    drawBackground();
    if (wallsToggle.checked) {
        drawWalls(); // Draw walls before other elements
    }
    drawFood();
    drawSnake(enemySnake, true);
    drawSnake(snake, false);

    // Draw AI status indicator
    if (isPlayerAI) {
        ctx.fillStyle = '#39FF14';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('AI MODE', 10, 30);
    }

    // Draw speed status indicator
    if (currentMoveInterval === FAST_MOVE_INTERVAL) {
        ctx.fillStyle = '#FFD700';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('2X SPEED', 10, isPlayerAI ? 60 : 30);
    }

    animationFrame = requestAnimationFrame(gameLoop);
}

function showScreen(screen) {
    startScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    if (screen) {
        screen.style.display = 'block';
    }
}

function startGame() {
    snake = [
        { x: Math.floor(COLS * 1 / 4), y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS * 1 / 4) - 1, y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS * 1 / 4) - 2, y: Math.floor(ROWS / 2) }
    ];

    enemySnake = [
        { x: Math.floor(COLS * 3 / 4), y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS * 3 / 4) + 1, y: Math.floor(ROWS / 2) },
        { x: Math.floor(COLS * 3 / 4) + 2, y: Math.floor(ROWS / 2) }
    ];

    dx = 1;
    dy = 0;
    // Don't set initial enemy direction - let AI decide
    enemyDx = 0;
    enemyDy = 0;

    score = 0;
    scoreElement.textContent = '0';
    score2 = 0;
    scoreElement2.textContent = '0';
    foodArray = [];
    spawnFood();
    walls = [];

    showScreen(null);
    gameActive = true;
    lastTime = performance.now();
    moveTimer = 0;

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
    animationFrame = requestAnimationFrame(gameLoop);
}

// Initialize game
document.addEventListener('keydown', changeDirection);
showScreen(startScreen);

// Simplify wall generation
function generateWall() {
    let wall;
    let attempts = 0;
    const maxAttempts = 50;

    do {
        attempts++;
        // Generate single block wall
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);

        wall = {
            cells: [{ x, y }]
        };

        // Check if wall placement is valid
        const isValid = !wall.cells.some(cell =>
            // Check collision with snakes
            snake.some(segment => segment.x === cell.x && segment.y === cell.y) ||
            enemySnake.some(segment => segment.x === cell.x && segment.y === cell.y) ||
            // Check collision with food
            foodArray.some(food => food.x === cell.x && food.y === cell.y) ||
            // Check collision with other walls
            walls.some(existingWall =>
                existingWall.cells.some(existingCell =>
                    existingCell.x === cell.x && existingCell.y === cell.y
                )
            )
        );

        if (isValid) {
            // Verify that food is still reachable
            const testGrid = Array(ROWS).fill().map(() => Array(COLS).fill(false));
            walls.forEach(w => w.cells.forEach(cell => testGrid[cell.y][cell.x] = true));
            wall.cells.forEach(cell => testGrid[cell.y][cell.x] = true);

            // Check if path exists between snakes and at least one food
            const canReachFood = foodArray.some(food =>
                hasPath(snake[0], food, testGrid) && hasPath(enemySnake[0], food, testGrid)
            );

            if (canReachFood) {
                return wall;
            }
        }
    } while (attempts < maxAttempts);

    return null;
}

// Add pathfinding helper function
function hasPath(start, end, grid) {
    const queue = [start];
    const visited = new Set();
    const key = (pos) => `${pos.x},${pos.y}`;
    visited.add(key(start));

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.x === end.x && current.y === end.y) return true;

        const moves = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const move of moves) {
            if (move.x >= 0 && move.x < COLS &&
                move.y >= 0 && move.y < ROWS &&
                !grid[move.y][move.x] &&
                !visited.has(key(move))) {
                queue.push(move);
                visited.add(key(move));
            }
        }
    }
    return false;
}

// Update wall drawing for better visibility
function drawWalls() {
    walls.forEach(wall => {
        wall.cells.forEach(cell => {
            // Create gradient for better visual effect
            const gradient = ctx.createRadialGradient(
                cell.x * GRID_SIZE + GRID_SIZE / 2,
                cell.y * GRID_SIZE + GRID_SIZE / 2,
                0,
                cell.x * GRID_SIZE + GRID_SIZE / 2,
                cell.y * GRID_SIZE + GRID_SIZE / 2,
                GRID_SIZE / 2
            );
            gradient.addColorStop(0, '#888888');
            gradient.addColorStop(1, '#666666');

            ctx.fillStyle = gradient;
            ctx.fillRect(
                cell.x * GRID_SIZE,
                cell.y * GRID_SIZE,
                GRID_SIZE,
                GRID_SIZE
            );

            // Add subtle border
            ctx.strokeStyle = '#444444';
            ctx.lineWidth = 1;
            ctx.strokeRect(
                cell.x * GRID_SIZE,
                cell.y * GRID_SIZE,
                GRID_SIZE,
                GRID_SIZE
            );
        });
    });
}
