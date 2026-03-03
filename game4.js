const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const overlay = document.getElementById("overlay");
const nameInput = document.getElementById("playerName");
const startBtn = document.getElementById("startBtn");

let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function fitCanvas() {
  const w = 800, h = 220;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener("resize", fitCanvas);

const groundY = 180;

let last = 0;
let running = false;
let started = false;
let gameOver = false;
let speed = 6;
let score = 0;
let best = 0;
let spawnTimer = 0;
let loveTriggered = false;
let loveTimer = 0;

let obstacles = [];
let clouds = [];
let hearts = [];

let inputs = { down: false, wasDown: false };
let playerName = "";

function rand(a, b) { return Math.random() * (b - a) + a; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

class Cat {
  constructor() {
    this.x = 60;
    this.y = groundY;
    this.w = 30;
    this.h = 54;
    this.vy = 0;
    this.onGround = true;
    this.jumpCount = 0;
    this.tailPhase = 0;
  }
  update(dt) {
    const g = 1200;
    const cut = 1600;
    const ms = dt * 0.001;
    this.vy += g * ms;
    this.tailPhase += dt * 0.006;
    const press = inputs.down && !inputs.wasDown;
    if (press) {
      if (this.onGround) {
        this.vy = -460;
        this.onGround = false;
        this.jumpCount = 1;
      } else if (this.jumpCount < 2) {
        this.vy = -400;
        this.jumpCount++;
      }
    }
    if (!inputs.down && this.vy < 0) this.vy += cut * ms;
    this.y += this.vy * ms;
    if (this.y > groundY) {
      this.y = groundY;
      this.vy = 0;
      this.onGround = true;
      this.jumpCount = 0;
    }
  }
  bbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  draw() {
    const x = this.x, y = this.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#111";

    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-6, 5, 0, 3);     // 底部中间略向下凸
    ctx.quadraticCurveTo(6, 5, 12, 0);
    ctx.bezierCurveTo(12, -8, 12, -26, 10, -42);
    ctx.bezierCurveTo(8, -58, -8, -58, -10, -42);
    ctx.bezierCurveTo(-12, -26, -12, -8, -12, 0);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -66, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -66, 12, -3.00, -2.10, false); // 更宽的底部弧线
    ctx.lineTo(-8, -82);                      // 更低更钝的耳尖
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -66, 12, -1.04, -0.10, false); // 对称加宽
    ctx.lineTo(8, -82);                       // 更低更钝的耳尖
    ctx.closePath();
    ctx.fillStyle = "#111";
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111";
    const sway = Math.sin(this.tailPhase) * 6;
    ctx.beginPath();
    ctx.moveTo(6, -6);
    ctx.quadraticCurveTo(18 + sway * 0.4, -2, 22 + sway, -18);
    ctx.quadraticCurveTo(24 + sway * 0.5, -30, 16 + sway * 0.2, -28);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-5, -68, 3.2, 0, Math.PI * 2);
    ctx.arc(5, -68, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(-5, -68, 1.6, 0, Math.PI * 2);
    ctx.arc(5, -68, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Obstacle {
  constructor() {
    const opts = [{ w: 24, h: 30 }, { w: 30, h: 34 }, { w: 34, h: 38 }];
    const t = opts[(Math.random() * opts.length) | 0];
    this.w = t.w;
    this.h = t.h;
    this.x = canvas.width / dpr + 20;
    this.y = groundY - this.h + 6;
  }
  update(dt) { this.x -= speed * dt * 0.06; }
  offscreen() { return this.x + this.w < 0; }
  bbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  draw() {
    const w = this.w, h = this.h, x = this.x, y = this.y;
    ctx.save();
    ctx.translate(x, y);
    const cx = w * 0.5;
    const stalkW = w * 0.36;
    const stalkH = 10;
    ctx.fillStyle = "#e9c89b";
    ctx.fillRect(cx - stalkW / 2, h - stalkH, stalkW, stalkH);
    ctx.fillStyle = "#d33";
    ctx.beginPath();
    ctx.ellipse(cx, h - stalkH, w * 0.65, h * 0.55, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#fff";
    const spots = [
      [-w * 0.22, -stalkH - h * 0.12],
      [w * 0.22, -stalkH - h * 0.12],
      [-w * 0.10, -stalkH - h * 0.22],
      [w * 0.10, -stalkH - h * 0.22],
    ];
    for (const s of spots) {
      ctx.beginPath();
      ctx.arc(cx + s[0], h + s[1], 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

class Cloud {
  constructor() {
    this.x = canvas.width / dpr + 20;
    this.y = rand(30, 90);
    this.v = rand(0.8, 1.6);
  }
  update(dt) { this.x -= this.v * dt * 0.06; }
  offscreen() { return this.x < -60; }
  draw() {
    ctx.fillStyle = "#d9d9d9";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 12, 0, Math.PI * 2);
    ctx.arc(this.x + 16, this.y + 4, 10, 0, Math.PI * 2);
    ctx.arc(this.x - 16, this.y + 4, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Heart {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = rand(-40, 40);
    this.vy = rand(-160, -60);
    this.life = rand(1.2, 2.2);
  }
  update(dt) {
    const ms = dt * 0.001;
    this.vy += 260 * ms;
    this.x += this.vx * ms;
    this.y += this.vy * ms;
    this.life -= ms;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "#ff4d6d";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-6, -6, -12, 2, 0, 10);
    ctx.bezierCurveTo(12, 2, 6, -6, 0, 0);
    ctx.fill();
    ctx.restore();
  }
}

function drawGround() {
  ctx.fillStyle = "#444";
  ctx.fillRect(0, groundY + 8, canvas.width / dpr, 2);
  ctx.fillStyle = "#888";
  for (let x = 0; x < canvas.width / dpr; x += 28) ctx.fillRect(x, groundY + 10, 16, 2);
}

const cat = new Cat();

function reset() {
  running = false;
  gameOver = false;
  started = false;
  loveTriggered = false;
  loveTimer = 0;
  speed = 6;
  score = 0;
  spawnTimer = 0;
  obstacles = [];
  clouds = [];
  hearts = [];
  cat.x = 60;
  cat.y = groundY;
  cat.vy = 0;
  cat.onGround = true;
  cat.jumpCount = 0;
  scoreEl.textContent = "0";
  statusEl.textContent = "BEST " + best;
  overlay.style.display = "";
}
reset();

function loadBestForName(name){
  try{
    const v = localStorage.getItem("kia_cat_best_"+name);
    return v? parseInt(v,10)||0 : 0;
  }catch(_){ return 0 }
}
function saveBestForName(name,value){
  try{ localStorage.setItem("kia_cat_best_"+name,String(value)) }catch(_){}
}
function start() {
  if(!playerName){
    const v = (nameInput && nameInput.value || "").trim();
    if(!v){
      if(nameInput){ nameInput.focus(); }
      return;
    }
    playerName = v;
    try{ localStorage.setItem("kia_cat_name", playerName) }catch(_){}
    best = loadBestForName(playerName);
    statusEl.textContent = "BEST " + best;
  }
  started = true; running = true; overlay.style.display = "none";
}
// prefill name
try{
  const saved = localStorage.getItem("kia_cat_name");
  if(saved && nameInput){ nameInput.value = saved }
}catch(_){}
if(nameInput){
  nameInput.addEventListener("keydown",function(e){ if(e.key==="Enter"){ start(); } });
}

function update(dt) {
  if (!running) return;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    obstacles.push(new Obstacle());
    spawnTimer = rand(700, 1200) / Math.max(1, speed / 8);
  }
  if (Math.random() < 0.008) clouds.push(new Cloud());
  obstacles.forEach(o => o.update(dt));
  clouds.forEach(c => c.update(dt));
  obstacles = obstacles.filter(o => !o.offscreen());
  clouds = clouds.filter(c => !c.offscreen());
  cat.update(dt);
  for (const o of obstacles) {
    if (rects(cat.bbox(), o.bbox())) {
      running = false;
      gameOver = true;
      best = Math.max(best, Math.floor(score));
      if(playerName && best){
        const prev = loadBestForName(playerName);
        if(best>prev) saveBestForName(playerName,best);
      }
      statusEl.textContent = "BEST " + best;
      overlay.style.display = "";
      overlay.querySelector(".title").textContent = "游戏结束，点击或按空格重来";
      return;
    }
  }
  score += dt * 0.01 * speed;
  scoreEl.textContent = (Math.floor(score)).toString().padStart(5, "0");
  speed = 6 + Math.min(10, Math.floor(score / 120));

  if (!loveTriggered && Math.floor(score) >= 1000) {
    loveTriggered = true;
    loveTimer = 3;
    for (let i = 0; i < 36; i++) hearts.push(new Heart(rand(40, canvas.width / dpr - 40), rand(40, 120)));
  }
  if (loveTriggered) {
    hearts.forEach(h => h.update(dt));
    hearts = hearts.filter(h => h.life > 0);
    loveTimer -= dt * 0.001;
    if (loveTimer <= 0) {
      loveTriggered = false;
      hearts = [];
    }
  }

  inputs.wasDown = inputs.down;
}

function drawLoveMessage() {
  if (!loveTriggered) return;
  const w = canvas.width / dpr;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillStyle = "#ff4d6d";
  ctx.fillText("Kia loves you!", w / 2, 48);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  clouds.forEach(c => c.draw());
  drawGround();
  obstacles.forEach(o => o.draw());
  cat.draw();
  hearts.forEach(h => h.draw());
  drawLoveMessage();
}

function loop(ts) {
  if (!last) last = ts;
  const dt = clamp(ts - last, 0, 50);
  last = ts;
  if (started && !gameOver) update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function onKey(e) {
  if (e.type === "keydown") {
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (!started) start();
      inputs.down = true;
    }
  } else {
    if (e.code === "Space" || e.code === "ArrowUp") {
      inputs.down = false;
      if (gameOver) { reset(); start(); }
    }
  }
}
function onPointer(e) { if (!started) start(); inputs.down = e.type !== "pointerup"; }
window.addEventListener("keydown", onKey);
window.addEventListener("keyup", onKey);
canvas.addEventListener("pointerdown", onPointer);
canvas.addEventListener("pointerup", onPointer);
canvas.addEventListener("pointerleave", () => { inputs.down = false; });
document.addEventListener("visibilitychange", () => { if (document.hidden) inputs.down = false; });
statusEl.textContent = "BEST 0";
if(startBtn){ startBtn.addEventListener("click", start); }

const shareBtn=document.getElementById("shareBtn");
const shareMask=document.getElementById("shareMask");
const sharePanel=document.getElementById("sharePanel");
const shareLink=document.getElementById("shareLink");
const qrImg=document.getElementById("qrImg");
const copyBtn=document.getElementById("copyBtn");
const closeShare=document.getElementById("closeShare");
function buildShareURL(){
  const u = new URL(location.href);
  if(playerName) u.searchParams.set("n", playerName);
  if(best) u.searchParams.set("s", String(best));
  return u.href;
}
function openShare(){
  if(!playerName){
    start();
    if(!playerName) return;
  }
  const url=buildShareURL();
  shareLink.value=url;
  const qrUrl="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data="+encodeURIComponent(url);
  const img=new Image();
  img.crossOrigin="anonymous";
  img.onload=()=>{
    const c=document.createElement("canvas");
    const W=260,H=320;
    c.width=W; c.height=H;
    const g=c.getContext("2d");
    g.fillStyle="#fff"; g.fillRect(0,0,W,H);
    g.drawImage(img, (W-220)/2, 18, 220, 220);
    g.fillStyle="#111";
    g.textAlign="center";
    g.font="bold 16px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,PingFang SC,Microsoft YaHei,sans-serif";
    g.fillText("玩家: "+playerName, W/2, 260);
    g.font="14px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,PingFang SC,Microsoft YaHei,sans-serif";
    g.fillText("最高分: "+best, W/2, 286);
    try{
      const data=c.toDataURL("image/png");
      qrImg.src=data;
    }catch(_){
      qrImg.src=qrUrl;
    }
  };
  img.onerror=()=>{ qrImg.src=qrUrl };
  img.src=qrUrl;
  shareMask.style.display="";
  sharePanel.style.display="";
}
function closeSharePanel(){
  shareMask.style.display="none";
  sharePanel.style.display="none";
}
if(shareBtn){
  shareBtn.addEventListener("click",openShare);
  shareMask.addEventListener("click",closeSharePanel);
  closeShare.addEventListener("click",closeSharePanel);
  copyBtn.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(shareLink.value)}catch(e){shareLink.select();document.execCommand&&document.execCommand("copy")}})
}
