(function () {
    'use strict';

    // ========================
    // CONFIGURATION
    // ========================

    var CONFIG = {
        YOUTUBE_URL: 'https://www.youtube.com/watch?v=vlneT-a-KkQ&list=RDvlneT-a-KkQ&start_radio=1',
        AUDIO_SRC: 'El_Tesoro.mp3',
        REGION_DELAY: 16,
        BATCH_SIZE: 5,
        BG_COLOR: { r: 253, g: 248, b: 243 }
    };

    // ========================
    // DOM REFERENCES
    // ========================

    var welcomeScreen = document.getElementById('welcome-screen');
    var experienceScreen = document.getElementById('experience-screen');
    var openBtn = document.getElementById('open-btn');
    var canvas = document.getElementById('flower-canvas');
    var ctx = canvas.getContext('2d');
    var audioControls = document.getElementById('audio-controls');
    var audioToggle = document.getElementById('audio-toggle');
    var audioMute = document.getElementById('audio-mute');
    var youtubeContainer = document.getElementById('youtube-btn-container');
    var youtubeLink = document.getElementById('youtube-link');
    var lyricsPanel = document.getElementById('lyrics-panel');
    var lyricsLine = document.getElementById('lyrics-line');
    var lyricsStatus = document.getElementById('lyrics-status');
    var petalLayer = document.getElementById('petal-layer');

    // ========================
    // STATE
    // ========================

    var audio = null;
    var isPlaying = false;
    var isMuted = false;
    var flowerData = null;
    var animationStarted = false;
    var flowerAnimationFrame = null;
    var renderedRegionCount = 1;
    var petalTimer = null;

    // Tiempos absolutos en segundos. Los dos primeros fueron fijados con las
    // marcas proporcionadas: 0:17-0:19 y 0:20-0:24.
    var lyrics = [
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

    if (window.LYRICS_TIMELINE && window.LYRICS_TIMELINE.length) {
        lyrics = window.LYRICS_TIMELINE;
    }

    // Offscreen buffer at original data resolution
    var bufferCanvas = null;
    var bufferCtx = null;
    var imageData = null;
    var bufData = null;

    // Original data bounds
    var DATA_WIDTH = 356;
    var DATA_HEIGHT = 400;

    // ========================
    // AUDIO MANAGEMENT
    // ========================

    function initAudio() {
        audio = new Audio();
        audio.src = CONFIG.AUDIO_SRC;
        audio.loop = true;
        audio.volume = 0.6;
        audio.preload = 'auto';

        audio.addEventListener('play', function () {
            isPlaying = true;
            updateAudioIcons();
            updateLyrics();
            startFlowerMotion();
        });

        audio.addEventListener('pause', function () {
            isPlaying = false;
            updateAudioIcons();
            updateLyrics();
            stopFlowerMotion();
        });

        audio.addEventListener('timeupdate', updateLyrics);
        audio.addEventListener('loadedmetadata', updateLyrics);

        audio.addEventListener('error', function () {
            console.warn('No se pudo cargar el audio. Coloca tu cancion en:', CONFIG.AUDIO_SRC);
        });
    }

    function updateLyrics() {
        if (!audio || !isFinite(audio.currentTime)) return;

        var current = null;
        for (var i = 0; i < lyrics.length; i++) {
            if (audio.currentTime >= lyrics[i].start) current = lyrics[i];
        }

        if (current) {
            var duration = Math.max(current.end - current.start, 0.1);
            var progress = Math.min(Math.max((audio.currentTime - current.start) / duration, 0), 1);
            var words = current.words || current.text.split(' ').map(function (text) {
                return { text: text };
            });
            var visibleWords = current.words ? words.filter(function (word) {
                return audio.currentTime >= word.start;
            }).length : Math.max(1, Math.ceil(progress * words.length));
            var revealed = words.slice(0, visibleWords).map(function (word) {
                return word.text;
            }).join(' ');
            var pending = words.slice(visibleWords).map(function (word) {
                return word.text;
            }).join(' ');
            lyricsLine.innerHTML = '<span class="lyrics-revealed">' + revealed + '</span>' +
                (pending ? ' <span class="lyrics-pending">' + pending + '</span>' : '');
        } else {
            lyricsLine.textContent = 'La canción está por comenzar';
        }

        lyricsStatus.textContent = isPlaying ? 'Sincronizada con la música' : 'Música en pausa';
    }

    function togglePlay() {
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(function (e) {
                console.warn('Reproduccion bloqueada:', e);
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
            audioToggle.setAttribute('aria-label', 'Pausar musica');
        } else {
            iconPause.classList.add('hidden');
            iconPlay.classList.remove('hidden');
            audioToggle.setAttribute('aria-label', 'Reanudar musica');
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
            audioMute.setAttribute('aria-label', 'Silenciar musica');
        }
    }

    // ========================
    // COLOR UTILITIES
    // ========================

    function normalizeColor(color) {
        var r = color[0];
        var g = color[1];
        var b = color[2];
        if (r <= 1 && g <= 1 && b <= 1) {
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }
        return [Math.round(r), Math.round(g), Math.round(b)];
    }

    // ========================
    // OFFSCREEN BUFFER
    // ========================

    function initBuffer() {
        bufferCanvas = document.createElement('canvas');
        bufferCanvas.width = DATA_WIDTH;
        bufferCanvas.height = DATA_HEIGHT;
        bufferCtx = bufferCanvas.getContext('2d');
        imageData = bufferCtx.createImageData(DATA_WIDTH, DATA_HEIGHT);
        bufData = imageData.data;

        // Fill with background color
        var bg = CONFIG.BG_COLOR;
        for (var i = 0; i < bufData.length; i += 4) {
            bufData[i] = bg.r;
            bufData[i + 1] = bg.g;
            bufData[i + 2] = bg.b;
            bufData[i + 3] = 255;
        }
    }

    function clearBuffer() {
        var bg = CONFIG.BG_COLOR;
        for (var i = 0; i < bufData.length; i += 4) {
            bufData[i] = bg.r;
            bufData[i + 1] = bg.g;
            bufData[i + 2] = bg.b;
            bufData[i + 3] = 255;
        }
    }

    function drawRegionToBuffer(region) {
        var color = normalizeColor(region.color);
        var r = color[0];
        var g = color[1];
        var b = color[2];
        var contour = region.contour;

        for (var i = 0, len = contour.length; i < len; i++) {
            var x = contour[i][0];
            var y = contour[i][1];
            if (x >= 0 && x < DATA_WIDTH && y >= 0 && y < DATA_HEIGHT) {
                var idx = (y * DATA_WIDTH + x) * 4;
                bufData[idx] = r;
                bufData[idx + 1] = g;
                bufData[idx + 2] = b;
                bufData[idx + 3] = 255;
            }
        }
    }

    function drawAllRegionsToBuffer(data) {
        clearBuffer();
        // Skip region 0 (background with 70K points) — already filled by clearBuffer
        for (var i = 1; i < data.length; i++) {
            drawRegionToBuffer(data[i]);
        }
    }

    function blitBuffer() {
        bufferCtx.putImageData(imageData, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bufferCanvas, 0, 0, canvas.width, canvas.height);
    }

    function renderFlowersForAudio() {
        if (!flowerData || !audio || !isFinite(audio.currentTime)) return;

        var duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 271.5;
        var revealProgress = Math.min(audio.currentTime / duration, 1);
        var targetCount = 1 + Math.floor(revealProgress * (flowerData.length - 1));

        if (targetCount > renderedRegionCount) {
            var nextCount = Math.min(targetCount, renderedRegionCount + 2);
            for (var i = renderedRegionCount; i < nextCount; i++) {
                drawRegionToBuffer(flowerData[i]);
            }
            renderedRegionCount = nextCount;
            blitBuffer();
        }

        if (isPlaying) {
            flowerAnimationFrame = requestAnimationFrame(renderFlowersForAudio);
        }
    }

    function startFlowerMotion() {
        if (flowerAnimationFrame) cancelAnimationFrame(flowerAnimationFrame);
        flowerAnimationFrame = requestAnimationFrame(renderFlowersForAudio);
        startPetalFall();
        canvas.classList.add('is-playing');
    }

    function stopFlowerMotion() {
        if (flowerAnimationFrame) cancelAnimationFrame(flowerAnimationFrame);
        flowerAnimationFrame = null;
        stopPetalFall();
        canvas.classList.remove('is-playing');
    }

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
        petalTimer = setInterval(createFallingPetal, 850);
    }

    function stopPetalFall() {
        if (!petalTimer) return;
        clearInterval(petalTimer);
        petalTimer = null;
    }

    // ========================
    // CANVAS SIZING
    // ========================

    function resizeCanvas() {
        var padding = 20;
        var availW = window.innerWidth - padding * 2;
        var availH = window.innerHeight - padding * 2;

        var scaleX = availW / DATA_WIDTH;
        var scaleY = availH / DATA_HEIGHT;
        var scale = Math.min(scaleX, scaleY);

        var displayW = Math.ceil(DATA_WIDTH * scale);
        var displayH = Math.ceil(DATA_HEIGHT * scale);

        var dpr = window.devicePixelRatio || 1;
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
        canvas.style.width = displayW + 'px';
        canvas.style.height = displayH + 'px';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ========================
    // DRAW (FULL, NO ANIMATION)
    // ========================

    function drawAll(data) {
        clearBuffer();
        var duration = audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 271.5;
        var revealProgress = audio ? Math.min(audio.currentTime / duration, 1) : 0;
        renderedRegionCount = 1 + Math.floor(revealProgress * (data.length - 1));
        for (var i = 1; i < renderedRegionCount; i++) {
            drawRegionToBuffer(data[i]);
        }
        blitBuffer();
    }

    // ========================
    // ANIMATED REVEAL
    // ========================

    function animateFlowers(data) {
        clearBuffer();
        renderedRegionCount = 1;
        blitBuffer();
        onFlowersComplete();
        if (isPlaying) startFlowerMotion();
    }

    // ========================
    // FLOWERS COMPLETE
    // ========================

    function onFlowersComplete() {
        audioControls.classList.remove('hidden');
        youtubeContainer.classList.remove('hidden');
        lyricsPanel.classList.remove('hidden');

        requestAnimationFrame(function () {
            audioControls.classList.add('visible');
            youtubeContainer.classList.add('visible');
            lyricsPanel.classList.add('visible');
        });
    }

    // ========================
    // EXPERIENCE TRANSITION
    // ========================

    function startExperience() {
        if (animationStarted) return;
        animationStarted = true;

        welcomeScreen.classList.remove('active');
        experienceScreen.classList.add('active');

        if (audio) {
            audio.play().catch(function (e) {
                console.warn('La reproduccion automatica fue bloqueada. Usa el boton de reproduccion:', e);
            });
        }

        setTimeout(function () {
            resizeCanvas();

            if (flowerData) {
                animateFlowers(flowerData);
            }

        }, 400);
    }

    // ========================
    // DATA LOADING
    // ========================

    function loadFlowerData() {
        if (window.FLOWER_DATA) {
            flowerData = window.FLOWER_DATA;
        } else {
            console.error('No se encontraron los datos de las flores');
        }
    }

    // ========================
    // EVENT LISTENERS
    // ========================

    function bindEvents() {
        openBtn.addEventListener('click', startExperience);

        audioToggle.addEventListener('click', togglePlay);
        audioMute.addEventListener('click', toggleMute);

        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                if (!experienceScreen.classList.contains('active')) return;
                if (!flowerData) return;

                resizeCanvas();

                if (animationStarted) {
                    drawAll(flowerData);
                    audioControls.classList.add('visible');
                    audioControls.classList.remove('hidden');
                    youtubeContainer.classList.add('visible');
                    youtubeContainer.classList.remove('hidden');
                }
            }, 100);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && experienceScreen.classList.contains('active')) {
                if (audio && isPlaying) {
                    audio.pause();
                }
            }
        });
    }

    // ========================
    // INIT
    // ========================

    function init() {
        youtubeLink.href = CONFIG.YOUTUBE_URL;
        loadFlowerData();
        initBuffer();
        initAudio();
        bindEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
