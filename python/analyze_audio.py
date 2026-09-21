#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audio Analysis & Feature Extraction Tool for Musical Flower Animations
----------------------------------------------------------------------
Analiza archivos de audio (MP3, WAV, etc.) mediante FFT para extraer:
- Tiempo (s)
- Volumen / RMS general
- Energía de bajos (20 Hz - 250 Hz)
- Energía de frecuencias medias (250 Hz - 4000 Hz)
- Energía de agudos (4000 Hz - 11000 Hz)

Genera un archivo JSON optimizado (audio_data.json) para sincronización web fluida.

Uso:
    python python/analyze_audio.py [archivo_audio] [archivo_json_salida] [--fps 20]

Ejemplo:
    python python/analyze_audio.py audio/musica.mp3 data/audio_data.json
"""

import os
import sys
import json
import argparse
import subprocess
import numpy as np


def load_audio_ffmpeg(file_path, sample_rate=22050):
    """
    Decodifica cualquier formato de audio (MP3, WAV, etc.) a PCM mono usando ffmpeg.
    Retorna un array numpy float32 normalizado entre -1.0 y 1.0.
    """
    cmd = [
        'ffmpeg',
        '-v', 'error',
        '-i', file_path,
        '-f', 's16le',
        '-ac', '1',
        '-ar', str(sample_rate),
        'pipe:1'
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        raw_audio = proc.stdout
        if len(raw_audio) == 0:
            raise RuntimeError("FFmpeg no devolvió datos de audio.")
        # Convertir PCM 16-bit a float32 entre -1.0 y 1.0
        audio_int16 = np.frombuffer(raw_audio, dtype=np.int16)
        audio_float = audio_int16.astype(np.float32) / 32768.0
        return audio_float, sample_rate
    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg no está instalado o no se encuentra en el PATH del sistema. "
            "Por favor, instala FFmpeg o añade su ejecutable al PATH."
        )
    except subprocess.CalledProcessError as e:
        stderr_msg = e.stderr.decode('utf-8', errors='ignore')
        raise RuntimeError(f"Error al decodificar audio con FFmpeg: {stderr_msg}")


def load_audio(file_path, sample_rate=22050):
    """
    Carga el audio probando primero con FFmpeg y luego con librerías alternativas si existen.
    """
    # Intentar con FFmpeg (más robusto para MP3 sin dependencias pesadas)
    try:
        return load_audio_ffmpeg(file_path, sample_rate)
    except Exception as e_ffmpeg:
        # Fallback a librosa si está instalado
        try:
            import librosa
            y, sr = librosa.load(file_path, sr=sample_rate, mono=True)
            return y, sr
        except ImportError:
            pass
        # Fallback a scipy si es WAV
        if file_path.lower().endswith('.wav'):
            try:
                from scipy.io import wavfile
                sr, data = wavfile.read(file_path)
                if data.ndim > 1:
                    data = data.mean(axis=1)
                if data.dtype == np.int16:
                    data = data.astype(np.float32) / 32768.0
                return data, sr
            except Exception:
                pass
        raise e_ffmpeg


def analyze_audio_features(audio, sr=22050, fps=20, n_fft=2048):
    """
    Ejecuta FFT por ventanas (STFT) y extrae métricas de volumen, bajos, medios y agudos.
    
    Parámetros:
        audio: Array float32 de audio mono
        sr: Frecuencia de muestreo (22050 Hz)
        fps: Muestras por segundo en el JSON (20 fps = cada 50ms)
        n_fft: Tamaño de la ventana FFT (2048 muestras ≈ 93ms)
    """
    hop_size = int(round(sr / fps))
    total_samples = len(audio)
    duration = total_samples / sr
    
    window = np.hanning(n_fft)
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    
    # Índices de corte para las bandas de frecuencia
    # Bajos: 20 Hz - 250 Hz (bombo, líneas de bajo)
    # Medios: 250 Hz - 4000 Hz (guitarras, voces, cuerpo acústico)
    # Agudos: 4000 Hz - 11000 Hz (charles, platillos, brillo, transitorios)
    idx_bass = np.where((freq_bins >= 20) & (freq_bins < 250))[0]
    idx_mid = np.where((freq_bins >= 250) & (freq_bins < 4000))[0]
    idx_treble = np.where((freq_bins >= 4000) & (freq_bins <= 11000))[0]
    
    # Pad inicial y final para centrar ventanas
    pad_width = n_fft // 2
    padded_audio = np.pad(audio, pad_width, mode='reflect')
    
    num_frames = int(np.ceil(total_samples / hop_size))
    
    times = []
    raw_volumes = []
    raw_basses = []
    raw_mids = []
    raw_trebles = []
    
    for i in range(num_frames):
        start = i * hop_size
        frame = padded_audio[start:start + n_fft]
        
        t = round(i / fps, 3)
        times.append(t)
        
        # 1. Volumen general: RMS de la señal en tiempo
        rms = np.sqrt(np.mean(frame ** 2) + 1e-12)
        raw_volumes.append(float(rms))
        
        # 2. Análisis espectral FFT
        spectrum = np.abs(np.fft.rfft(frame * window))
        power = spectrum ** 2
        
        # Energía por bandas (promedio cuadrático logarítmico para aproximar oído humano)
        bass_energy = np.mean(power[idx_bass]) if len(idx_bass) > 0 else 0.0
        mid_energy = np.mean(power[idx_mid]) if len(idx_mid) > 0 else 0.0
        treble_energy = np.mean(power[idx_treble]) if len(idx_treble) > 0 else 0.0
        
        # Compresión logarítmica para dinámica natural
        raw_basses.append(float(np.log1p(bass_energy * 1000.0)))
        raw_mids.append(float(np.log1p(mid_energy * 5000.0)))
        raw_trebles.append(float(np.log1p(treble_energy * 20000.0)))

    # Normalización robusta (percentil 2 a 98 para evitar outliers o silencios extremos)
    def normalize_feature(values):
        arr = np.array(values, dtype=np.float32)
        p_min = np.percentile(arr, 2.0)
        p_max = np.percentile(arr, 98.5)
        if p_max - p_min < 1e-6:
            return np.zeros_like(arr)
        norm = np.clip((arr - p_min) / (p_max - p_min), 0.0, 1.0)
        return norm

    norm_vol = normalize_feature(raw_volumes)
    norm_bass = normalize_feature(raw_basses)
    norm_mid = normalize_feature(raw_mids)
    norm_treble = normalize_feature(raw_trebles)
    
    # Suavizado previo (attack rápido para transitorios y decay suave)
    def smooth_attack_decay(signal, attack=0.45, decay=0.82):
        out = np.zeros_like(signal)
        prev = 0.0
        for idx, val in enumerate(signal):
            if val > prev:
                # Ataque en golpes fuertes
                curr = prev + (val - prev) * attack
            else:
                # Caída suave tras el golpe
                curr = prev * decay + val * (1.0 - decay)
            out[idx] = curr
            prev = curr
        return out

    smooth_vol = smooth_attack_decay(norm_vol, attack=0.55, decay=0.80)
    smooth_bass = smooth_attack_decay(norm_bass, attack=0.65, decay=0.75) # Reactivo a golpes de bombo
    smooth_mid = smooth_attack_decay(norm_mid, attack=0.45, decay=0.82)
    smooth_treble = smooth_attack_decay(norm_treble, attack=0.40, decay=0.85)
    
    # Construcción de la estructura de datos para JSON
    dataset = []
    for i in range(num_frames):
        dataset.append({
            "time": round(float(times[i]), 3),
            "volume": round(float(smooth_vol[i]), 3),
            "bass": round(float(smooth_bass[i]), 3),
            "mid": round(float(smooth_mid[i]), 3),
            "treble": round(float(smooth_treble[i]), 3)
        })
        
    return dataset, duration


def main():
    parser = argparse.ArgumentParser(
        description="Analiza un archivo de audio y genera un JSON con métricas normalizadas para animación web."
    )
    parser.add_argument(
        "audio_path",
        nargs="?",
        default=None,
        help="Ruta al archivo de audio MP3/WAV (por defecto busca audio/musica.mp3 o assets/music/El_Tesoro.mp3)"
    )
    parser.add_argument(
        "output_json",
        nargs="?",
        default=None,
        help="Ruta donde se guardará el JSON generado (por defecto data/audio_data.json)"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=20,
        help="Cuadros de análisis por segundo (por defecto 20 fps = 50ms por punto)"
    )

    args = parser.parse_args()

    # Detección inteligente del archivo de audio si no se especifica
    audio_path = args.audio_path
    if not audio_path:
        candidates = [
            os.path.join("audio", "musica.mp3"),
            "musica.mp3",
            os.path.join("assets", "music", "El_Tesoro.mp3"),
            os.path.join("assets", "music", "musica.mp3")
        ]
        for c in candidates:
            if os.path.exists(c):
                audio_path = c
                break

    if not audio_path or not os.path.exists(audio_path):
        print(f"❌ Error: No se encontró ningún archivo de audio válido.")
        print(f"   Por favor especifica la ruta: python analyze_audio.py [ruta_al_audio.mp3]")
        sys.exit(1)

    # Ruta de salida por defecto
    output_json = args.output_json
    if not output_json:
        output_json = os.path.join("data", "audio_data.json")

    # Asegurar que el directorio de salida exista
    out_dir = os.path.dirname(output_json)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    # Asegurar soporte de encoding en terminales Windows
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    print("==================================================")
    print("[Audio Processing] Analisis Espectral para Flores")
    print("==================================================")
    print(f"* Audio de entrada : {audio_path}")
    print(f"* Archivo de salida: {output_json}")
    print(f"* Tasa de muestreo : {args.fps} muestras/segundo (cada {int(1000/args.fps)}ms)")
    print("--------------------------------------------------")

    print("1/3 Decodificando archivo de audio...")
    audio_data, sr = load_audio(audio_path, sample_rate=22050)
    print(f"   [OK] Audio cargado: {len(audio_data)} muestras a {sr} Hz ({round(len(audio_data)/sr, 2)} seg)")

    print("2/3 Ejecutando FFT y extraccion de bandas (Bass/Mid/Treble/Volumen)...")
    dataset, duration = analyze_audio_features(audio_data, sr=sr, fps=args.fps)
    print(f"   [OK] {len(dataset)} puntos de analisis generados exitosamente.")

    print("3/3 Guardando JSON optimizado...")
    # Serializar con formato compacto para maximo rendimiento y minimo tamano
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(dataset, f, separators=(',', ':'))

    file_size_kb = os.path.getsize(output_json) / 1024.0
    print("--------------------------------------------------")
    print("[Exito] Analisis completado exitosamente.")
    print(f"   * Archivo generado : {output_json}")
    print(f"   * Duracion total   : {round(duration, 2)} segundos")
    print(f"   * Total de muestras: {len(dataset)}")
    print(f"   * Tamano del JSON  : {round(file_size_kb, 1)} KB")
    print("==================================================")


if __name__ == "__main__":
    main()
