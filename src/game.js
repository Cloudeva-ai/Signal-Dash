class CloudQuestGame {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ui = ui;
    this.width = 960;
    this.height = 540;
    this.dpr = 1;
    this.petSprites = {};
    this.heroSprites = {};
    this.itemSprites = {};
    this.keys = { left: false, right: false, jump: false, interact: false };
    this.world = window.RCQ_WORLD;
    this.zones = window.RCQ_ZONES;
    this.chunkTemplates = window.RCQ_CHUNKS;
    this.cameraX = 0;
    this.paused = true;
    this.storyOpen = true;
    this.lastTime = 0;
    this.lives = 3;
    this.trust = 0;
    this.coins = 0;
    this.zoneIndex = 0;
    this.petUnlocked = true;
    this.message = "";
    this.messageTimer = 0;
    this.finished = false;
    this.gameOver = false;
    this.resizeCanvas();
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.render();
    });
    this.startRun();
  }

  resizeCanvas() {
    const nextDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    if (this.dpr === nextDpr && this.canvas.width === this.width * nextDpr) return;
    this.dpr = nextDpr;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.aspectRatio = `${this.width} / ${this.height}`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.textRendering = "geometricPrecision";
  }

  setPetSprites(sprites) {
    this.petSprites = sprites || {};
    this.render();
  }

  setHeroSprites(sprites) {
    this.heroSprites = sprites || {};
    this.render();
  }

  setItemSprites(sprites) {
    this.itemSprites = sprites || {};
    this.render();
  }

  getHeroVictorySrc() {
    return "./mascot/mascot_celebrating_cutout.png";
  }

  // ---------------------------------------------------------------- run setup

  startRun() {
    const w = this.world;
    this.cameraX = 0;
    this.trust = 0;
    this.coins = 0;
    this.zoneIndex = 0;
    this.finished = false;
    this.gameOver = false;
    this.chunks = [];
    this.platforms = [];
    this.collectibles = [];
    this.hazards = [];
    this.npcs = [];
    this.nextChunkX = 0;
    this.chunkSeed = 1;
    this.spawnedChunks = 0;
    this.lastTemplateId = "";
    this.lifeBonusAt = CloudQuestGame.LIFE_BONUS_EVERY;

    this.player = {
      x: 64,
      y: w.groundY - 58,
      w: 34,
      h: 58,
      vx: 0,
      vy: 0,
      grounded: true,
      facing: 1,
      invuln: 0,
      victory: false,
    };
    this.pet = { x: this.player.x - 42, y: this.player.y - 24, bob: 0 };
    this.message = "";
    this.messageTimer = 0;

    // Build enough world that the opening screen is already populated.
    this.ensureWorld();
    this.ui.onZoneChange?.(this.zone.id, this.zoneIndex);
    this.updateHud();
  }

  get zone() {
    return this.zones[this.zoneIndex];
  }

  // Small deterministic PRNG so a run is varied but reproducible in tests.
  random() {
    this.chunkSeed = (this.chunkSeed * 1664525 + 1013904223) % 4294967296;
    return this.chunkSeed / 4294967296;
  }

  pickTemplate() {
    // Avoid repeating a template back to back, which is what makes procedural
    // ground read as copy-pasted rather than designed.
    const pool = this.chunkTemplates.filter((c) => c.id !== this.lastTemplateId);
    const options = pool.length ? pool : this.chunkTemplates;
    const total = options.reduce((sum, c) => sum + c.weight, 0);
    let roll = this.random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) return option;
    }
    return options[options.length - 1];
  }

  spawnChunk() {
    const template = this.pickTemplate();
    const offset = this.nextChunkX;
    const zone = this.zone;
    const index = this.spawnedChunks;
    this.lastTemplateId = template.id;

    const chunk = {
      id: template.id,
      offset,
      end: offset + this.world.chunkWidth,
      platforms: [],
      collectibles: [],
      hazards: [],
      npcs: [],
    };

    for (const slab of template.ground) {
      chunk.platforms.push({
        x: offset + slab.x,
        y: this.world.groundY,
        w: slab.w,
        h: this.world.groundH,
        type: "ground",
      });
    }
    for (const block of template.blocks || []) {
      chunk.platforms.push({
        x: offset + block.x,
        y: block.y,
        w: block.w,
        h: 30,
        type: block.type,
      });
    }
    (template.coins || []).forEach((coin, i) => {
      chunk.collectibles.push({
        x: offset + coin.x,
        y: coin.y,
        // Labels cycle per zone so the wording tracks the current theme.
        label: zone.coinLabels[(index * 3 + i) % zone.coinLabels.length],
        taken: false,
      });
    });
    (template.hazards || []).forEach((hazard, i) => {
      chunk.hazards.push({
        x: offset + hazard.x,
        y: hazard.y,
        w: hazard.w,
        h: hazard.h,
        type: zone.hazardType,
        label: zone.hazardLabels[(index + i) % zone.hazardLabels.length],
        phase: (index * 2 + i) * 0.8,
      });
    });
    if (template.npc) {
      const line = zone.npcs[index % zone.npcs.length];
      chunk.npcs.push({
        x: offset + template.npc.x,
        y: template.npc.y,
        label: line.label,
        text: line.text,
        talked: false,
      });
    }

    this.chunks.push(chunk);
    this.nextChunkX = chunk.end;
    this.spawnedChunks += 1;
  }

  // Keeps roughly two screens of world ahead of the camera and one behind, so
  // the player can double back without running off the edge of what exists.
  ensureWorld() {
    const ahead = this.cameraX + this.width + this.world.chunkWidth * 2;
    while (this.nextChunkX < ahead) this.spawnChunk();

    const behind = this.cameraX - this.world.chunkWidth;
    while (this.chunks.length > 3 && this.chunks[0].end < behind) this.chunks.shift();

    this.platforms = this.chunks.flatMap((c) => c.platforms);
    this.collectibles = this.chunks.flatMap((c) => c.collectibles);
    this.hazards = this.chunks.flatMap((c) => c.hazards);
    this.npcs = this.chunks.flatMap((c) => c.npcs);
    this.worldMinX = this.chunks[0].offset;
  }

  startLevel() {
    this.paused = false;
    this.storyOpen = false;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  pause(toggle = true) {
    if (this.storyOpen) return;
    this.paused = toggle ? !this.paused : true;
    if (!this.paused) {
      this.lastTime = performance.now();
      requestAnimationFrame((time) => this.loop(time));
    }
  }

  restart() {
    this.lives = 3;
    this.petUnlocked = true;
    this.startRun();
    this.paused = true;
    this.storyOpen = true;
    this.ui.showStory(window.RCQ_STORY.intro);
  }

  setKey(name, value) {
    if (name in this.keys) {
      this.keys[name] = value;
    }
  }

  loop(time) {
    if (this.paused || this.storyOpen) return;
    // RAF may carry a frame timestamp earlier than the start/resume click.
    const dt = Math.max(0, Math.min((time - this.lastTime) / 1000, 0.032));
    this.lastTime = time;
    if (dt > 0) this.update(dt);
    this.render();
    requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    const speed = 250;
    const jump = 560;
    const gravity = 1480;

    this.player.vx = 0;
    if (this.keys.left) {
      this.player.vx = -speed;
      this.player.facing = -1;
    }
    if (this.keys.right) {
      this.player.vx = speed;
      this.player.facing = 1;
    }
    if (this.keys.jump && this.player.grounded) {
      this.player.vy = -jump;
      this.player.grounded = false;
    }

    this.player.vy += gravity * dt;
    this.movePlayer(dt);
    this.updatePet(dt);
    this.checkCollectibles();
    this.checkHazards(dt);
    this.checkNpc();

    // No upper clamp: the world is endless, so the camera only trails the run.
    this.cameraX = Math.max(0, this.player.x - 280);
    this.ensureWorld();

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
    }
    this.updateHud();
  }

  movePlayer(dt) {
    const p = this.player;
    p.x += p.vx * dt;
    this.resolveCollisions("x");
    p.y += p.vy * dt;
    p.grounded = false;
    this.resolveCollisions("y");

    if (p.y > 620) {
      this.damage("You fell below the cloud path.");
    }
  }

  resolveCollisions(axis) {
    const p = this.player;
    // Chunk culling keeps this list to a handful of platforms, so a plain
    // sweep stays cheap no matter how long the run gets.
    for (const block of this.platforms) {
      if (!this.intersects(p, block)) continue;

      if (axis === "x") {
        if (p.vx > 0) p.x = block.x - p.w;
        if (p.vx < 0) p.x = block.x + block.w;
        p.vx = 0;
      } else {
        if (p.vy > 0) {
          p.y = block.y - p.h;
          p.vy = 0;
          p.grounded = true;
        } else if (p.vy < 0) {
          p.y = block.y + block.h;
          p.vy = 0;
        }
      }
    }

    // Backing up is allowed, but not past the oldest chunk still in memory.
    p.x = Math.max(this.worldMinX + 8, p.x);
  }

  updatePet(dt) {
    this.pet.bob += dt * 5;
    const targetX = this.player.x - 54 * this.player.facing;
    const targetY = this.player.y - 34 + Math.sin(this.pet.bob) * 8;
    this.pet.x += (targetX - this.pet.x) * 0.08;
    this.pet.y += (targetY - this.pet.y) * 0.08;
  }

  checkCollectibles() {
    for (const item of this.collectibles) {
      if (item.taken) continue;
      const box = { x: item.x, y: item.y, w: 38, h: 38 };
      if (!this.intersects(this.player, box)) continue;

      item.taken = true;
      this.coins += 1;
      this.trust += this.world.coinValue;
      this.flash(`${item.label} decision signal collected`);
      this.checkZone();
      this.checkExtraLife();
      this.checkFinish();
      // Stop on the winning coin so overlapping pickups cannot push the score
      // past the target after the ending has already been shown.
      if (this.finished) return;
    }
  }

  // Zones rotate purely on score, so the theme, coin wording and advisors all
  // advance together as the run progresses.
  checkZone() {
    let next = 0;
    for (let i = 0; i < this.zones.length; i += 1) {
      if (this.trust >= this.zones[i].from) next = i;
    }
    if (next === this.zoneIndex) return;
    this.zoneIndex = next;
    const zone = this.zone;
    this.applyZoneToWorld();
    this.flash(`${zone.name} - ${window.RCQ_STORY.zones[this.zoneIndex].banner}`, 3);
    this.ui.onZoneChange?.(zone.id, this.zoneIndex);
  }

  // Chunks are generated two ahead of the camera, so on a zone change the world
  // already on screen still carries the previous zone's wording. Re-label what
  // has not been used yet, otherwise the risk zone greets the player with cost
  // coins for the next couple of screens.
  applyZoneToWorld() {
    const zone = this.zone;
    let coinIndex = 0;
    let hazardIndex = 0;
    for (const chunk of this.chunks) {
      for (const coin of chunk.collectibles) {
        if (coin.taken) continue;
        coin.label = zone.coinLabels[coinIndex % zone.coinLabels.length];
        coinIndex += 1;
      }
      for (const hazard of chunk.hazards) {
        hazard.type = zone.hazardType;
        hazard.label = zone.hazardLabels[hazardIndex % zone.hazardLabels.length];
        hazardIndex += 1;
      }
      for (const npc of chunk.npcs) {
        if (npc.talked) continue;
        const line = zone.npcs[hazardIndex % zone.npcs.length];
        npc.label = line.label;
        npc.text = line.text;
      }
    }
  }

  // A 1-up every 200 points, capped so a careful player cannot bank an
  // unlosable stack. Without this the run is effectively unfinishable: it takes
  // a few minutes to reach 1000 and hazards are frequent enough that three
  // lives run out long before the ending.
  checkExtraLife() {
    while (this.trust >= this.lifeBonusAt) {
      if (this.lives < CloudQuestGame.MAX_LIVES) {
        this.lives += 1;
        this.flash(`Extra life earned at ${this.lifeBonusAt} points`, 2);
      }
      this.lifeBonusAt += CloudQuestGame.LIFE_BONUS_EVERY;
    }
  }

  checkFinish() {
    if (this.finished || this.trust < this.world.target) return;
    this.finished = true;
    this.player.victory = true;
    this.paused = true;
    this.storyOpen = true;
    this.updateHud();
    this.render();
    this.ui.showStory({
      ...window.RCQ_STORY.ending,
      body: window.RCQ_STORY.ending.body.replace("{score}", this.trust),
      heroSrc: this.getHeroVictorySrc(),
      heroAlt: "Eva celebrating the completed run",
      showMascot: false,
    });
  }

  checkHazards(dt) {
    if (this.player.invuln > 0) {
      this.player.invuln -= dt;
      return;
    }

    for (const hazard of this.hazards) {
      const box = {
        x: hazard.x,
        y: hazard.y + Math.sin(performance.now() / 260 + hazard.phase) * 5,
        w: hazard.w,
        h: hazard.h,
      };
      if (this.intersects(this.player, box)) {
        this.damage("Hazard hit. Eva recovered the decision trail.");
        break;
      }
    }
  }

  checkNpc() {
    const nearNpc = this.npcs.find((npc) => Math.abs(this.player.x - npc.x) < 80 && Math.abs(this.player.y - npc.y) < 95);
    if (nearNpc && this.keys.interact) {
      nearNpc.talked = true;
      // Advisors are flavour only: scoring stays coins-only so the 1000 target
      // is always exactly 100 coins and can never be stepped over.
      this.flash(nearNpc.text, 4.2);
      this.keys.interact = false;
    } else if (nearNpc && this.messageTimer <= 0) {
      this.flash("Press Talk near " + nearNpc.label, 1.1);
    }
  }

  damage(text) {
    if (this.finished || this.gameOver) return;
    this.lives -= 1;
    this.player.invuln = 1.4;
    this.flash(text, 1.6);

    if (this.lives <= 0) {
      this.lives = 0;
      this.gameOver = true;
      this.paused = true;
      this.storyOpen = true;
      this.updateHud();
      this.render();
      this.ui.showStory({
        ...window.RCQ_STORY.gameOver,
        body: window.RCQ_STORY.gameOver.body
          .replace("{score}", this.trust)
          .replace("{coins}", this.coins),
        action: "Run again",
        showMascot: true,
      });
      return;
    }

    // Respawn on solid footing just behind the hit rather than restarting the
    // run, so a mistake costs a life and a little ground but no progress.
    this.respawn();
  }

  respawn() {
    const p = this.player;
    const targetX = Math.max(this.worldMinX + 24, p.x - 140);
    const footing = this.findFooting(targetX);
    p.x = footing.x;
    p.y = footing.y - p.h;
    p.vx = 0;
    p.vy = 0;
    p.grounded = true;
  }

  // Walks backwards from a point to find ground wide enough to stand on, so a
  // respawn can never drop Eva straight back into a pit.
  findFooting(fromX) {
    const ground = this.platforms
      .filter((block) => block.type === "ground")
      .sort((a, b) => a.x - b.x);
    const under = ground.filter((block) => block.x <= fromX && block.x + block.w >= fromX + this.player.w);
    if (under.length) return { x: fromX, y: under[under.length - 1].y };

    const before = ground.filter((block) => block.x + block.w < fromX);
    if (before.length) {
      const slab = before[before.length - 1];
      return { x: slab.x + slab.w - this.player.w - 8, y: slab.y };
    }
    const first = ground[0] || { x: this.worldMinX, y: this.world.groundY, w: 200 };
    return { x: first.x + 16, y: first.y };
  }

  flash(text, seconds = 1.4) {
    this.message = text;
    this.messageTimer = seconds;
  }

  updateHud() {
    const total = this.world.target / this.world.coinValue;
    this.ui.levelName.textContent = this.zone.name;
    this.ui.signalCount.textContent = `${this.coins} / ${total}`;
    this.ui.trustScore.textContent = `${this.trust} / ${this.world.target}`;
    this.ui.lifeCount.textContent = this.lives;
    this.ui.phases?.forEach((phase, index) => {
      // On a finished run every stage reads complete, including the last one.
      phase.classList.toggle("is-active", !this.finished && index === this.zoneIndex);
      phase.classList.toggle("is-complete", this.finished || index < this.zoneIndex);
    });
    this.ui.onProgress?.(this.trust / this.world.target);
  }

  intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ------------------------------------------------------------------ drawing

  render() {
    const ctx = this.ctx;
    const t = this.zone.theme;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx, t);
    ctx.save();
    ctx.translate(-Math.round(this.cameraX), 0);
    this.drawPlatforms(ctx, t);
    this.drawCollectibles(ctx, t);
    this.drawHazards(ctx, t);
    this.drawNpc(ctx, t);
    this.drawPlayer(ctx);
    this.drawPet(ctx, t);
    ctx.restore();
    this.drawMessage(ctx);
  }

  drawBackground(ctx, t) {
    ctx.fillStyle = t.sky;
    ctx.fillRect(0, 0, this.width, this.height);
    const skyGradient = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGradient.addColorStop(0, "rgba(255,255,255,0.32)");
    skyGradient.addColorStop(0.5, "rgba(255,255,255,0.04)");
    skyGradient.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, this.width, this.height);
    // Parallax cloud bank. These were previously two offset rectangles, which
    // read as hard T shapes rather than scenery.
    ctx.fillStyle = t.far;
    for (let i = 0; i < 8; i += 1) {
      const x = (i * 210 - (this.cameraX * 0.25) % 210) - 80;
      this.drawCloud(ctx, x, 78 + (i % 2) * 34, 96, 34);
    }
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let x = -80; x < this.width + 120; x += 96) {
      this.rect(ctx, x - (this.cameraX * 0.12) % 96, 0, 2, this.height);
    }
    ctx.fillStyle = "rgba(8,16,32,0.09)";
    for (let y = 18; y < this.height; y += 42) {
      this.rect(ctx, 0, y, this.width, 1);
    }
  }

  drawPlatforms(ctx, t) {
    for (const p of this.platforms) {
      if (p.x + p.w < this.cameraX - 40 || p.x > this.cameraX + this.width + 40) continue;
      if (p.type === "ground") {
        ctx.fillStyle = t.ground;
        this.rect(ctx, p.x, p.y, p.w, p.h);
        ctx.fillStyle = t.grass;
        this.rect(ctx, p.x, p.y, p.w, 16);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        this.rect(ctx, p.x, p.y + 3, p.w, 3);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        for (let x = p.x; x < p.x + p.w; x += 36) {
          this.rect(ctx, x, p.y + 28, 18, 10);
          this.rect(ctx, x + 21, p.y + 58, 10, 7);
        }
      } else {
        ctx.fillStyle = p.type === "cloud" ? t.water : t.block;
        this.rect(ctx, p.x, p.y, p.w, p.h);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        this.rect(ctx, p.x + 8, p.y + 6, p.w - 16, 5);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        for (let x = p.x + 10; x < p.x + p.w - 8; x += 34) {
          this.rect(ctx, x, p.y + 20, 18, 4);
        }
      }
      ctx.strokeStyle = "#081020";
      ctx.lineWidth = 4;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
  }

  // Decorative props are placed on a fixed grid across the endless world and
  // drawn only for the window on screen.
  // Three overlapping ellipses, so a cloud reads as a soft mass instead of
  // stacked boxes.
  drawCloud(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.ellipse(x + w * 0.30, y + h * 0.60, w * 0.30, h * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.62, y + h * 0.48, w * 0.26, h * 0.70, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.50, y + h * 0.78, w * 0.48, h * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCollectibles(ctx) {
    const sprite = this.itemSprites.coin;
    const hasArt = sprite?.complete && sprite.naturalWidth > 0;

    for (const item of this.collectibles) {
      if (item.taken) continue;
      if (item.x + 38 < this.cameraX - 40 || item.x > this.cameraX + this.width + 40) continue;

      if (hasArt) {
        ctx.drawImage(sprite, item.x, item.y, 38, 38);
      } else {
        // Vector fallback so a missing or still-loading sprite never leaves an
        // invisible pickup the player cannot see to collect.
        ctx.fillStyle = "#ffd84d";
        this.rect(ctx, item.x, item.y, 38, 38);
        ctx.strokeStyle = "#081020";
        ctx.lineWidth = 4;
        ctx.strokeRect(item.x, item.y, 38, 38);
      }

      // Centred rather than left-aligned, so the label sits on the round coin
      // face instead of running over its edge.
      // 9px keeps five wide characters ("OWNER") inside the coin face; 10px
      // spilled over the rim.
      const label = item.label.slice(0, 5);
      ctx.fillStyle = "#081020";
      ctx.font = "800 9px Arial, sans-serif";
      ctx.fillText(label, item.x + 19 - ctx.measureText(label).width / 2, item.y + 23);
    }
  }

  drawHazards(ctx, t) {
    for (const hazard of this.hazards) {
      if (hazard.x + hazard.w < this.cameraX - 40 || hazard.x > this.cameraX + this.width + 40) continue;
      const y = hazard.y + Math.sin(performance.now() / 260 + hazard.phase) * 5;
      ctx.fillStyle = hazard.type === "waste" ? "#9a5f00" : hazard.type === "risk" ? "#7f1d3a" : "#e33b58";
      this.rect(ctx, hazard.x, y, hazard.w, hazard.h);
      ctx.fillStyle = hazard.type === "risk" ? "#ffd84d" : t.accent;
      this.rect(ctx, hazard.x + 8, y + 7, hazard.w - 16, 8);
      if (hazard.label) {
        ctx.fillStyle = "#fff7de";
        ctx.font = "800 9px Arial, sans-serif";
        ctx.fillText(hazard.label, hazard.x + 5, y + 22);
      }
    }
  }

  drawNpc(ctx) {
    for (const npc of this.npcs) {
      if (npc.x + 36 < this.cameraX - 40 || npc.x > this.cameraX + this.width + 40) continue;
      ctx.fillStyle = "#fff7de";
      this.rect(ctx, npc.x, npc.y, 36, 62);
      ctx.fillStyle = "#081020";
      this.rect(ctx, npc.x + 8, npc.y + 10, 20, 12);
      ctx.font = "700 13px Arial, sans-serif";
      ctx.fillText(npc.label, npc.x - 4, npc.y - 10);
    }
  }

  getHeroSprite() {
    const themeSprites = this.heroSprites[this.zone.id] || {};
    const pose = this.player.victory ? "victory"
      : !this.player.grounded ? "jump"
      : Math.abs(this.player.vx) > 0 ? "run" : "idle";
    return [themeSprites[pose], themeSprites.idle, themeSprites.run]
      .find((sprite) => sprite?.complete && sprite.naturalWidth > 0) || null;
  }

  drawPlayer(ctx) {
    const p = this.player;
    if (p.invuln > 0 && Math.floor(performance.now() / 100) % 2 === 0) return;

    const sprite = this.getHeroSprite();
    if (!sprite || !sprite.complete || !sprite.naturalWidth) {
      return;
    }

    const drawH = 118;
    const drawW = drawH * (sprite.naturalWidth / sprite.naturalHeight);
    const drawX = p.x + p.w / 2 - drawW / 2;
    const drawY = p.y + p.h - drawH + 7;

    ctx.save();
    ctx.fillStyle = "rgba(255, 216, 77, 0.28)";
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, p.y + p.h + 4, 34, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 9;
    if (p.facing < 0) {
      ctx.translate(drawX + drawW, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, drawW, drawH);
    } else {
      ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
  }

  drawPet(ctx, t) {
    ctx.save();
    const x = this.player.x + this.player.w / 2 + Math.sin(this.pet.bob) * 7;
    const y = this.player.y - 77 + Math.cos(this.pet.bob) * 5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.74)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 28, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = t.accent;
    this.rect(ctx, x - 17, y - 7, 34, 14);
    ctx.fillStyle = "#081020";
    ctx.font = "800 8px Arial, sans-serif";
    ctx.fillText("EVA", x - 10, y + 4);
    ctx.restore();
  }

  drawMessage(ctx) {
    if (this.messageTimer <= 0 || !this.message) return;
    ctx.fillStyle = "rgba(8,16,32,0.88)";
    this.rect(ctx, 24, 24, this.width - 48, 72);
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, this.width - 48, 72);
    ctx.fillStyle = "#fff7de";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.textBaseline = "alphabetic";
    this.wrapText(ctx, this.message, 44, 54, this.width - 92, 22);
  }

  rect(ctx, x, y, w, h) {
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word + " ";
        y += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y);
  }
}

CloudQuestGame.MAX_LIVES = 5;
CloudQuestGame.LIFE_BONUS_EVERY = 200;

window.CloudQuestGame = CloudQuestGame;
