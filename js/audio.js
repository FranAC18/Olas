/**
 * Audio Synchronization & Data Interpolation System
 * --------------------------------------------------
 * Carga el audio y el archivo JSON precalculado (audio_data.json),
 * sincroniza con audio.currentTime e interpola linealmente (lerp)
 * con suavizado de ataque y caída (attack / release smoothing) a 60fps.
 */

(function (window) {
    'use strict';

    function AudioManager(options) {
        options = options || {};
        this.audioSrc = options.audioSrc || 'audio/musica.mp3';
        this.jsonSrc = options.jsonSrc || 'data/audio_data.json';
        
        // Elemento de audio HTML5
        this.audio = options.audioElement || new Audio();
        if (!options.audioElement) {
            this.audio.src = this.audioSrc;
            this.audio.preload = 'auto';
        }

        // Datos cargados desde audio_data.json
        this.data = [];
        this.isLoaded = false;
        this.lastFoundIndex = 0;

        // Configuración de suavizado (Attack / Release)
        // Attack rápido para transitorios y golpes; Release suave para recuperar posición
        this.smoothing = {
            attack: options.attack || 0.45,
            decay: options.decay || 0.12
        };

        // Valores interpolados y suavizados actuales
        this.current = {
            volume: 0,
            bass: 0,
            mid: 0,
            treble: 0,
            rawVolume: 0,
            rawBass: 0,
            rawMid: 0,
            rawTreble: 0,
            time: 0,
            isPlaying: false
        };

        this.init();
    }

    /**
     * Inicializa la carga del JSON preprocesado
     */
    AudioManager.prototype.init = function () {
        var self = this;
        fetch(this.jsonSrc)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ' al cargar ' + self.jsonSrc);
                }
                return response.json();
            })
            .then(function (jsonData) {
                self.data = jsonData;
                self.isLoaded = true;
                console.log('[AudioManager] Datos de audio cargados:', jsonData.length, 'muestras.');
            })
            .catch(function (err) {
                console.warn('[AudioManager] No se pudo cargar ' + self.jsonSrc + ' (usando fallback en tiempo real):', err.message);
                // Si fetch falla (por ejemplo, abierto mediante file:// sin servidor local),
                // el sistema operará con fallback sinusoidal/BPM sin romper la página.
            });
    };

    /**
     * Búsqueda optimizada del índice para un tiempo dado (O(1) o binary search)
     */
    AudioManager.prototype.findIndexForTime = function (time) {
        var len = this.data.length;
        if (len === 0) return -1;
        if (time <= this.data[0].time) return 0;
        if (time >= this.data[len - 1].time) return len - 2;

        // Estimación O(1) basada en que el espaciado temporal es prácticamente constante (ej. 0.05s)
        var totalDuration = this.data[len - 1].time;
        var estimatedIdx = Math.floor((time / totalDuration) * (len - 1));
        var start = Math.max(0, Math.min(len - 2, estimatedIdx - 4));
        var end = Math.min(len - 2, estimatedIdx + 4);

        for (var i = start; i <= end; i++) {
            if (this.data[i].time <= time && time <= this.data[i + 1].time) {
                this.lastFoundIndex = i;
                return i;
            }
        }

        // Búsqueda binaria de seguridad
        var low = 0;
        var high = len - 2;
        while (low <= high) {
            var mid = (low + high) >> 1;
            if (this.data[mid].time <= time && time < this.data[mid + 1].time) {
                this.lastFoundIndex = mid;
                return mid;
            }
            if (this.data[mid].time < time) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return Math.max(0, Math.min(len - 2, low));
    };

    /**
     * Interpolación lineal (lerp)
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Actualiza y retorna los datos de audio interpolados para el fotograma actual
     * Llamar dentro de requestAnimationFrame()
     */
    AudioManager.prototype.update = function () {
        var audio = this.audio;
        var isPlaying = !audio.paused && !audio.ended && audio.currentTime > 0;
        this.current.isPlaying = isPlaying;

        if (!isPlaying || !audio || !isFinite(audio.currentTime)) {
            // Decaimiento natural hacia 0 cuando la música está pausada o detenida
            this.current.volume += (0 - this.current.volume) * 0.1;
            this.current.bass += (0 - this.current.bass) * 0.1;
            this.current.mid += (0 - this.current.mid) * 0.1;
            this.current.treble += (0 - this.current.treble) * 0.1;
            this.current.rawVolume = 0;
            this.current.rawBass = 0;
            this.current.rawMid = 0;
            this.current.rawTreble = 0;
            return this.current;
        }

        var currentTime = audio.currentTime;
        this.current.time = currentTime;

        var rawVol = 0, rawBass = 0, rawMid = 0, rawTreble = 0;

        if (this.isLoaded && this.data.length > 1) {
            var idx = this.findIndexForTime(currentTime);
            if (idx >= 0 && idx < this.data.length - 1) {
                var p0 = this.data[idx];
                var p1 = this.data[idx + 1];

                var dt = p1.time - p0.time;
                var alpha = dt > 0.0001 ? (currentTime - p0.time) / dt : 0;
                alpha = Math.max(0, Math.min(1, alpha));

                // Interpolación lineal entre muestras
                rawVol = lerp(p0.volume, p1.volume, alpha);
                rawBass = lerp(p0.bass, p1.bass, alpha);
                rawMid = lerp(p0.mid, p1.mid, alpha);
                rawTreble = lerp(p0.treble, p1.treble, alpha);
            }
        } else {
            // Fallback elegante si aún no carga el JSON (basado en tempo ~96 BPM)
            var beatDuration = 60 / 96;
            var phase = (currentTime % beatDuration) / beatDuration;
            var kick = Math.pow(Math.max(0, 1 - phase * 2.2), 2.0);
            rawVol = 0.35 + kick * 0.45;
            rawBass = kick * 0.85;
            rawMid = 0.25 + Math.sin(currentTime * 3.5) * 0.15;
            rawTreble = 0.20 + Math.sin(currentTime * 6.0) * 0.12;
        }

        this.current.rawVolume = rawVol;
        this.current.rawBass = rawBass;
        this.current.rawMid = rawMid;
        this.current.rawTreble = rawTreble;

        // Suavizado asimétrico (Attack rápido ante transitorios, Release suave y elástico)
        var smooth = this.smoothing;

        function applyAttackDecay(curr, target) {
            var factor = target > curr ? smooth.attack : smooth.decay;
            return curr + (target - curr) * factor;
        }

        this.current.volume = applyAttackDecay(this.current.volume, rawVol);
        this.current.bass = applyAttackDecay(this.current.bass, rawBass);
        this.current.mid = applyAttackDecay(this.current.mid, rawMid);
        this.current.treble = applyAttackDecay(this.current.treble, rawTreble);

        return this.current;
    };

    // Exportar al ámbito global
    window.AudioManager = AudioManager;

})(window);
