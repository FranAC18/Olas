import turtle
import json
import re
import unicodedata


LYRICS = [
    (0.00, "Ah, paso todo el día pensando en vos"),
    (0.04, "Ah, ¿qué hay de malo en todo esto?"),
    (0.08, "Ah, paso todo el día pensando en vos"),
    (0.12, "Ah, vos pensás que pierdo el tiempo"),
    (0.18, "Perdón si estoy de nuevo acá"),
    (0.23, "Pensé que habías preguntado por mí"),
    (0.28, "Me gusta estar de nuevo acá"),
    (0.33, "Aunque no hayas preguntado por mí"),
    (0.38, "Voy a quedarme un poco acá"),
    (0.43, "Cuidarte siempre a vos en la derrota"),
    (0.48, "Hasta el final, el final"),
    (0.56, "Ah, todo lo que hago es para vos"),
    (0.60, "Ah, el tesoro se está hundiendo"),
    (0.64, "Ah, todo lo que hago es para vos"),
    (0.68, "Ah, vos pensás que pierdo el tiempo"),
    (0.74, "Perdón si estoy de nuevo acá"),
    (0.78, "Pensé que habías preguntado por mí"),
    (0.82, "Me gusta estar de nuevo acá"),
    (0.85, "Aunque no hayas preguntado por mí"),
    (0.88, "Voy a quedarme un poco acá"),
    (0.91, "Cuidarte siempre a vos en la derrota"),
    (0.94, "Hasta el final, del final"),
    (0.97, "Es la depresión sin épica"),
    (0.99, "La depresión sin épica"),
]


def generate_lyrics_timeline(duration_seconds, output_file="js/lyrics-data.js"):
    """Genera marcas de tiempo proporcionales para sincronizar la letra en el navegador.

    Los porcentajes son una guía inicial: para una sincronización palabra por palabra
    se pueden ajustar sin cambiar la lógica de la página.
    """
    if duration_seconds <= 0:
        raise ValueError("La duración debe ser mayor que cero")

    starts = [duration_seconds * progress for progress, _ in LYRICS]
    timeline = []
    for index, (_, text) in enumerate(LYRICS):
        start = starts[index]
        next_start = starts[index + 1] if index + 1 < len(starts) else duration_seconds
        timeline.append({
            "start": round(start, 3),
            "end": round(max(start + 0.1, next_start), 3),
            "text": text,
        })

    javascript = "window.LYRICS_TIMELINE = " + json.dumps(
        timeline, ensure_ascii=False, indent=4
    ) + ";\n"
    with open(output_file, "w", encoding="utf-8") as output:
        output.write(javascript)
    return timeline


def detect_lyrics_timing(audio_file, expected_lyrics, output_file="js/lyrics-data.js", model_name="small"):
    """Transcribe una canción y alinea cada línea con la voz detectada.

    Requiere `pip install openai-whisper` y FFmpeg. Whisper devuelve marcas de
    palabra; la función busca cada línea en ese resultado y escribe un archivo
    JavaScript listo para que la vista revele la letra en tiempo real.
    """
    try:
        import whisper
    except ImportError as error:
        raise RuntimeError(
            "Instala el detector con: pip install openai-whisper"
        ) from error

    model = whisper.load_model(model_name)
    result = model.transcribe(audio_file, language="es", word_timestamps=True)
    detected_words = [
        word
        for segment in result["segments"]
        for word in segment.get("words", [])
    ]

    def normalize(value):
        value = unicodedata.normalize("NFD", value.lower())
        value = "".join(char for char in value if unicodedata.category(char) != "Mn")
        return re.findall(r"[a-z0-9]+", value)

    timeline = []
    search_from = 0
    for line in expected_lyrics:
        target = normalize(line)
        match_start = None
        for index in range(search_from, len(detected_words)):
            candidate = [
                normalize(word["word"])[0]
                for word in detected_words[index:index + len(target)]
                if normalize(word["word"])
            ]
            if candidate == target:
                match_start = index
                break

        if match_start is None:
            continue

        match_end = match_start + len(target) - 1
        timeline.append({
            "start": detected_words[match_start]["start"],
            "end": detected_words[match_end]["end"],
            "text": line,
            "words": [
                {
                    "start": detected_words[index]["start"],
                    "end": detected_words[index]["end"],
                    "text": detected_words[index]["word"].strip(),
                }
                for index in range(match_start, match_end + 1)
            ],
        })
        search_from = match_end + 1

    minimum_matches = max(1, int(len(expected_lyrics) * 0.6))
    if len(timeline) < minimum_matches:
        raise RuntimeError(
            f"Whisper solo alineó {len(timeline)} de {len(expected_lyrics)} líneas; "
            "no se reemplazó la sincronización existente"
        )

    with open(output_file, "w", encoding="utf-8") as output:
        output.write("window.LYRICS_TIMELINE = ")
        json.dump(timeline, output, ensure_ascii=False, indent=4)
        output.write(";\n")
    return timeline

def draw_from_json(json_file):
    # Configurar Turtle
    screen = turtle.Screen()
    screen.bgcolor("black")
    screen.setup(800, 800)
    t = turtle.Turtle()
    t.hideturtle()
    t.speed(0)
    screen.tracer(0)
    
    # Cargar regiones
    with open(json_file) as f:
        regions = json.load(f)
        
    # Calcular límites para centrar el dibujo 
    all_points = [(p[0], p[1]) for r in regions for p in r['contour']]
    min_x = min(p[0] for p in all_points)
    max_x = max(p[0] for p in all_points)
    min_y = min(p[1] for p in all_points)
    max_y = max(p[1] for p in all_points)
    
    # Calcular escala y centro
    width = max_x - min_x
    height = max_y - min_y
    scale = min(600 / width, 600 / height)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    
    # Dibujar cada región
    for region in regions:
        # Configurar color
        color = '#{:02x}{:02x}{:02x}'.format(
            int(region['color'][0]),
            int(region['color'][1]),
            int(region['color'][2])
        )
        t.color(color, color)
        
        # Dibujar contorno
        points = region['contour']
        t.begin_fill()
        t.penup()

        # Primer punto
        x = (points[0][0] - center_x) * scale
        y = (center_y - points[0][1]) * scale
        t.goto(x, y)
        t.pendown()

        # Resto de puntos
        for point in points[1:]:
            x = (point[0] - center_x) * scale
            y = (center_y - point[1]) * scale
            t.goto(x, y)

        # Cerrar forma
        t.goto((points[0][0] - center_x) * scale,
               (center_y - points[0][1]) * scale)
        t.end_fill()
        screen.update()

    screen.mainloop()

if __name__ == '__main__':
    draw_from_json('sunflowers.json')
