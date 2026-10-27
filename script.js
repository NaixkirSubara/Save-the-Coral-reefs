// ==========================================
// 1. KONFIGURASI FILE ASSET (DISESUAIKAN FOLDER & SUARA GAMEOVER)
// ==========================================
const ASSET_PATHS = {
  player: 'Asset Image/archerfish.png',
  enemy: 'Asset Image/hunter.png',
  mine: 'Asset Image/mine.png',
  bg: 'Asset Image/background.png',
  bgMusic: 'Asset Audio/bgm.mp3',
  shootSFX: 'Asset Audio/shoot.mp3',
  explodeSFX: 'Asset Audio/explode.mp3',
  o2SFX: 'Asset Audio/o2.mp3',
  gameOverSFX: 'Asset Audio/gameover.mp3' // File suara Game Over
};

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');
const deathReasonEl = document.getElementById('deathReason');
const finalScoreEl = document.getElementById('finalScore');
const highScoreTextEl = document.getElementById('highScoreText');

// Memuat Gambar dengan Fallback Rendering
const images = {};
function loadImages() {
  const keys = ['player', 'enemy', 'mine', 'bg'];
  keys.forEach(key => {
    const img = new Image();
    img.src = ASSET_PATHS[key];
    img.onload = () => { images[key] = img; };
    img.onerror = () => { images[key] = null; };
  });
}
loadImages();

// Memuat Audio
let isMuted = false;
const audio = {
  bgm: new Audio(ASSET_PATHS.bgMusic),
  shoot: new Audio(ASSET_PATHS.shootSFX),
  explode: new Audio(ASSET_PATHS.explodeSFX),
  o2: new Audio(ASSET_PATHS.o2SFX),
  gameOver: new Audio(ASSET_PATHS.gameOverSFX)
};
audio.bgm.loop = true;

function playSound(soundKey) {
  if (!isMuted && audio[soundKey]) {
    audio[soundKey].currentTime = 0;
    audio[soundKey].play().catch(() => {});
  }
}

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇 Audio: OFF' : '🔊 Audio: ON';
  if (isMuted) {
    audio.bgm.pause();
    audio.gameOver.pause();
  } else if (gameState === 'PLAYING') {
    audio.bgm.play().catch(() => {});
  }
});

// ==========================================
// 2. STATE GAME & DETEKSI SENTUHAN (TAP-TO-MOVE)
// ==========================================
let gameState = 'START';
let score = 0;
let highScore = localStorage.getItem('archer_highscore') || 0;
let o2Timer = 35.0;
const MAX_O2 = 35.0;
let screenFlash = 0;

let level = 0;
let nextBossThreshold = 200;
let bossActive = false;
let boss = null;

let mineTimerAcc = 0;
let enemyTimerAcc = 0;
let o2TimerAcc = 0;
let hpRegenTimerAcc = 0;

let buffBubbleTimerAcc = 0;
let nextBuffBubbleInterval = getNextBuffInterval();

function getNextBuffInterval() {
  return 15.0 + Math.random() * 15.0;
}

// Target Koordinat Sentuhan Layar
let touchTarget = null;
let isPointerDown = false;

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function handlePointerStart(e) {
  if (gameState !== 'PLAYING') return;
  isPointerDown = true;
  touchTarget = getCanvasCoords(e);
}

function handlePointerMove(e) {
  if (!isPointerDown || gameState !== 'PLAYING') return;
  touchTarget = getCanvasCoords(e);
}

function handlePointerEnd() {
  isPointerDown = false;
  touchTarget = null;
}

// Touch & Mouse Listeners pada Canvas
canvas.addEventListener('mousedown', handlePointerStart);
canvas.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerEnd);

canvas.addEventListener('touchstart', handlePointerStart, { passive: false });
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
window.addEventListener('touchend', handlePointerEnd);
window.addEventListener('touchcancel', handlePointerEnd);

// Dukungan Keyboard opsional
const keys = {
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
  w: false, a: false, s: false, d: false
};

window.addEventListener('keydown', e => {
  if (e.code in keys) keys[e.code] = true;
  if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', e => {
  if (e.code in keys) keys[e.code] = false;
  if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false;
});

