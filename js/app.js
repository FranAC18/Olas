(function () {
    'use strict';

    // ==========================================
    // CONFIGURATION & CONSTANTS
    // ==========================================

    var CONFIG = {
        YOUTUBE_URL: 'https://www.youtube.com/watch?v=vlneT-a-KkQ&list=RDvlneT-a-KkQ&start_radio=1',
        AUDIO_SRC: 'assets/music/El_Tesoro.mp3',
        BPM: 96, // Tempo of "El Tesoro" by El Mató a un Policía Motorizado
        BG_COLOR: '#FDF8F3'
    };

    var GOLDEN_ANGLE = 2.3999632; // 137.5 degrees in radians

    // ==========================================
    // DOM REFERENCES
    // ==========================================

    var catIntroScreen = document.getElementById('cat-intro-screen');
    var catContinueBtn = document.getElementById('cat-continue-btn');
    var welcomeScreen = document.getElementById('welcome-screen');
    var experienceScreen = document.getElementById('experience-screen');
    var openBtn = document.getElementById('open-btn');
    var canvas = document.getElementById('flower-canvas');
    var ctx = canvas.getContext('2d');

    var appleLyricsContainer = document.getElementById('apple-lyrics-container');
    var lyricsScroll = document.getElementById('lyrics-scroll');
    var lyricsToggle = document.getElementById('lyrics-toggle');
    var interactiveHint = document.getElementById('interactive-hint');

    var audioBar = document.getElementById('audio-bar');
    var audioToggle = document.getElementById('audio-toggle');
    var audioMute = document.getElementById('audio-mute');
    var progressBarBg = document.getElementById('progress-bar-bg');
    var progressBarFill = document.getElementById('progress-bar-fill');
    var timeCurrent = document.getElementById('time-current');
    var timeTotal = document.getElementById('time-total');
    var youtubeLink = document.getElementById('youtube-link');
    var petalLayer = document.getElementById('petal-layer');

    // ==========================================
    // APPLICATION STATE
    // ==========================================

    var audio = null;
    var isPlaying = false;
    var isMuted = false;
    var animationStarted = false;
    var petalTimer = null;
    var animFrameId = null;
    var lastTimestamp = 0;
    var hasInteracted = false;
    var hintTimeout = null;

    // Viewport & Scale
    var width = window.innerWidth;
    var height = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    // ==========================================
    // WEB AUDIO API & REAL-TIME BEAT DETECTOR
    // ==========================================

    var audioCtx = null;
    var analyser = null;
    var dataArray = null;
    var audioSourceNode = null;
    var beatIntensity = 0; // 0.0 to 1.0 pulse intensity
    var smoothedBass = 0;

    function initWebAudio() {
        try {
            var AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!audioCtx) {
                audioCtx = new AudioContextClass();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            if (!audioSourceNode && audio) {
                audioSourceNode = audioCtx.createMediaElementSource(audio);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.8;
                dataArray = new Uint8Array(analyser.frequencyBinCount);

                audioSourceNode.connect(analyser);
                analyser.connect(audioCtx.destination);
            }
        } catch (err) {
            console.warn('Web Audio API en modo seguro/fallback por BPM:', err);
        }
    }

    function updateBeatAnalysis() {
        var rawBass = 0;
        if (analyser && dataArray && isPlaying) {
            analyser.getByteFrequencyData(dataArray);
            // Low frequencies / kick / bass range: bins 0 to 7 (~20Hz - 180Hz)
            var sum = 0;
            var binCount = 8;
            for (var i = 0; i < binCount; i++) {
                sum += dataArray[i];
            }
            rawBass = (sum / binCount) / 255;
        }

        if (rawBass > 0.04) {
            // Direct audio analysis from Web Audio API
            smoothedBass += (rawBass - smoothedBass) * 0.35;
            beatIntensity = Math.min(1, smoothedBass * 1.6);
        } else if (isPlaying && audio && isFinite(audio.currentTime)) {
            // Fallback: Rhythmic oscillation calculated by BPM
            var beatDuration = 60 / CONFIG.BPM; // ~0.625s per beat
            var beatPhase = (audio.currentTime % beatDuration) / beatDuration;
            // Kick bounce curve: steep peak at start of beat followed by exponential decay
            var bounce = Math.pow(Math.max(0, 1 - beatPhase * 1.7), 2.6);
            beatIntensity = bounce * 0.85;
        } else {
            beatIntensity *= 0.88;
        }
    }

    // ==========================================
    // PROCEDURAL DANCING FLOWER CLASS
    // ==========================================

    function Flower(options) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.baseX = options.baseX;
        this.baseY = options.baseY;
        this.naturalHeadX = options.headX;
        this.naturalHeadY = options.headY;

        // Current animated coordinates
        this.x = options.headX;
        this.y = options.headY;

        // Spring physics
        this.vx = 0;
        this.vy = 0;
        this.stiffness = options.stiffness || (0.055 + Math.random() * 0.015);
        this.damping = options.damping || (0.87 + Math.random() * 0.03);

        // Visual attributes
        this.radius = options.radius || 60;
        this.petalCount = options.petalCount || (Math.floor(Math.random() * 4) + 20); // 20-24 petals
        this.stemWidth = options.stemWidth || (this.radius > 55 ? 6 : 4.5);
        this.angleOffset = Math.random() * Math.PI * 2;
        this.naturalCurve = options.naturalCurve || ((Math.random() - 0.5) * 40);

        // Choreography / Dancing wave properties
        this.dancePhase = options.dancePhase || 0; // Staggered dance wave
        this.swayAmp = 18 + Math.random() * 12;

        // Growth & Bloom entrance animation
        this.growth = 0;
        this.targetGrowth = 1;
        this.bloomDelay = options.bloomDelay || 0;
        this.elapsed = 0;
        this.growthSpeed = 0.028 + Math.random() * 0.015;

        // Touch Priority (Absolute: pause dance while dragging)
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Leaves along the stem
        this.leaves = [
            {
                t: 0.35 + Math.random() * 0.08,
                side: Math.random() > 0.5 ? 1 : -1,
                length: this.radius * (0.65 + Math.random() * 0.25),
                width: this.radius * (0.28 + Math.random() * 0.1),
                angleOffset: (Math.random() - 0.5) * 0.25
            },
            {
                t: 0.62 + Math.random() * 0.08,
                side: Math.random() > 0.5 ? -1 : 1,
                length: this.radius * (0.55 + Math.random() * 0.2),
                width: this.radius * (0.24 + Math.random() * 0.08),
                angleOffset: (Math.random() - 0.5) * 0.25
            }
        ];

        // Seed spiral texture (Girasol heart)
        this.seeds = [];
        var numSeeds = Math.floor(this.radius * 1.3);
        var maxSeedR = this.radius * 0.36;
        for (var i = 0; i < numSeeds; i++) {
            var theta = i * GOLDEN_ANGLE;
            var r = Math.sqrt(i / numSeeds) * maxSeedR;
            this.seeds.push({
                x: Math.cos(theta) * r,
                y: Math.sin(theta) * r,
                size: 1.2 + (r / maxSeedR) * 1.3,
                brightness: 0.7 + Math.random() * 0.6
            });
        }
    }

    Flower.prototype.update = function (delta, time, windForce) {
        this.elapsed += delta;

        // Bloom growth
        if (this.elapsed > this.bloomDelay && this.growth < this.targetGrowth) {
            this.growth = Math.min(this.targetGrowth, this.growth + this.growthSpeed);
        }

        // DANCING BEHAVIOR OR TACTILE DRAG
        if (!this.isDragging) {
            // Choreographed lateral dance modulated by music beat
            var tempoFreq = 0.005; // Matches song tempo rhythmically
            var danceAngle = Math.sin(time * tempoFreq + this.dancePhase);

            // Dance sway amplitude expands with bass beats
            var dynamicAmp = this.swayAmp * (0.75 + beatIntensity * 0.75);
            var danceOffset = danceAngle * dynamicAmp;

            // Target head position with dance sway & wind
            var targetX = this.naturalHeadX + danceOffset + windForce;
            var targetY = this.naturalHeadY + Math.abs(danceAngle) * 5; // Organic slight dipping

            var ax = (targetX - this.x) * this.stiffness;
            var ay = (targetY - this.y) * this.stiffness;

            this.vx = (this.vx + ax) * this.damping;
            this.vy = (this.vy + ay) * this.damping;

            this.x += this.vx;
            this.y += this.vy;
        }
    };

    Flower.prototype.draw = function (context, time) {
        if (this.growth <= 0.01) return;

        var g = this.growth;
        var easeGrowth = Math.min(1, Math.sin(g * Math.PI * 0.5));
        var currentRadius = this.radius * easeGrowth;

        // RHYTHMIC BOUNCE / VERTICAL SCALE PULSE (1.0 to 1.06 on beat hits)
        if (isPlaying) {
            currentRadius *= (1.0 + beatIntensity * 0.06);
        }

        var bx = this.baseX;
        var by = this.baseY;
        var hx = this.x;
        var hy = this.y;

        // ==========================================
        // 1. STEM (Cubic Bezier curve with natural bend)
        // ==========================================
        var dx = hx - bx;
        var dy = hy - by;
        var curveOffset = this.naturalCurve * (1 - easeGrowth * 0.25);
        var cp1x = bx + dx * 0.18 + curveOffset;
        var cp1y = by + dy * 0.45;
        var cp2x = hx - dx * 0.12 - curveOffset * 0.35;
        var cp2y = hy - dy * 0.22;

        var stemGrad = context.createLinearGradient(bx, by, hx, hy);
        stemGrad.addColorStop(0, '#344920');
        stemGrad.addColorStop(0.5, '#4a672b');
        stemGrad.addColorStop(1, '#6b923a');

        context.save();
        context.beginPath();
        context.moveTo(bx, by);
        context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, hx, hy);
        context.strokeStyle = stemGrad;
        context.lineWidth = Math.max(3, this.stemWidth * easeGrowth);
        context.lineCap = 'round';
        context.stroke();

        // ==========================================
        // 2. LEAVES ALONG STEM
        // ==========================================
        for (var l = 0; l < this.leaves.length; l++) {
            var leaf = this.leaves[l];
            var t = leaf.t;

            var omt = 1 - t;
            var lx = omt * omt * omt * bx +
                3 * omt * omt * t * cp1x +
                3 * omt * t * t * cp2x +
                t * t * t * hx;
            var ly = omt * omt * omt * by +
                3 * omt * omt * t * cp1y +
                3 * omt * t * t * cp2y +
                t * t * t * hy;

            var dtx = 3 * omt * omt * (cp1x - bx) +
                6 * omt * t * (cp2x - cp1x) +
                3 * t * t * (hx - cp2x);
            var dty = 3 * omt * omt * (cp1y - by) +
                6 * omt * t * (cp2y - cp1y) +
                3 * t * t * (hy - cp2y);
            var tangentAngle = Math.atan2(dty, dtx);

            var leafAngle = tangentAngle + (leaf.side * (Math.PI * 0.36) + leaf.angleOffset) +
                Math.sin(time * 0.002 + this.dancePhase + l) * 0.08;
            var leafLen = leaf.length * easeGrowth;
            var leafWid = leaf.width * easeGrowth;

            if (leafLen > 4) {
                context.save();
                context.translate(lx, ly);
                context.rotate(leafAngle);

                var leafGrad = context.createLinearGradient(0, 0, leafLen, 0);
                leafGrad.addColorStop(0, '#3e5724');
                leafGrad.addColorStop(0.5, '#5f8232');
                leafGrad.addColorStop(1, '#81a745');

                context.beginPath();
                context.moveTo(0, 0);
                context.bezierCurveTo(leafLen * 0.35, -leafWid * 0.8, leafLen * 0.75, -leafWid * 0.6, leafLen, 0);
                context.bezierCurveTo(leafLen * 0.75, leafWid * 0.6, leafLen * 0.35, leafWid * 0.8, 0, 0);
                context.fillStyle = leafGrad;
                context.fill();

                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(leafLen * 0.88, 0);
                context.strokeStyle = 'rgba(255, 255, 255, 0.22)';
                context.lineWidth = 1;
                context.stroke();

                context.restore();
            }
        }
        context.restore();

        // ==========================================
        // 3. FLOWER HEAD & PETALS
        // ==========================================
        context.save();
        context.translate(hx, hy);

        // Head tilt follows stem tangent with dynamic dance tilt
        var headAngle = Math.atan2(hy - cp2y, hx - cp2x) - Math.PI / 2;
        context.rotate(headAngle * 0.4);

        // Golden glowing aura
        var glow = context.createRadialGradient(0, 0, currentRadius * 0.4, 0, 0, currentRadius * 1.35);
        glow.addColorStop(0, 'rgba(255, 215, 64, ' + (0.2 + beatIntensity * 0.1) + ')');
        glow.addColorStop(0.6, 'rgba(245, 158, 11, 0.08)');
        glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(0, 0, currentRadius * 1.35, 0, Math.PI * 2);
        context.fill();

        // Sepals (green bracts)
        var sepalCount = 10;
        var sepalR = currentRadius * 0.55;
        context.fillStyle = '#425b24';
        for (var s = 0; s < sepalCount; s++) {
            var sa = (s / sepalCount) * Math.PI * 2 + this.angleOffset;
            context.save();
            context.rotate(sa);
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(-sepalR * 0.22, -sepalR * 0.4);
            context.lineTo(0, -sepalR);
            context.lineTo(sepalR * 0.22, -sepalR * 0.4);
            context.closePath();
            context.fill();
            context.restore();
        }

        // LAYER 1: OUTER GOLDEN PETALS
        var pCount = this.petalCount;
        var step = (Math.PI * 2) / pCount;

        for (var i = 0; i < pCount; i++) {
            var pAngle = i * step + this.angleOffset;
            var petalLen = currentRadius * (1.05 + 0.12 * Math.sin(i * 3 + this.angleOffset));
            var petalWid = currentRadius * 0.26;

            context.save();
            context.rotate(pAngle);

            var petalGrad = context.createLinearGradient(0, 0, 0, -petalLen);
            petalGrad.addColorStop(0, '#c77800');
            petalGrad.addColorStop(0.25, '#f59e0b');
            petalGrad.addColorStop(0.65, '#facc15');
            petalGrad.addColorStop(1, '#fef08a');

            context.beginPath();
            context.moveTo(0, 0);
            context.bezierCurveTo(-petalWid * 0.75, -petalLen * 0.35, -petalWid * 0.7, -petalLen * 0.85, 0, -petalLen);
            context.bezierCurveTo(petalWid * 0.7, -petalLen * 0.85, petalWid * 0.75, -petalLen * 0.35, 0, 0);
            context.fillStyle = petalGrad;
            context.shadowColor = 'rgba(180, 83, 9, 0.15)';
            context.shadowBlur = 4;
            context.fill();

            // Delicate center petal fold
            context.beginPath();
            context.moveTo(0, -petalLen * 0.1);
            context.lineTo(0, -petalLen * 0.78);
            context.strokeStyle = 'rgba(217, 119, 6, 0.32)';
            context.lineWidth = 0.8;
            context.shadowColor = 'transparent';
            context.stroke();

            context.restore();
        }

        // LAYER 2: INNER RADIANT PETALS (Offset by half-step)
        for (var j = 0; j < pCount; j++) {
            var pAngle2 = j * step + this.angleOffset + step * 0.5;
            var petalLen2 = currentRadius * (0.9 + 0.1 * Math.cos(j * 2));
            var petalWid2 = currentRadius * 0.22;

            context.save();
            context.rotate(pAngle2);

            var petalGrad2 = context.createLinearGradient(0, 0, 0, -petalLen2);
            petalGrad2.addColorStop(0, '#d97706');
            petalGrad2.addColorStop(0.4, '#fbbf24');
            petalGrad2.addColorStop(0.85, '#fde047');
            petalGrad2.addColorStop(1, '#fffde7');

            context.beginPath();
            context.moveTo(0, 0);
            context.bezierCurveTo(-petalWid2 * 0.8, -petalLen2 * 0.38, -petalWid2 * 0.65, -petalLen2 * 0.88, 0, -petalLen2);
            context.bezierCurveTo(petalWid2 * 0.65, -petalLen2 * 0.88, petalWid2 * 0.8, -petalLen2 * 0.38, 0, 0);
            context.fillStyle = petalGrad2;
            context.fill();

            context.restore();
        }

        // 4. CENTER DISC (Girasol Heart)
        var centerR = currentRadius * 0.38;

        // Golden pollen halo ring
        var rimGrad = context.createRadialGradient(0, 0, centerR * 0.78, 0, 0, centerR * 1.05);
        rimGrad.addColorStop(0, '#78350f');
        rimGrad.addColorStop(0.7, '#b45309');
        rimGrad.addColorStop(1, '#f59e0b');
        context.beginPath();
        context.arc(0, 0, centerR * 1.04, 0, Math.PI * 2);
        context.fillStyle = rimGrad;
        context.fill();

        // Deep roasted chocolate center
        var centerGrad = context.createRadialGradient(-centerR * 0.15, -centerR * 0.15, 0, 0, 0, centerR);
        centerGrad.addColorStop(0, '#261205');
        centerGrad.addColorStop(0.45, '#3b1c09');
        centerGrad.addColorStop(0.82, '#572b0c');
        centerGrad.addColorStop(1, '#78380d');
        context.beginPath();
        context.arc(0, 0, centerR, 0, Math.PI * 2);
        context.fillStyle = centerGrad;
        context.fill();

        // Fibonacci spiral seed texture
        for (var sIdx = 0; sIdx < this.seeds.length; sIdx++) {
            var seed = this.seeds[sIdx];
            var sx = seed.x * easeGrowth;
            var sy = seed.y * easeGrowth;
            var sz = seed.size * easeGrowth;
            var dist = Math.hypot(sx, sy);

            if (dist < centerR * 0.94) {
                var seedColor = dist > centerR * 0.65 ?
                    'rgba(245, 158, 11, ' + (0.55 * seed.brightness) + ')' :
                    'rgba(180, 83, 9, ' + (0.45 * seed.brightness) + ')';
                context.beginPath();
                context.arc(sx, sy, sz * 0.7, 0, Math.PI * 2);
                context.fillStyle = seedColor;
                context.fill();
            }
        }

        // Soft highlight gleam
        var gleam = context.createRadialGradient(-centerR * 0.35, -centerR * 0.35, 1, -centerR * 0.35, -centerR * 0.35, centerR * 0.6);
        gleam.addColorStop(0, 'rgba(255, 235, 160, 0.25)');
        gleam.addColorStop(1, 'rgba(255, 235, 160, 0)');
        context.beginPath();
        context.arc(0, 0, centerR * 0.9, 0, Math.PI * 2);
        context.fillStyle = gleam;
        context.fill();

        context.restore();
    };

    Flower.prototype.containsPoint = function (px, py) {
        var isMobile = width < 640;
        var headDist = Math.hypot(px - this.x, py - this.y);
        if (headDist <= this.radius * (isMobile ? 1.6 : 1.4)) return true;

        var midX = (this.baseX + this.x) * 0.5;
        var midY = (this.baseY + this.y) * 0.5;
        var stemDist = Math.hypot(px - (midX + this.x) * 0.5, py - (midY + this.y) * 0.5);
        if (stemDist <= this.radius * 0.75) return true;

        return false;
    };

    // ==========================================
    // PARTICLES ENGINE (Pollen & Petals)
    // ==========================================

    var particles = [];

    function spawnPetalBurst(x, y, count) {
        count = count || 12;
        for (var i = 0; i < count; i++) {
            var angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            var speed = 2.5 + Math.random() * 4.5;
            particles.push({
                type: 'petal',
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5,
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 0.15,
                scale: 0.6 + Math.random() * 0.6,
                life: 1,
                decay: 0.008 + Math.random() * 0.008,
                color: Math.random() > 0.3 ? '#facc15' : '#f59e0b'
            });
        }
    }

    function spawnPollen(x, y) {
        particles.push({
            type: 'pollen',
            x: x + (Math.random() - 0.5) * 16,
            y: y + (Math.random() - 0.5) * 16,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -0.8 - Math.random() * 1.5,
            scale: 2 + Math.random() * 2.5,
            life: 1,
            decay: 0.02 + Math.random() * 0.02,
            color: '#fef08a'
        });
    }

    function initAmbientParticles() {
        for (var i = 0; i < 22; i++) {
            particles.push({
                type: 'ambient',
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.6,
                vy: -0.3 - Math.random() * 0.6,
                rot: Math.random() * Math.PI * 2,
                vrot: (Math.random() - 0.5) * 0.02,
                scale: 0.5 + Math.random() * 0.7,
                life: 1,
                decay: 0,
                color: Math.random() > 0.4 ? '#facc15' : '#fbbf24'
            });
        }
    }

    function updateParticles(context, delta) {
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.type === 'ambient') {
                p.rot += p.vrot;
                p.vx += (Math.random() - 0.5) * 0.03;
                if (p.y < -30) {
                    p.y = height + 20;
                    p.x = Math.random() * width;
                }
                if (p.x < -30) p.x = width + 20;
                if (p.x > width + 30) p.x = -20;

                context.save();
                context.translate(p.x, p.y);
                context.rotate(p.rot);
                context.fillStyle = 'rgba(250, 204, 21, 0.45)';
                context.beginPath();
                context.ellipse(0, 0, 5 * p.scale, 10 * p.scale, 0, 0, Math.PI * 2);
                context.fill();
                context.restore();
            } else {
                p.life -= p.decay;
                if (p.life <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                context.save();
                context.translate(p.x, p.y);
                context.globalAlpha = Math.max(0, p.life);

                if (p.type === 'petal') {
                    p.rot += p.vrot;
                    p.vy += 0.05;
                    p.vx *= 0.98;
                    context.rotate(p.rot);
                    context.fillStyle = p.color;
                    context.beginPath();
                    context.ellipse(0, 0, 4.5 * p.scale, 9 * p.scale, 0, 0, Math.PI * 2);
                    context.fill();
                } else if (p.type === 'pollen') {
                    context.fillStyle = p.color;
                    context.shadowColor = '#facc15';
                    context.shadowBlur = 6;
                    context.beginPath();
                    context.arc(0, 0, p.scale * p.life, 0, Math.PI * 2);
                    context.fill();
                }

                context.restore();
            }
        }
    }

    // ==========================================
    // GARDEN MANAGER (4 to 6 Sunflowers)
    // ==========================================

    var flowers = [];
    var activeFlower = null;
    var windForce = 0;

    function buildFlowerGarden() {
        flowers = [];
        var isMobile = width < 640;
        var count = isMobile ? 5 : 6; // 4 to 6 dancing sunflowers
        var baseMargin = width * 0.08;
        var usableWidth = width - baseMargin * 2;
        var spacing = count > 1 ? usableWidth / (count - 1) : 0;

        for (var i = 0; i < count; i++) {
            var norm = count > 1 ? i / (count - 1) : 0.5;
            var baseX = baseMargin + i * spacing + (Math.random() - 0.5) * (isMobile ? 16 : 30);
            var baseY = height + 15;

            var heightVariation = Math.sin(norm * Math.PI) * 0.08;
            var baseHeightFrac = isMobile ? 0.68 : 0.62;
            var headY = height * (baseHeightFrac - heightVariation) + (Math.random() - 0.5) * (height * 0.06);
            var radius = isMobile ?
                (38 + Math.random() * 12) :
                (50 + Math.random() * 16);

            // Natural fan tilt outward
            var fanOffset = (norm - 0.5) * (isMobile ? 24 : 48);
            var headX = baseX + fanOffset + (Math.random() - 0.5) * 18;

            // Staggered blooming and choreographed dance wave phases
            var bloomDelay = 200 + i * 240;
            var dancePhase = i * 1.15; // Alternating phases for wave choreography

            flowers.push(new Flower({
                baseX: baseX,
                baseY: baseY,
                headX: headX,
                headY: headY,
                radius: radius,
                bloomDelay: bloomDelay,
                dancePhase: dancePhase,
                naturalCurve: (norm - 0.5) * 35
            }));
        }
    }

    function plantNewFlower(x, y) {
        var isMobile = width < 640;
        var radius = isMobile ?
            (46 + Math.random() * 14) :
            (58 + Math.random() * 18);

        var newFlower = new Flower({
            baseX: x + (Math.random() - 0.5) * 50,
            baseY: height + 15,
            headX: x,
            headY: y,
            radius: radius,
            bloomDelay: 0,
            dancePhase: flowers.length * 1.15,
            naturalCurve: (Math.random() - 0.5) * 30
        });

        spawnPetalBurst(x, y, 16);
        for (var k = 0; k < 8; k++) spawnPollen(x, y);

        flowers.push(newFlower);

        // Max flowers limit for peak 60fps performance
        var maxFlowers = isMobile ? 10 : 14;
        if (flowers.length > maxFlowers) {
            flowers.shift();
        }
    }

    // ==========================================
    // APPLE MUSIC STYLE LYRICS ENGINE
    // ==========================================

    var lyricsTimeline = [];
    var lyricsLineElements = [];
    var currentActiveIndex = -1;

    function buildLyrics() {
        if (window.LYRICS_TIMELINE && window.LYRICS_TIMELINE.length) {
            lyricsTimeline = window.LYRICS_TIMELINE;
        } else {
            lyricsTimeline = [
                { start: 17.0, end: 19.0, text: 'Ah' },
                { start: 20.0, end: 24.0, text: 'paso todo el día pensando en vos' },
                { start: 24.5, end: 28.5, text: 'Ah, ¿qué hay de malo en todo esto?' },
                { start: 29.0, end: 33.0, text: 'Ah, paso todo el día pensando en vos' },
                { start: 33.5, end: 37.5, text: 'Ah, vos pensás que pierdo el tiempo' },
                { start: 39.0, end: 43.0, text: 'Perdón si estoy de nuevo acá' },
                { start: 43.5, end: 48.0, text: 'Pensé que habías preguntado por mí' },
                { start: 48.5, end: 52.0, text: 'Me gusta estar de nuevo acá' },
                { start: 52.5, end: 57.0, text: 'Aunque no hayas preguntado por mí' },
                { start: 57.5, end: 61.0, text: 'Voy a quedarme un poco acá' },
                { start: 61.5, end: 67.0, text: 'Cuidarte siempre a vos en la derrota' },
                { start: 67.5, end: 71.0, text: 'Hasta el final, el final' },
                { start: 105.0, end: 109.0, text: 'Ah, todo lo que hago es para vos' },
                { start: 109.5, end: 114.0, text: 'Ah, el tesoro se está hundiendo' },
                { start: 114.5, end: 118.5, text: 'Ah, todo lo que hago es para vos' },
                { start: 119.0, end: 123.0, text: 'Ah, vos pensás que pierdo el tiempo' },
                { start: 125.0, end: 129.0, text: 'Perdón si estoy de nuevo acá' },
                { start: 129.5, end: 134.0, text: 'Pensé que habías preguntado por mí' },
                { start: 134.5, end: 138.0, text: 'Me gusta estar de nuevo acá' },
                { start: 138.5, end: 143.0, text: 'Aunque no hayas preguntado por mí' },
                { start: 143.5, end: 147.0, text: 'Voy a quedarme un poco acá' },
                { start: 147.5, end: 153.0, text: 'Cuidarte siempre a vos en la derrota' },
                { start: 153.5, end: 157.0, text: 'Hasta el final, del final' },
                { start: 184.0, end: 189.0, text: 'Es la depresión sin épica' },
                { start: 189.5, end: 194.0, text: 'La depresión sin épica' }
            ];
        }

        lyricsScroll.innerHTML = '';
        lyricsLineElements = [];

        for (var i = 0; i < lyricsTimeline.length; i++) {
            var item = lyricsTimeline[i];
            var lineEl = document.createElement('div');
            lineEl.className = 'lyric-line';
            lineEl.dataset.index = i;
            lineEl.dataset.start = item.start;
            lineEl.dataset.end = item.end;

            // Interpolate word-level timestamps if words array is not defined
            var words = item.words;
            if (!words || !words.length) {
                var textParts = (item.text || '').trim().split(/\s+/);
                var dur = Math.max(0.6, item.end - item.start);
                var step = dur / textParts.length;
                words = textParts.map(function (w, idx) {
                    return {
                        text: w,
                        start: item.start + idx * step,
                        end: item.start + (idx + 1) * step
                    };
                });
            }

            var wordElements = [];
            for (var w = 0; w < words.length; w++) {
                var wordObj = words[w];
                var wordSpan = document.createElement('span');
                wordSpan.className = 'lyric-word';
                wordSpan.textContent = wordObj.text + (w < words.length - 1 ? ' ' : '');
                wordSpan.dataset.start = wordObj.start;
                wordSpan.dataset.end = wordObj.end;
                lineEl.appendChild(wordSpan);
                wordElements.push(wordSpan);
            }

            lineEl._words = wordElements;
            lineEl._wordData = words;
            lyricsScroll.appendChild(lineEl);
            lyricsLineElements.push(lineEl);
        }
    }

    function updateLyricsDisplay() {
        if (!audio || !isFinite(audio.currentTime) || lyricsTimeline.length === 0) return;

        var curTime = audio.currentTime;
        var activeIndex = -1;

        for (var i = 0; i < lyricsTimeline.length; i++) {
            var item = lyricsTimeline[i];
            if (curTime >= item.start && curTime <= (item.end + 0.5)) {
                activeIndex = i;
                break;
            } else if (curTime >= item.start) {
                activeIndex = i;
            }
        }

        if (activeIndex !== currentActiveIndex) {
            currentActiveIndex = activeIndex;

            for (var j = 0; j < lyricsLineElements.length; j++) {
                var el = lyricsLineElements[j];
                if (j === currentActiveIndex) {
                    el.classList.add('active');
                    // Smooth centered scroll in Apple Music style
                    var containerH = appleLyricsContainer.clientHeight;
                    var elH = el.clientHeight;
                    var offset = -(el.offsetTop - containerH * 0.38 + elH * 0.5);
                    lyricsScroll.style.transform = 'translateY(' + offset + 'px)';
                } else {
                    el.classList.remove('active');
                    if (el._words) {
                        for (var k = 0; k < el._words.length; k++) {
                            el._words[k].classList.remove('spoken');
                        }
                    }
                }
            }
        }

        // Real-time word-by-word illumination in active line
        if (currentActiveIndex >= 0 && lyricsLineElements[currentActiveIndex]) {
            var activeEl = lyricsLineElements[currentActiveIndex];
            if (activeEl._words && activeEl._wordData) {
                for (var w = 0; w < activeEl._words.length; w++) {
                    var wordSpan = activeEl._words[w];
                    var wordData = activeEl._wordData[w];
                    if (curTime >= wordData.start) {
                        wordSpan.classList.add('spoken');
                    } else {
                        wordSpan.classList.remove('spoken');
                    }
                }
            }

            // Subtle beat pulse on active lyric
            if (beatIntensity > 0.4) {
                activeEl.classList.add('beat-pulse');
            } else {
                activeEl.classList.remove('beat-pulse');
            }
        }
    }

    function toggleLyrics() {
        if (!appleLyricsContainer) return;
        var isHidden = appleLyricsContainer.classList.toggle('hidden-lyrics');
        if (lyricsToggle) {
            lyricsToggle.classList.toggle('active', !isHidden);
            lyricsToggle.setAttribute('aria-label', isHidden ? 'Mostrar letra' : 'Ocultar letra');
        }
    }

    // ==========================================
    // AUDIO CONTROLS & TIMELINE
    // ==========================================

    function formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    function initAudio() {
        audio = new Audio();
        audio.src = CONFIG.AUDIO_SRC;
        audio.loop = true;
        audio.volume = 0.7;
        audio.preload = 'auto';

        audio.addEventListener('play', function () {
            isPlaying = true;
            updateAudioIcons();
            startPetalFall();
            initWebAudio();
        });

        audio.addEventListener('pause', function () {
            isPlaying = false;
            updateAudioIcons();
            stopPetalFall();
        });

        audio.addEventListener('timeupdate', function () {
            updateLyricsDisplay();
            updateProgress();
        });

        audio.addEventListener('loadedmetadata', function () {
            timeTotal.textContent = formatTime(audio.duration);
            updateProgress();
        });

        audio.addEventListener('error', function () {
            console.warn('No se pudo cargar el audio en:', CONFIG.AUDIO_SRC);
        });
    }

    function updateProgress() {
        if (!audio) return;
        timeCurrent.textContent = formatTime(audio.currentTime);
        if (isFinite(audio.duration) && audio.duration > 0) {
            timeTotal.textContent = formatTime(audio.duration);
            var pct = (audio.currentTime / audio.duration) * 100;
            progressBarFill.style.width = pct + '%';
        }
    }

    function togglePlay() {
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            initWebAudio();
            audio.play().catch(function (e) {
                console.warn('Playback bloqueado:', e);
            });
        }
    }

    function toggleMute() {
        if (!audio) return;
        isMuted = !isMuted;
        audio.muted = isMuted;
        updateMuteIcons();
    }

    function updateAudioIcons() {
        var iconPause = audioToggle.querySelector('.icon-pause');
        var iconPlay = audioToggle.querySelector('.icon-play');
        if (isPlaying) {
            iconPause.classList.remove('hidden');
            iconPlay.classList.add('hidden');
            audioToggle.setAttribute('aria-label', 'Pausar música');
        } else {
            iconPause.classList.add('hidden');
            iconPlay.classList.remove('hidden');
            audioToggle.setAttribute('aria-label', 'Reanudar música');
        }
    }

    function updateMuteIcons() {
        var iconUnmuted = audioMute.querySelector('.icon-unmuted');
        var iconMuted = audioMute.querySelector('.icon-muted');
        if (isMuted) {
            iconUnmuted.classList.add('hidden');
            iconMuted.classList.remove('hidden');
            audioMute.setAttribute('aria-label', 'Activar sonido');
        } else {
            iconUnmuted.classList.remove('hidden');
            iconMuted.classList.add('hidden');
            audioMute.setAttribute('aria-label', 'Silenciar música');
        }
    }

    // ==========================================
    // DOM PETAL PARTICLES (Falling in background)
    // ==========================================

    function createFallingPetal() {
        if (!petalLayer) return;

        var petal = document.createElement('span');
        petal.className = 'falling-petal';
        petal.style.setProperty('--x', (Math.random() * 100).toFixed(2) + 'vw');
        petal.style.setProperty('--drift', ((Math.random() - 0.5) * 180).toFixed(0) + 'px');
        petal.style.setProperty('--duration', (7 + Math.random() * 7).toFixed(2) + 's');
        petal.style.setProperty('--delay', (Math.random() * 0.8).toFixed(2) + 's');
        petal.style.setProperty('--scale', (0.55 + Math.random() * 0.8).toFixed(2));
        petalLayer.appendChild(petal);
        petal.addEventListener('animationend', function () {
            petal.remove();
        });
    }

    function startPetalFall() {
        if (petalTimer) return;
        for (var i = 0; i < 8; i++) createFallingPetal();
        petalTimer = setInterval(createFallingPetal, 900);
    }

    function stopPetalFall() {
        if (!petalTimer) return;
        clearInterval(petalTimer);
        petalTimer = null;
    }

    // ==========================================
    // CANVAS SIZING
    // ==========================================

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        for (var i = 0; i < flowers.length; i++) {
            flowers[i].baseY = height + 15;
        }
    }

    // ==========================================
    // MAIN RENDER LOOP (60 FPS)
    // ==========================================

    function render(timestamp) {
        if (!lastTimestamp) lastTimestamp = timestamp;
        var delta = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        // 1. Update real-time beat analysis
        updateBeatAnalysis();

        // 2. Smooth decay of external wind force
        windForce *= 0.94;

        // 3. Clear canvas
        ctx.clearRect(0, 0, width, height);

        // 4. Update and draw particles (ambient floating petals)
        updateParticles(ctx, delta);

        // 5. Update and draw dancing sunflowers
        for (var i = 0; i < flowers.length; i++) {
            flowers[i].update(delta, timestamp, windForce);
            flowers[i].draw(ctx, timestamp);
        }

        animFrameId = requestAnimationFrame(render);
    }

    // ==========================================
    // TOUCH & POINTER INTERACTIONS (PRIORIDAD TÁCTIL)
    // ==========================================

    var pointerDownData = null;
    var lastPointerPos = { x: 0, y: 0, time: 0 };

    function getCanvasCoords(e) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function onPointerDown(e) {
        if (e.pointerType === 'touch' || e.pointerType === 'mouse' || e.pointerType === 'pen') {
            e.preventDefault();
        }
        var coords = getCanvasCoords(e);
        pointerDownData = {
            x: coords.x,
            y: coords.y,
            time: performance.now(),
            hasMoved: false
        };
        lastPointerPos = {
            x: coords.x,
            y: coords.y,
            time: performance.now()
        };

        // Check if touching any flower (reverse loop: foreground first)
        for (var i = flowers.length - 1; i >= 0; i--) {
            if (flowers[i].containsPoint(coords.x, coords.y)) {
                activeFlower = flowers[i];
                activeFlower.isDragging = true; // PAUSES DANCING IMMEDIATELY
                activeFlower.dragOffsetX = activeFlower.x - coords.x;
                activeFlower.dragOffsetY = activeFlower.y - coords.y;
                canvas.classList.add('is-dragging');
                if (canvas.setPointerCapture) {
                    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
                }
                dismissHint();
                break;
            }
        }
    }

    function onPointerMove(e) {
        var coords = getCanvasCoords(e);
        var now = performance.now();
        var dt = Math.max(1, now - lastPointerPos.time);
        var dx = coords.x - lastPointerPos.x;
        var dy = coords.y - lastPointerPos.y;
        var speed = Math.hypot(dx, dy) / dt; // px/ms

        if (pointerDownData && Math.hypot(coords.x - pointerDownData.x, coords.y - pointerDownData.y) > 10) {
            pointerDownData.hasMoved = true;
        }

        // 1. Drag captured flower (stem follows finger with total precision)
        if (activeFlower) {
            activeFlower.x = coords.x + activeFlower.dragOffsetX;
            activeFlower.y = coords.y + activeFlower.dragOffsetY;
            activeFlower.vx = dx * 0.4;
            activeFlower.vy = dy * 0.4;
            spawnPollen(coords.x, coords.y);
        }

        // 2. Swipe wind breeze
        if (speed > 1.1) {
            windForce += dx * 0.35;
            if (Math.random() > 0.55) {
                spawnPetalBurst(coords.x, coords.y, 2);
            }
        }

        // 3. Pointer pollen trail
        if (Math.random() > 0.45) {
            spawnPollen(coords.x, coords.y);
        }

        lastPointerPos = { x: coords.x, y: coords.y, time: now };
    }

    function onPointerUp(e) {
        var coords = getCanvasCoords(e);
        var now = performance.now();

        if (activeFlower) {
            activeFlower.isDragging = false;
            // Transfer release velocity for elastic bounce
            var dt = Math.max(1, now - lastPointerPos.time);
            var dx = coords.x - lastPointerPos.x;
            var dy = coords.y - lastPointerPos.y;
            activeFlower.vx = (dx / dt) * 12;
            activeFlower.vy = (dy / dt) * 12;
            activeFlower = null;
            canvas.classList.remove('is-dragging');
            if (canvas.releasePointerCapture) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
            }
        } else if (pointerDownData && !pointerDownData.hasMoved && (now - pointerDownData.time < 500)) {
            // Tap on empty space: Plant a new dancing flower!
            plantNewFlower(coords.x, coords.y);
            dismissHint();
        }

        pointerDownData = null;
    }

    function onPointerCancel(e) {
        if (activeFlower) {
            activeFlower.isDragging = false;
            activeFlower = null;
            canvas.classList.remove('is-dragging');
            if (canvas.releasePointerCapture && e) {
                try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
            }
        }
        pointerDownData = null;
    }

    function dismissHint() {
        if (hasInteracted) return;
        hasInteracted = true;
        if (interactiveHint) {
            interactiveHint.classList.remove('visible');
            setTimeout(function () {
                interactiveHint.classList.add('hidden');
            }, 600);
        }
        if (hintTimeout) clearTimeout(hintTimeout);
    }

    // ==========================================
    // PROGRESS BAR SCRUBBING
    // ==========================================

    function onProgressBarClick(e) {
        if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
        var rect = progressBarBg.getBoundingClientRect();
        var clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        var seekTime = (clickX / rect.width) * audio.duration;
        audio.currentTime = seekTime;
        updateProgress();
        updateLyricsDisplay();
    }

    // ==========================================
    // EXPERIENCE TRANSITION
    // ==========================================

    function goToWelcomeScreen() {
        if (catIntroScreen) {
            catIntroScreen.classList.remove('active');
        }
        if (welcomeScreen) {
            welcomeScreen.classList.add('active');
        }
    }

    function startExperience() {
        if (animationStarted) return;
        animationStarted = true;

        welcomeScreen.classList.remove('active');
        experienceScreen.classList.add('active');

        initWebAudio();
        if (audio) {
            audio.play().catch(function (e) {
                console.warn('Autoplay bloqueado. Usa el botón en la barra:', e);
            });
        }

        setTimeout(function () {
            resizeCanvas();
            buildFlowerGarden();
            initAmbientParticles();
            buildLyrics();

            // Reveal Apple Music lyrics and minimalist audio bar
            appleLyricsContainer.classList.remove('hidden');
            audioBar.classList.remove('hidden');

            requestAnimationFrame(function () {
                appleLyricsContainer.classList.add('visible');
                audioBar.classList.add('visible');
            });

            // Start animation loop
            if (animFrameId) cancelAnimationFrame(animFrameId);
            animFrameId = requestAnimationFrame(render);
            startPetalFall();

            // Show floating glassmorphism badge after 1.8s
            hintTimeout = setTimeout(function () {
                if (!hasInteracted && interactiveHint) {
                    interactiveHint.classList.remove('hidden');
                    requestAnimationFrame(function () {
                        interactiveHint.classList.add('visible');
                    });
                }
            }, 1800);

        }, 400);
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    function bindEvents() {
        if (catContinueBtn) {
            catContinueBtn.addEventListener('click', goToWelcomeScreen);
        }
        openBtn.addEventListener('click', startExperience);

        audioToggle.addEventListener('click', togglePlay);
        audioMute.addEventListener('click', toggleMute);
        if (lyricsToggle) {
            lyricsToggle.addEventListener('click', toggleLyrics);
        }
        progressBarBg.addEventListener('click', onProgressBarClick);

        // Touch & pointer events on canvas
        canvas.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);

        // Window resize
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (!experienceScreen.classList.contains('active')) return;
                resizeCanvas();
            }, 120);
        });

        // Keyboard accessibility
        document.addEventListener('keydown', function (e) {
            if (experienceScreen.classList.contains('active')) {
                if (e.key === 'Escape' && audio && isPlaying) {
                    audio.pause();
                } else if (e.key === ' ' && e.target === document.body) {
                    e.preventDefault();
                    togglePlay();
                }
            }
        });
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    function init() {
        youtubeLink.href = CONFIG.YOUTUBE_URL;
        initAudio();
        bindEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
