import { Events, gameState, activeEffects, mouse, GROUND_H, world, eggs, enemies, fallingObstacles, powerups, bullets, explosions, particles, popups, W, H } from './state.js';

export function initGraphics() {
  const ctx = world.render.context;
  ctx.imageSmoothingEnabled = false;
  if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;
  if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
  if ('msImageSmoothingEnabled' in ctx) ctx.msImageSmoothingEnabled = false;

  Events.on(world.render, 'afterRender', () => {
    const ctx = world.render.context;
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    // Sky gradient (indie sunset)
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2b1b4d');
    sky.addColorStop(0.45, '#5d3e85');
    sky.addColorStop(0.75, '#b86b8e');
    sky.addColorStop(1, '#f4a261');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Stars (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 20; i++) {
      const sx = (i * 137.5 + w * 0.2) % w;
      const sy = (i * 73.3) % (h * 0.45);
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Sun
    const sunX = w * 0.75;
    const sunY = h * 0.28;
    const sunG = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 60);
    sunG.addColorStop(0, '#fff7d6');
    sunG.addColorStop(0.4, '#ffcb69');
    sunG.addColorStop(1, 'rgba(244,162,97,0)');
    ctx.fillStyle = sunG;
    ctx.beginPath(); ctx.arc(sunX, sunY, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(sunX, sunY, 24, 0, Math.PI * 2); ctx.fill();

    // Fireflies / dust
    for (let i = 0; i < 18; i++) {
      const fx = (i * 97 + world.engine.timing.timestamp * 0.015) % w;
      const fy = h * 0.45 + Math.sin(world.engine.timing.timestamp * 0.002 + i * 1.3) * h * 0.28;
      const alpha = 0.3 + 0.5 * Math.sin(world.engine.timing.timestamp * 0.005 + i * 2);
      ctx.fillStyle = `rgba(255, 209, 102, ${alpha})`;
      ctx.fillRect(fx, fy, 3, 3);
    }

    // Vignette
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Parallax mountains
    drawMountains(ctx, w, h, 0.2, '#3e2a5e', 0.003, 120);
    drawMountains(ctx, w, h, 0.4, '#5d3e7d', 0.006, 90);
    drawMountains(ctx, w, h, 0.7, '#7b548f', 0.012, 60);

    // Clouds
    drawCloud(ctx, (w * 0.15 + (world.engine.timing.timestamp * 0.008) % (w + 160)) - 80, 60, 1.1);
    drawCloud(ctx, (w * 0.55 + (world.engine.timing.timestamp * 0.005) % (w + 160)) - 80, 95, 0.85);

    // Ground
    const groundTop = h - GROUND_H;
    const gnd = ctx.createLinearGradient(0, groundTop, 0, h);
    gnd.addColorStop(0, '#5e8c42');
    gnd.addColorStop(0.25, '#4a7c35');
    gnd.addColorStop(1, '#3d612b');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, groundTop, w, GROUND_H);

    // Grass top
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(0, groundTop, w, 10);
    ctx.fillStyle = '#8bc34a';
    ctx.fillRect(0, groundTop, w, 4);

    // Grass tufts
    ctx.fillStyle = '#4e7c1f';
    for (let x = 0; x < w; x += 24) {
      const gh = 3 + (x % 5);
      ctx.fillRect(x, groundTop + 6, 3, gh);
      ctx.fillRect(x + 6, groundTop + 5, 3, gh + 1);
    }

    // Decorative rocks
    ctx.fillStyle = '#6d5f55';
    ctx.beginPath(); ctx.arc(w * 0.15, groundTop + 10, 8, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#5d4f45';
    ctx.beginPath(); ctx.arc(w * 0.85, groundTop + 12, 10, Math.PI, 0); ctx.fill();

    // Game objects
    for (const e of eggs) drawEgg(ctx, e);
    for (const en of enemies) drawEnemy(ctx, en);
    drawChicken(ctx, world.player);
    for (const o of fallingObstacles) drawFalling(ctx, o);
    for (const p of powerups) drawPowerup(ctx, p);

    // Bullets
    for (const b of bullets) {
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-8, -3, 16, 6);
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(-4, -1.5, 8, 3);
      ctx.restore();
    }

    // Explosions
    for (const ex of explosions) {
      ctx.save();
      for (const bit of ex.bits) {
        ctx.fillStyle = bit.color;
        ctx.globalAlpha = Math.max(0, bit.life);
        ctx.fillRect(bit.x, bit.y, bit.size, bit.size);
      }
      ctx.restore();
    }

    // Crosshair
    if (gameState.running) {
      const px = world.player.position.x;
      const py = world.player.position.y;
      const rect = world.render.canvas.getBoundingClientRect();
      const scaleX = world.render.options.width / rect.width;
      const scaleY = world.render.options.height / rect.height;
      const mx = (mouse.x - rect.left) * scaleX;
      const my = (mouse.y - rect.top) * scaleY;
      const angle = Math.atan2(my - py, mx - px);
      const r = 28;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(r - 8, 0);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color === '#dust' ? '#d7ccc8' : p.color;
      const r = p.body.circleRadius * p.life;
      ctx.beginPath();
      ctx.arc(p.body.position.x, p.body.position.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of popups) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }

    if (gameState.running) {
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w * 0.34, h);
      ctx.fillRect(w * 0.66, 0, w * 0.34, h);
      ctx.restore();
    }

    // Active effects visuals
    if (activeEffects.slowTime > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#7c4dff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (activeEffects.shield > 0) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(world.engine.timing.timestamp * 0.015);
      ctx.beginPath();
      ctx.arc(world.player.position.x, world.player.position.y, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (activeEffects.magnet > 0) {
      ctx.save();
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(world.player.position.x, world.player.position.y, 140, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawMountains(ctx, w, h, parallax, color, freq, amp) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h - GROUND_H);
  const offset = (world.engine.timing.timestamp * parallax) % w;
  for (let x = -offset; x <= w + offset; x += 30) {
    const y = h - GROUND_H - amp - 20 * Math.sin((x + offset * 0.5) * freq) - 15 * Math.sin((x + offset * 0.3) * freq * 2.5);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h - GROUND_H); ctx.closePath(); ctx.fill();
}

function drawCloud(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(255, 220, 230, 0.85)';
  ctx.beginPath(); ctx.arc(x, y, 18 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 22 * s, y - 6 * s, 22 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 44 * s, y, 18 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 22 * s, y + 8 * s, 16 * s, 0, Math.PI * 2); ctx.fill();
}

function drawEgg(ctx, e) {
  const { x, y } = e.position;
  const golden = e.gameData.golden;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(e.angle);
  ctx.fillStyle = golden ? '#ffd700' : '#fff9c4';
  ctx.strokeStyle = golden ? '#d4a000' : '#c9b98a';
  ctx.lineWidth = 2;
  const ew = 14, eh = 18;
  ctx.beginPath();
  ctx.ellipse(0, 0, ew / 2, eh / 2, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = golden ? '#ffecb3' : '#fff';
  ctx.beginPath();
  ctx.ellipse(-3, -5, 3, 5, -0.3, 0, Math.PI * 2); ctx.fill();
  if (golden) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 8, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(ctx, e) {
  const { x, y } = e.position;
  const d = e.gameData;
  const ph = d.walkPhase;
  const bob = Math.sin(ph) * 2;
  const c = d.color;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(d.facing, 1);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(0, d.r - 4, d.r * 0.8, 4, 0, 0, Math.PI * 2); ctx.fill();

  // tail
  const lp = Math.sin(ph) * 0.25;
  ctx.fillStyle = c;
  ctx.save();
  ctx.translate(-d.r * 0.9, -d.r * 0.1);
  ctx.rotate(lp - 0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, d.r * 0.22, d.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4e0';
  ctx.beginPath(); ctx.ellipse(0, -d.r * 0.45, d.r * 0.12, d.r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // body
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(0, 0, d.r * 0.85, d.r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.stroke();

  // belly
  ctx.fillStyle = '#fff4e0';
  ctx.beginPath(); ctx.ellipse(d.r * 0.1, d.r * 0.2, d.r * 0.5, d.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();

  // legs
  ctx.fillStyle = '#5a2a08';
  const legH = Math.sin(ph) * 5;
  ctx.fillRect(-d.r * 0.45, d.r * 0.45, d.r * 0.2, d.r * 0.4 + legH);
  ctx.fillRect(d.r * 0.25, d.r * 0.45, d.r * 0.2, d.r * 0.4 - legH);

  // head
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(d.r * 0.55, -d.r * 0.55, d.r * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.stroke();

  // snout
  ctx.fillStyle = '#fff4e0';
  ctx.beginPath(); ctx.ellipse(d.r * 1.0, -d.r * 0.25, d.r * 0.28, d.r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(d.r * 1.2, -d.r * 0.28, d.r * 0.1, 0, Math.PI * 2); ctx.fill();

  // ears
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(d.r * 0.3, -d.r * 0.85); ctx.lineTo(d.r * 0.45, -d.r * 1.25); ctx.lineTo(d.r * 0.6, -d.r * 0.85); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(d.r * 0.55, -d.r * 0.85); ctx.lineTo(d.r * 0.75, -d.r * 1.2); ctx.lineTo(d.r * 0.9, -d.r * 0.85); ctx.closePath(); ctx.fill();

  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(d.r * 0.7, -d.r * 0.6, d.r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(d.r * 0.78, -d.r * 0.6, d.r * 0.07, 0, Math.PI * 2); ctx.fill();

  // HP indicator for tanks
  if (d.hp > 1) {
    ctx.fillStyle = '#e53935';
    for (let h = 0; h < d.hp - 1; h++) {
      ctx.fillRect(-d.r + h * d.r * 0.5, -d.r * 1.7, d.r * 0.35, d.r * 0.15);
    }
  }
  ctx.restore();
}

function drawChicken(ctx, p) {
  const { x, y } = p.position;
  const sq = p.gameData.squash;
  const sx = 1 + sq * 0.3;
  const sy = 1 - sq * 0.3;
  const ph = p.gameData.walkPhase;
  const onG = p.gameData.onGround;
  const flap = !onG ? Math.sin(world.engine.timing.timestamp * 0.03) * 0.5 : 0;
  ctx.save();
  ctx.translate(x, y);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  const shadowY = H() - GROUND_H - y;
  ctx.beginPath(); ctx.ellipse(0, shadowY, 18 * sx, 5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.scale(p.gameData.facing * sx, sy);

  // legs
  ctx.fillStyle = '#f5a623';
  const lp = onG ? Math.sin(ph) * 4 : 2;
  ctx.fillRect(-6, 14, 4, 10 + lp);
  ctx.fillRect(4, 14, 4, 10 - lp);
  ctx.fillRect(-9, 22 + lp, 7, 3);
  ctx.fillRect(2, 22 - lp, 7, 3);

  // body
  ctx.fillStyle = '#ffeb3b';
  ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 2, 17, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // wing
  ctx.save();
  ctx.translate(-3, 4);
  ctx.rotate(flap);
  ctx.fillStyle = '#fdd835';
  ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.stroke();
  ctx.restore();

  // head
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath(); ctx.arc(10, -10, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // comb
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.arc(6, -20, 3, 0, Math.PI * 2);
  ctx.arc(11, -22, 3, 0, Math.PI * 2);
  ctx.arc(16, -20, 3, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.moveTo(19, -10); ctx.lineTo(26, -8); ctx.lineTo(19, -6); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = '#c97f10'; ctx.lineWidth = 1; ctx.stroke();

  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(14, -12, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(15, -12, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(15.5, -12.5, 0.7, 0, Math.PI * 2); ctx.fill();

  // wattle
  ctx.fillStyle = '#e53935';
  ctx.beginPath(); ctx.arc(13, -5, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawFalling(ctx, o) {
  const { x, y } = o.position;
  const d = o.gameData;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.angle);
  const w = 28;
  if (d.type === 'bird') {
    ctx.fillStyle = '#7c4dff';
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, w / 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(0, -2, w / 2 - 4, w / 4 - 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff0055';
    ctx.beginPath(); ctx.ellipse(w / 2 - 2, -2, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillRect(w / 2 - 6, -6, 4, 4);
    // wing
    ctx.fillStyle = '#5e35b1';
    ctx.beginPath(); ctx.ellipse(-8, 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#8d6e63';
    ctx.beginPath(); ctx.roundRect(-w / 2, -w / 2, w, w, 6); ctx.fill();
    ctx.fillStyle = '#6d4c41';
    ctx.beginPath(); ctx.roundRect(-w / 2 + 5, -w / 2 + 5, w - 10, w - 10, 4); ctx.fill();
    ctx.fillStyle = '#a1887f';
    ctx.beginPath(); ctx.arc(-w / 2 + 10, -w / 2 + 10, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPowerup(ctx, p) {
  const { x, y } = p.position;
  const t = p.gameData.type;
  const colors = { life: '#ff0055', shield: '#00e5ff', magnet: '#ffcc00', slow: '#7c4dff', double: '#ff9800' };
  const icons = { life: '♥', shield: 'S', magnet: 'M', slow: 'Z', double: '2' };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.angle);
  const pulse = 1 + 0.1 * Math.sin(world.engine.timing.timestamp * 0.01);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = colors[t]; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = colors[t];
  ctx.font = 'bold 16px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icons[t], 0, 1);
  ctx.restore();
}