// ==========================================
// 3. EFEK FLOATING TEXT
// ==========================================
let floatingTexts = [];

function addFloatingText(x, y, text, color = '#facc15') {
  floatingTexts.push({
    x: x,
    y: y,
    text: text,
    color: color,
    life: 50,
    maxLife: 50
  });
}

function updateAndDrawFloatingTexts() {
  floatingTexts.forEach((ft, i) => {
    ft.y -= 0.6;
    ft.life--;
    let alpha = ft.life / ft.maxLife;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();

    if (ft.life <= 0) floatingTexts.splice(i, 1);
  });
}

// ==========================================
// 4. PLAYER (BERGERAK KE LOKASI TOUCH)
// ==========================================
const player = {
  x: 100,
  y: 300,
  width: 75,
  height: 50,
  speed: 360,
  hp: 3,
  invincibleTimer: 0,
  shieldTimer: 0,
  autoShootTimer: 0,
  shootInterval: 1.0,
  shotDirections: 1,
  reset() {
    this.x = 100;
    this.y = 300;
    this.hp = 3;
    this.invincibleTimer = 0;
    this.shieldTimer = 0;
    this.autoShootTimer = 0;
    this.shootInterval = 1.0;
    this.shotDirections = 1;
    touchTarget = null;
  },
  takeDamage(amount, reason) {
    if (this.shieldTimer > 0) return;
    if (this.invincibleTimer > 0) return;
    
    this.hp -= amount;
    screenFlash = 12;
    this.invincibleTimer = 60;

    if (this.hp <= 0) {
      this.hp = 0;
      triggerGameOver(reason);
    }
  },
  update(dt) {
    // Pergerakan Menuju Posisi Sentuhan / Tap Layar
    if (touchTarget) {
      let destX = touchTarget.x - this.width / 2;
      let destY = touchTarget.y - this.height / 2;
      let dx = destX - this.x;
      let dy = destY - this.y;
      let dist = Math.hypot(dx, dy);

      if (dist > 5) {
        let step = this.speed * dt;
        if (step > dist) step = dist;
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    // Pergerakan dengan Keyboard (jika ada)
    if (keys.ArrowUp || keys.w) this.y -= this.speed * dt;
    if (keys.ArrowDown || keys.s) this.y += this.speed * dt;
    if (keys.ArrowLeft || keys.a) this.x -= this.speed * dt;
    if (keys.ArrowRight || keys.d) this.x += this.speed * dt;

    if (this.x < 0) this.x = 0;
    if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
    if (this.y < 50) this.y = 50;
    if (this.y + this.height > canvas.height) this.y = canvas.height - this.height;

    if (this.invincibleTimer > 0) this.invincibleTimer--;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;

    this.autoShootTimer += dt;
    if (this.autoShootTimer >= this.shootInterval) {
      this.shoot();
      this.autoShootTimer = 0;
    }
  },
  shoot() {
    let count = this.shotDirections;
    let bulletSpeed = 9;

    for (let i = 0; i < count; i++) {
      let angle = 0;
      if (count > 1) {
        let step = (Math.PI / 6);
        angle = (i - (count - 1) / 2) * (step / ((count - 1) / 2));
      }

      playerBullets.push({
        x: this.x + this.width,
        y: this.y + this.height / 2 - 3,
        width: 10,
        height: 6,
        vx: Math.cos(angle) * bulletSpeed,
        vy: Math.sin(angle) * bulletSpeed
      });
    }
    playSound('shoot');
  },
  applyRandomBuff() {
    let buffType = Math.floor(Math.random() * 4);
    if (buffType === 0) {
      this.shootInterval = Math.max(0.25, this.shootInterval - 0.2);
      addFloatingText(this.x, this.y - 10, 'BUFF: TEMBAKAN CEPAT!', '#38bdf8');
    } else if (buffType === 1) {
      if (this.shotDirections < 7) {
        this.shotDirections += 2;
        if (this.shotDirections > 7) this.shotDirections = 7;
      }
      addFloatingText(this.x, this.y - 10, `BUFF: ${this.shotDirections} PELURU SPREAD!`, '#facc15');
    } else if (buffType === 2) {
      this.shieldTimer = 60.0;
      addFloatingText(this.x, this.y - 10, 'BUFF: SHIELD 60s!', '#a855f7');
    } else {
      this.hp = 3;
      addFloatingText(this.x, this.y - 10, 'BUFF: FULL HEAL!', '#22c55e');
    }
  },
  draw() {
    ctx.save();
    if (this.shieldTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x + this.width/2, this.y + this.height/2, 40, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (this.invincibleTimer % 10 < 5) {
      if (images.player) {
        ctx.drawImage(images.player, this.x, this.y, this.width, this.height);
      } else {
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width/2, this.y + this.height/2, this.width/2, this.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x + this.width - 12, this.y + 10, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
};

let playerBullets = [];
let enemyBullets = [];
let enemies = [];
let mines = [];
let o2Bubbles = [];
let particles = [];
let buffBubbles = [];

// Gelembung Buff / Heal
class BuffBubble {
  constructor() {
    this.x = canvas.width + 30;
    this.y = Math.random() * (canvas.height - 120) + 60;
    this.radius = 18;
    this.speed = 1.2;
    this.pulse = 0;
  }
  update() {
    this.x -= this.speed;
    this.pulse += 0.05;
  }
  draw() {
    ctx.save();
    let r = this.radius + Math.sin(this.pulse) * 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', this.x, this.y);
    ctx.restore();
  }
}

// Gelembung O2 (Area 30% Kiri Canvas)
class O2Bubble {
  constructor() {
    let maxAreaX = canvas.width * 0.3;
    this.x = Math.random() * (maxAreaX - 30) + 15;
    this.y = canvas.height + 20;
    this.radius = 16;
    this.speed = 1.2 + Math.random() * 0.5;
  }
  update() {
    this.y -= this.speed;
    this.x += Math.sin(this.y * 0.04) * 0.8;
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.fill();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O₂', this.x, this.y);
    ctx.restore();
  }
}

// Musuh Bom
class Mine {
  constructor() {
    this.x = canvas.width + 50;
    this.width = 60;
    this.height = 60;
    this.y = Math.random() * (canvas.height - 120) + 50;
    this.speed = 1.0 + (level * 0.05);
    this.hp = 1 + level;
  }
  update() {
    this.x -= this.speed;
  }
  draw() {
    if (images.mine) {
      ctx.drawImage(images.mine, this.x, this.y, this.width, this.height);
    } else {
      ctx.save();
      ctx.translate(this.x + this.width/2, this.y + this.height/2);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// Musuh Manusia
class Enemy {
  constructor() {
    this.x = canvas.width + 60;
    this.width = 75;
    this.height = 55;
    this.y = Math.random() * (canvas.height - 120) + 50;
    this.speed = 0.7 + (level * 0.03);
    this.hp = 1 + Math.floor(level / 2);
    this.shootTimer = 3.0;
  }
  update(dt) {
    this.x -= this.speed;
    this.shootTimer -= dt;

    if (this.shootTimer <= 0) {
      enemyBullets.push({
        x: this.x,
        y: this.y + this.height / 2,
        radius: 6,
        vx: -3.5 - (level * 0.1),
        vy: 0
      });
      this.shootTimer = 3.0;
    }
  }
  draw() {
    if (images.enemy) {
      ctx.drawImage(images.enemy, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}

// BOS
class Boss {
  constructor() {
    this.x = canvas.width + 120;
    this.targetX = canvas.width * 0.65;
    this.width = 130;
    this.height = 95;
    this.y = canvas.height / 2 - 45;
    this.speed = 1.0;
    this.vy = 0.6;
    this.hp = 8 + (level * 5);
    this.maxHp = this.hp;
    this.shootTimer = 5.0;
  }
  update(dt) {
    if (this.x > this.targetX) {
      this.x -= this.speed;
    } else {
      this.x = this.targetX;
      this.y += this.vy;
      if (this.y <= 60) {
        this.y = 60;
        this.vy = Math.abs(this.vy);
      }
      if (this.y + this.height >= canvas.height - 10) {
        this.y = canvas.height - 10 - this.height;
        this.vy = -Math.abs(this.vy);
      }
    }

    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      let bSpeed = 1.8 + (level * 0.05);
      let centerY = this.y + this.height / 2;

      enemyBullets.push({ x: this.x, y: centerY, radius: 7, vx: -bSpeed, vy: 0 });
      enemyBullets.push({ x: this.x, y: centerY, radius: 7, vx: -bSpeed, vy: -0.5 });
      enemyBullets.push({ x: this.x, y: centerY, radius: 7, vx: -bSpeed, vy: 0.5 });

      this.shootTimer = 5.0;
    }
  }
  draw() {
    if (images.enemy) {
      ctx.drawImage(images.enemy, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(this.x + 5, this.y + 5, this.width - 10, this.height - 10);
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(this.x, this.y - 15, this.width, 8);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(this.x, this.y - 15, this.width * (this.hp / this.maxHp), 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y - 15, this.width, 8);
  }
}

// Partikel Ledakan
function createExplosion(x, y, color = '#f97316', count = 25) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      size: Math.random() * 5 + 2,
      life: 25,
      color: color
    });
  }
  playSound('explode');
}

// ==========================================
// 5. DETEKSI TABRAKAN (COLLISION LOGIC)
// ==========================================
function checkCollisions() {
  playerBullets.forEach((b, bIndex) => {

    if (bossActive && boss) {
      if (b.x < boss.x + boss.width && b.x + b.width > boss.x &&
          b.y < boss.y + boss.height && b.y + b.height > boss.y) {
        createExplosion(b.x, b.y, '#f97316', 10);
        playerBullets.splice(bIndex, 1);
        boss.hp--;

        if (boss.hp <= 0) {
          createExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#ef4444', 60);
          
          level++;
          score += 100;
          
          player.hp = Math.min(3, player.hp + 1);
          player.shieldTimer = Math.max(player.shieldTimer, 15.0);

          let bossIncrement = 200 + (level * 100);
          nextBossThreshold += bossIncrement;

          addFloatingText(boss.x + boss.width/2, boss.y, '+100 BOS TERBUNUH!', '#ef4444');
          bossActive = false;
          boss = null;
        }
        return;
      }
    }

    enemies.forEach((e, eIndex) => {
      if (b.x < e.x + e.width && b.x + b.width > e.x &&
          b.y < e.y + e.height && b.y + b.height > e.y) {
        playerBullets.splice(bIndex, 1);
        e.hp--;
        createExplosion(e.x + e.width/2, e.y + e.height/2, '#f97316', 10);

        if (e.hp <= 0) {
          createExplosion(e.x + e.width/2, e.y + e.height/2, '#f97316', 25);
          enemies.splice(eIndex, 1);
          score += 15;
          addFloatingText(e.x + e.width/2, e.y, '+15', '#facc15');
        }
      }
    });

    mines.forEach((m, mIndex) => {
      if (b.x < m.x + m.width && b.x + b.width > m.x &&
          b.y < m.y + m.height && b.y + b.height > m.y) {
        playerBullets.splice(bIndex, 1);
        m.hp--;
        createExplosion(m.x + m.width/2, m.y + m.height/2, '#ef4444', 10);

        if (m.hp <= 0) {
          let centerX = m.x + m.width/2;
          let centerY = m.y + m.height/2;
          createExplosion(centerX, centerY, '#ef4444', 35);
          mines.splice(mIndex, 1);
          score += 5;
          addFloatingText(centerX, centerY, '+5', '#38bdf8');

          let dist = Math.hypot((player.x + player.width/2) - centerX, (player.y + player.height/2) - centerY);
          if (dist < 90) {
            player.takeDamage(1, 'Kamu terkena jangkauan ledakan ranjau!');
          }
        }
      }
    });
  });

  buffBubbles.forEach((bb, bbIndex) => {
    let dist = Math.hypot((player.x + player.width/2) - bb.x, (player.y + player.height/2) - bb.y);
    if (dist < player.width/2 + bb.radius) {
      buffBubbles.splice(bbIndex, 1);
      player.applyRandomBuff();
    }
  });

  if (bossActive && boss) {
    if (player.x < boss.x + boss.width && player.x + player.width > boss.x &&
        player.y < boss.y + boss.height && player.y + player.height > boss.y) {
      player.takeDamage(1, 'Kamu menabrak Bos Pemburu!');
    }
  }

  enemies.forEach((e, eIndex) => {
    if (player.x < e.x + e.width && player.x + player.width > e.x &&
        player.y < e.y + e.height && player.y + player.height > e.y) {
      createExplosion(e.x + e.width/2, e.y + e.height/2, '#ea580c', 35);
      enemies.splice(eIndex, 1);
      player.takeDamage(1, 'Kamu menabrak Pemburu Ikan!');
    }
  });

  mines.forEach((m, mIndex) => {
    if (player.x < m.x + m.width && player.x + player.width > m.x &&
        player.y < m.y + m.height && player.y + player.height > m.y) {
      createExplosion(m.x + m.width/2, m.y + m.height/2, '#ef4444', 40);
      mines.splice(mIndex, 1);
      player.takeDamage(1, 'Kamu menabrak ranjau laut!');
    }
  });

  enemyBullets.forEach((eb, ebIndex) => {
    if (eb.x > player.x && eb.x < player.x + player.width &&
        eb.y > player.y && eb.y < player.y + player.height) {
      enemyBullets.splice(ebIndex, 1);
      createExplosion(player.x + player.width/2, player.y + player.height/2, '#ef4444');
      player.takeDamage(1, 'Kamu tertembak oleh Pemburu Ikan!');
    }
  });

  o2Bubbles.forEach((ob, obIndex) => {
    let dist = Math.hypot((player.x + player.width/2) - ob.x, (player.y + player.height/2) - ob.y);
    if (dist < player.width/2 + ob.radius) {
      o2Bubbles.splice(obIndex, 1);
      o2Timer = Math.min(MAX_O2, o2Timer + 5.0);
      playSound('o2');
    }
  });
}

// ==========================================
// 6. GAME LOOP & GAME OVER HANDLER
// ==========================================
let lastTime = performance.now();

function resetGame() {
  score = 0;
  level = 0;
  nextBossThreshold = 200;
  bossActive = false;
  boss = null;
  o2Timer = MAX_O2;
  
  mineTimerAcc = 0;
  enemyTimerAcc = 0;
  o2TimerAcc = 0;
  hpRegenTimerAcc = 0;

  buffBubbleTimerAcc = 0;
  nextBuffBubbleInterval = getNextBuffInterval();

  playerBullets = [];
  enemyBullets = [];
  enemies = [];
  mines = [];
  o2Bubbles = [];
  buffBubbles = [];
  particles = [];
  floatingTexts = [];
  player.reset();
  
  gameState = 'PLAYING';
  gameOverScreen.classList.add('hidden');
  startScreen.classList.add('hidden');
  
  audio.gameOver.pause();
  audio.gameOver.currentTime = 0;
  if (!isMuted) audio.bgm.play().catch(() => {});
}

function triggerGameOver(reason) {
  gameState = 'GAMEOVER';
  screenFlash = 12;
  deathReasonEl.textContent = reason;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('archer_highscore', highScore);
  }
  finalScoreEl.textContent = score;
  highScoreTextEl.textContent = highScore;
  gameOverScreen.classList.remove('hidden');

  audio.bgm.pause();
  playSound('gameOver'); // Memutar suara Game Over
}

function gameLoop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (images.bg) {
    ctx.drawImage(images.bg, 0, 0, canvas.width, canvas.height);
  } else {
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(1, '#0369a1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (gameState === 'PLAYING') {
    o2Timer -= dt;
    if (o2Timer <= 0) {
      o2Timer = 0;
      triggerGameOver('Kehabisan Oksigen!');
    }

    hpRegenTimerAcc += dt;
    if (hpRegenTimerAcc >= 30.0) {
      hpRegenTimerAcc = 0;
      if (player.hp < 3) {
        player.hp++;
        addFloatingText(player.x, player.y - 15, '+1 HP REGEN', '#22c55e');
      }
    }

    buffBubbleTimerAcc += dt;
    if (buffBubbleTimerAcc >= nextBuffBubbleInterval) {
      buffBubbles.push(new BuffBubble());
      buffBubbleTimerAcc = 0;
      nextBuffBubbleInterval = getNextBuffInterval();
    }

    let o2Interval = Math.min(5.0, 1.0 + (level * 0.8));
    o2TimerAcc += dt;
    if (o2TimerAcc >= o2Interval) {
      o2Bubbles.push(new O2Bubble());
      o2TimerAcc = 0;
    }

    mineTimerAcc += dt;
    if (mineTimerAcc >= 3.0) {
      mines.push(new Mine());
      mineTimerAcc = 0;
    }

    enemyTimerAcc += dt;
    if (enemyTimerAcc >= 5.0) {
      enemies.push(new Enemy());
      enemyTimerAcc = 0;
    }

    if (score >= nextBossThreshold && !bossActive) {
      bossActive = true;
      boss = new Boss();
    }

    player.update(dt);
    if (bossActive && boss) boss.update(dt);
    checkCollisions();

    playerBullets.forEach((b, i) => {
      b.x += b.vx;
      b.y += (b.vy || 0);
      if (b.x > canvas.width || b.y < 0 || b.y > canvas.height) playerBullets.splice(i, 1);
    });

    enemyBullets.forEach((eb, i) => {
      eb.x += eb.vx;
      eb.y += (eb.vy || 0);
      if (eb.x < 0 || eb.y < 0 || eb.y > canvas.height) enemyBullets.splice(i, 1);
    });

    o2Bubbles.forEach((ob, i) => {
      ob.update();
      if (ob.y < -20) o2Bubbles.splice(i, 1);
    });
    buffBubbles.forEach((bb, i) => {
      bb.update();
      if (bb.x < -30) buffBubbles.splice(i, 1);
    });
    mines.forEach((m, i) => {
      m.update();
      if (m.x < -50) mines.splice(i, 1);
    });
    enemies.forEach((e, i) => {
      e.update(dt);
      if (e.x < -60) enemies.splice(i, 1);
    });
  }

  o2Bubbles.forEach(ob => ob.draw());
  buffBubbles.forEach(bb => bb.draw());
  mines.forEach(m => m.draw());
  enemies.forEach(e => e.draw());
  if (bossActive && boss) boss.draw();
  player.draw();

  ctx.fillStyle = '#38bdf8';
  playerBullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#f43f5e';
  enemyBullets.forEach(eb => {
    ctx.beginPath();
    ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  particles.forEach((p, i) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    if (p.life <= 0) particles.splice(i, 1);
  });

  updateAndDrawFloatingTexts();

  if (gameState === 'PLAYING' || gameState === 'GAMEOVER') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(10, 10, 560, 50);

    let o2Ratio = Math.max(0, o2Timer / MAX_O2);
    let barColor = o2Ratio > 0.5 ? '#38bdf8' : (o2Ratio > 0.25 ? '#facc15' : '#ef4444');

    ctx.fillStyle = '#334155';
    ctx.fillRect(20, 35, 160, 14);
    ctx.fillStyle = barColor;
    ctx.fillRect(20, 35, 160 * o2Ratio, 14);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`OKSIGEN O₂: ${o2Timer.toFixed(1)}s`, 20, 26);
    ctx.fillText(`SKOR: ${score}`, 190, 26);
    ctx.fillText(`LVL: ${level + 1}`, 280, 26);

    let hpHearts = '❤️ '.repeat(player.hp).trim() || '💀';
    ctx.fillText(`HP: ${hpHearts}`, 340, 26);

    if (player.shieldTimer > 0) {
      ctx.fillStyle = '#c084fc';
      ctx.fillText(`🛡️ ${Math.ceil(player.shieldTimer)}s`, 430, 26);
    }
  }

  if (screenFlash > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${screenFlash / 20})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    screenFlash--;
  }

  requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', resetGame);
restartBtn.addEventListener('click', resetGame);
requestAnimationFrame(gameLoop);