/**
 * Musical Flowers Animation System
 * --------------------------------
 * Sistema orgánico de animación para flores que reaccionan de manera
 * elegante, romántica y natural a las métricas del audio (bass, mid, treble, volume).
 *
 * Mapeo:
 *  - bass   -> Oscilación suave de tallos, flexión e impulsos en golpes musicales
 *  - mid    -> Respiración armónica, inclinación y movimiento de pétalos/hojas
 *  - treble -> Micro-detalles, brillo sutil y vibración romántica suave
 *  - volume -> Escala e intensidad lumínica general
 */

(function (window) {
    'use strict';

    var GOLDEN_ANGLE = 137.5 * (Math.PI / 180);

    // ==========================================
    // CONTROL GLOBAL DE INTENSIDAD
    // ==========================================
    var animationIntensity = 1.0;

    function setAnimationIntensity(val) {
        animationIntensity = Math.max(0, Math.min(3.0, val));
    }

    function getAnimationIntensity() {
        return animationIntensity;
    }

    // ==========================================
    // CLASE INDIVIDUAL DE FLOR (Sunflower)
    // ==========================================

    function MusicalFlower(options) {
        options = options || {};

        this.id = Math.random().toString(36).substr(2, 9);
        this.baseX = options.baseX || 0;
        this.baseY = options.baseY || 0;
        this.naturalHeadX = options.headX || this.baseX;
        this.naturalHeadY = options.headY || (this.baseY - 260);

        // Posición animada actual
        this.x = this.naturalHeadX;
        this.y = this.naturalHeadY;

        // FÍSICA Y SUAVIZADO INDIVIDUALIZADO
        this.vx = 0;
        this.vy = 0;
        this.stiffness = options.stiffness || (0.052 + Math.random() * 0.018);
        this.damping = options.damping || (0.86 + Math.random() * 0.04);

        // =======================================================
        // PARÁMETROS ORGÁNICOS INDIVIDUALES (Para que no reaccionen igual)
        // =======================================================
        this.phase = options.phase !== undefined ? options.phase : Math.random() * Math.PI * 2;
        this.speed = options.speed || (0.75 + Math.random() * 0.45); // Velocidad propia de oscilación
        this.sensitivity = options.sensitivity || (0.78 + Math.random() * 0.44); // Sensibilidad al sonido
        this.rotationAmount = options.rotationAmount || (0.08 + Math.random() * 0.07); // Cantidad de giro
        this.scaleAmount = options.scaleAmount || (0.045 + Math.random() * 0.035); // Reacción de escala
        this.swayAmount = options.swayAmount || (14 + Math.random() * 12); // Vaivén horizontal suave
        this.verticalLift = options.verticalLift || (28 + Math.random() * 20); // Elevación rítmica

        // Sensibilidad por frecuencias
        this.bassResponse = 0.85 + Math.random() * 0.35;
        this.midResponse = 0.80 + Math.random() * 0.40;
        this.trebleResponse = 0.70 + Math.random() * 0.45;

        // Atributos visuales
        this.radius = options.radius || 60;
        this.petalCount = options.petalCount || (Math.floor(Math.random() * 4) + 21);
        this.stemWidth = options.stemWidth || (this.radius > 55 ? 6 : 4.5);
        this.angleOffset = Math.random() * Math.PI * 2;
        this.naturalCurve = options.naturalCurve !== undefined ? options.naturalCurve : ((Math.random() - 0.5) * 25);

        // Variables de estado dinámico
        this.currentTilt = 0;
        this.currentScaleMod = 1.0;
        this.petalFlutter = 0;

        // Crecimiento y floración inicial
        this.growth = 0;
        this.targetGrowth = 1;
        this.bloomDelay = options.bloomDelay || 0;
        this.elapsed = 0;
        this.growthSpeed = 0.028 + Math.random() * 0.015;

        // Interacción táctil (pausa física reactiva si se arrastra)
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Hojas a lo largo del tallo
        this.leaves = [
            {
                t: 0.35 + Math.random() * 0.08,
                side: Math.random() > 0.5 ? 1 : -1,
                length: this.radius * (0.65 + Math.random() * 0.22),
                width: this.radius * (0.28 + Math.random() * 0.09),
                angleOffset: (Math.random() - 0.5) * 0.22
            },
            {
                t: 0.62 + Math.random() * 0.08,
                side: Math.random() > 0.5 ? -1 : 1,
                length: this.radius * (0.55 + Math.random() * 0.20),
                width: this.radius * (0.24 + Math.random() * 0.08),
                angleOffset: (Math.random() - 0.5) * 0.22
            }
        ];

        // Semillas en espiral áurea
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

    /**
     * Actualiza la posición y animación orgánica de la flor según las métricas del audio.
     */
    MusicalFlower.prototype.update = function (delta, time, audioData, windForce) {
        this.elapsed += delta;

        // Crecimiento al aparecer
        if (this.elapsed > this.bloomDelay && this.growth < this.targetGrowth) {
            this.growth = Math.min(this.targetGrowth, this.growth + this.growthSpeed);
        }

        if (this.isDragging) return;

        audioData = audioData || { volume: 0, bass: 0, mid: 0, treble: 0 };
        var intensity = animationIntensity;

        var bassVal = (audioData.bass || 0) * this.bassResponse * intensity;
        var midVal = (audioData.mid || 0) * this.midResponse * intensity;
        var trebleVal = (audioData.treble || 0) * this.trebleResponse * intensity;
        var volVal = (audioData.volume || 0) * intensity;

        // =================================================================
        // 1. MOVIMIENTO SUAVE Y ELEGANTE DEL TALLO (Breeze + Bass + Speed)
        // =================================================================
        // Brisa base lenta, natural y romántica
        var baseBreezeTime = time * 0.001 * this.speed + this.phase;
        var naturalSway = Math.sin(baseBreezeTime) * (3.0 + 5.0 * volVal);

        // Oscilación orgánica modulada por los bajos y compás musical
        var musicalSway = Math.sin(time * 0.0035 * this.speed + this.phase) * (this.swayAmount * bassVal);

        // Desplazamiento lateral objetivo
        var targetX = this.naturalHeadX + naturalSway + musicalSway + (windForce || 0) * 0.4;

        // =================================================================
        // 2. ELEVACIÓN Y CABECEO RÍTMICO VERTICAL (Bass Hits)
        // =================================================================
        // En los golpes de música el tallo se arquea y baila verticalmente
        var verticalDance = -Math.sin(baseBreezeTime * 1.4) * (2.5 + 4.0 * volVal) - (bassVal * this.verticalLift);
        var targetY = this.naturalHeadY + verticalDance;

        // =================================================================
        // 3. INCLINACIÓN (Tilt / Rotation)
        // =================================================================
        var targetTilt = Math.sin(baseBreezeTime + 0.5) * (this.rotationAmount * (0.4 + 0.8 * bassVal));
        this.currentTilt += (targetTilt - this.currentTilt) * 0.15;

        // =================================================================
        // 4. RESPIRACIÓN DE PÉTALOS Y ESCALA (Mid & Volume)
        // =================================================================
        var targetScale = 1.0 + (volVal * this.scaleAmount) + (midVal * 0.035);
        this.currentScaleMod += (targetScale - this.currentScaleMod) * 0.2;

        // Micro-ondulación en los pétalos por agudos
        this.petalFlutter = Math.sin(time * 0.012 + this.phase) * (trebleVal * 0.06);

        // FÍSICA DE RESORTE AMORTIGUADO (Spring-damper para máxima suavidad)
        var ax = (targetX - this.x) * this.stiffness;
        var ay = (targetY - this.y) * this.stiffness;

        this.vx = (this.vx + ax) * this.damping;
        this.vy = (this.vy + ay) * this.damping;

        this.x += this.vx;
        this.y += this.vy;
    };

    /**
     * Dibuja el girasol con su tallo curvo, hojas y corazón con textura áurea.
     */
    MusicalFlower.prototype.draw = function (context, time, audioData) {
        if (this.growth <= 0.01) return;

        audioData = audioData || { volume: 0, bass: 0, mid: 0, treble: 0 };
        var g = this.growth;
        var easeGrowth = Math.min(1, Math.sin(g * Math.PI * 0.5));
        var currentRadius = this.radius * easeGrowth * this.currentScaleMod;

        var bx = this.baseX;
        var by = this.baseY;
        var hx = this.x;
        var hy = this.y;

        // ==========================================
        // 1. TALLO ORGÁNICO (Cubic Bezier)
        // ==========================================
        var dx = hx - bx;
        var dy = hy - by;
        var curveOffset = (this.naturalCurve + this.currentTilt * 40) * (1 - easeGrowth * 0.25);
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
        // 2. HOJAS A LO LARGO DEL TALLO
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

            // Reacción sutil de las hojas a frecuencias medias
            var leafMidWobble = Math.sin(time * 0.003 + this.phase + l) * (0.05 + 0.12 * (audioData.mid || 0));
            var leafAngle = tangentAngle + (leaf.side * (Math.PI * 0.36) + leaf.angleOffset) + leafMidWobble;
            var leafLen = leaf.length * easeGrowth;
            var leafWid = leaf.width * easeGrowth;

            if (leafLen > 4) {
                context.save();
                context.translate(lx, ly);
                context.rotate(leafAngle);

                var leafGrad = context.createLinearGradient(0, 0, leafLen, 0);
                leafGrad.addColorStop(0, '#365314');
                leafGrad.addColorStop(0.55, '#4d7c0f');
                leafGrad.addColorStop(1, '#65a30d');

                context.beginPath();
                context.moveTo(0, 0);
                context.bezierCurveTo(leafLen * 0.35, -leafWid * 0.65, leafLen * 0.75, -leafWid * 0.45, leafLen, 0);
                context.bezierCurveTo(leafLen * 0.75, leafWid * 0.45, leafLen * 0.35, leafWid * 0.65, 0, 0);
                context.fillStyle = leafGrad;
                context.fill();

                context.restore();
            }
        }

        context.restore();

        // ==========================================
        // 3. CABEZA DEL GIRASOL Y PÉTALOS
        // ==========================================
        context.save();
        context.translate(hx, hy);

        // Giro armónico siguiendo la tangente del tallo más el tilt musical
        var headAngle = Math.atan2(hy - cp2y, hx - cp2x) - Math.PI / 2 + this.currentTilt;
        context.rotate(headAngle * 0.45);

        // Halo luminoso cálido (reacciona al volumen y presencia)
        var glow = context.createRadialGradient(0, 0, currentRadius * 0.35, 0, 0, currentRadius * 1.35);
        var glowAlpha = 0.18 + (audioData.volume || 0) * 0.18;
        glow.addColorStop(0, 'rgba(255, 220, 80, ' + glowAlpha + ')');
        glow.addColorStop(0.6, 'rgba(245, 158, 11, 0.08)');
        glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(0, 0, currentRadius * 1.35, 0, Math.PI * 2);
        context.fill();

        // Sépalos verdes
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

        // CAPA 1: PÉTALOS EXTERIORES
        var pCount = this.petalCount;
        var step = (Math.PI * 2) / pCount;

        for (var i = 0; i < pCount; i++) {
            var pAngle = i * step + this.angleOffset;
            var flutter = Math.sin(pAngle * 2 + time * 0.005) * this.petalFlutter;
            var petalLen = currentRadius * (1.05 + 0.12 * Math.sin(i * 3 + this.angleOffset) + flutter);
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
            context.bezierCurveTo(-petalWid * 0.75, -petalLen * 0.35, -petalWid * 0.65, -petalLen * 0.85, 0, -petalLen);
            context.bezierCurveTo(petalWid * 0.65, -petalLen * 0.85, petalWid * 0.75, -petalLen * 0.35, 0, 0);
            context.fillStyle = petalGrad;
            context.fill();

            context.restore();
        }

        // CAPA 2: PÉTALOS INTERIORES
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

        // 4. DISCO CENTRAL (Corazón del Girasol)
        var centerR = currentRadius * 0.38;

        // Anillo de polen dorado
        var rimGrad = context.createRadialGradient(0, 0, centerR * 0.78, 0, 0, centerR * 1.05);
        rimGrad.addColorStop(0, '#78350f');
        rimGrad.addColorStop(0.7, '#b45309');
        rimGrad.addColorStop(1, '#f59e0b');
        context.beginPath();
        context.arc(0, 0, centerR * 1.04, 0, Math.PI * 2);
        context.fillStyle = rimGrad;
        context.fill();

        // Centro chocolate tostado
        var centerGrad = context.createRadialGradient(-centerR * 0.15, -centerR * 0.15, 0, 0, 0, centerR);
        centerGrad.addColorStop(0, '#261205');
        centerGrad.addColorStop(0.45, '#3b1c09');
        centerGrad.addColorStop(0.82, '#572b0c');
        centerGrad.addColorStop(1, '#78380d');
        context.beginPath();
        context.arc(0, 0, centerR, 0, Math.PI * 2);
        context.fillStyle = centerGrad;
        context.fill();

        // Textura en espiral áurea
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

        // Brillo sutil
        var gleam = context.createRadialGradient(-centerR * 0.35, -centerR * 0.35, 1, -centerR * 0.35, -centerR * 0.35, centerR * 0.6);
        gleam.addColorStop(0, 'rgba(255, 235, 160, 0.25)');
        gleam.addColorStop(1, 'rgba(255, 235, 160, 0)');
        context.beginPath();
        context.arc(0, 0, centerR * 0.9, 0, Math.PI * 2);
        context.fillStyle = gleam;
        context.fill();

        context.restore();
    };

    MusicalFlower.prototype.containsPoint = function (px, py, width) {
        var isMobile = (width || window.innerWidth) < 640;
        var headDist = Math.hypot(px - this.x, py - this.y);
        if (headDist <= this.radius * (isMobile ? 1.6 : 1.4)) return true;

        var midX = (this.baseX + this.x) * 0.5;
        var midY = (this.baseY + this.y) * 0.5;
        var stemDist = Math.hypot(px - (midX + this.x) * 0.5, py - (midY + this.y) * 0.5);
        if (stemDist <= this.radius * 0.75) return true;

        return false;
    };

    // ==========================================
    // GESTOR DE JARDÍN DE FLORES
    // ==========================================

    var gardenFlowers = [];

    /**
     * Función principal requerida por la especificación:
     * updateFlowers(audioData)
     * Actualiza todas las flores con los datos de audio interpolados
     */
    function updateFlowers(audioData, delta, time, windForce) {
        delta = delta || 16.67;
        time = time !== undefined ? time : performance.now();
        windForce = windForce || 0;

        for (var i = 0; i < gardenFlowers.length; i++) {
            gardenFlowers[i].update(delta, time, audioData, windForce);
        }
    }

    /**
     * Dibuja todas las flores en el canvas
     */
    function renderFlowers(context, time, audioData) {
        time = time !== undefined ? time : performance.now();
        for (var i = 0; i < gardenFlowers.length; i++) {
            gardenFlowers[i].draw(context, time, audioData);
        }
    }

    /**
     * Construye el arreglo inicial de flores adaptadas a la pantalla
     */
    function buildFlowerGarden(width, height) {
        gardenFlowers = [];
        var isMobile = width < 640;
        var count = isMobile ? 5 : 6;
        var baseMargin = width * 0.08;
        var usableWidth = width - baseMargin * 2;
        var spacing = count > 1 ? usableWidth / (count - 1) : 0;

        for (var i = 0; i < count; i++) {
            var norm = count > 1 ? i / (count - 1) : 0.5;
            var baseX = baseMargin + i * spacing + (Math.random() - 0.5) * (isMobile ? 16 : 28);
            var baseY = height + 15;

            var heightVariation = Math.sin(norm * Math.PI) * 0.08;
            var baseHeightFrac = isMobile ? 0.68 : 0.62;
            var headY = height * (baseHeightFrac - heightVariation) + (Math.random() - 0.5) * (height * 0.06);
            var radius = isMobile ? (38 + Math.random() * 12) : (50 + Math.random() * 16);

            var fanOffset = (norm - 0.5) * (isMobile ? 24 : 44);
            var headX = baseX + fanOffset + (Math.random() - 0.5) * 16;

            var bloomDelay = 200 + i * 220;

            gardenFlowers.push(new MusicalFlower({
                baseX: baseX,
                baseY: baseY,
                headX: headX,
                headY: headY,
                radius: radius,
                bloomDelay: bloomDelay,
                phase: i * 0.95 + Math.random() * 0.4,
                speed: 0.8 + Math.random() * 0.4,
                sensitivity: 0.85 + Math.random() * 0.35,
                naturalCurve: (norm - 0.5) * 25
            }));
        }

        return gardenFlowers;
    }

    /**
     * Permite plantar una nueva flor al hacer clic/tap
     */
    function plantNewFlower(x, y, width, height) {
        var isMobile = width < 640;
        var radius = isMobile ? (46 + Math.random() * 14) : (58 + Math.random() * 18);

        var newFlower = new MusicalFlower({
            baseX: x + (Math.random() - 0.5) * 35,
            baseY: height + 15,
            headX: x,
            headY: y,
            radius: radius,
            bloomDelay: 0,
            phase: gardenFlowers.length * 0.95,
            speed: 0.85 + Math.random() * 0.35,
            sensitivity: 0.9 + Math.random() * 0.3,
            naturalCurve: (Math.random() - 0.5) * 20
        });

        gardenFlowers.push(newFlower);

        var maxFlowers = isMobile ? 10 : 14;
        if (gardenFlowers.length > maxFlowers) {
            gardenFlowers.shift();
        }

        return newFlower;
    }

    // ==========================================
    // EXPORTACIÓN AL ÁMBITO GLOBAL
    // ==========================================
    window.MusicalFlower = MusicalFlower;
    window.animationIntensity = animationIntensity;
    window.setAnimationIntensity = setAnimationIntensity;
    window.getAnimationIntensity = getAnimationIntensity;
    window.updateFlowers = updateFlowers;
    window.renderFlowers = renderFlowers;
    window.buildFlowerGarden = buildFlowerGarden;
    window.plantNewFlower = plantNewFlower;
    window.getGardenFlowers = function () { return gardenFlowers; };

})(window);
