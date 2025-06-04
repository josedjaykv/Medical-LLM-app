# streamlit_app.py

import streamlit as st
import requests
import json
import base64
import tempfile
from datetime import datetime
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

# ------------------ CONFIG ------------------
TRANSCRIBE_URL = "https://transcribeaudio-c5n2v3ikiq-uc.a.run.app"
EXTRACT_URL    = "https://extractmedicalinfo-c5n2v3ikiq-uc.a.run.app"
DIAG_URL       = "https://generatediagnosis-c5n2v3ikiq-uc.a.run.app"

st.set_page_config(page_title="App Médica LLM", layout="centered")
st.title("📋 Procesamiento Médico con LLMs")
st.markdown(
    "Sube un link de audio, graba directamente o ingresa texto libre para extraer datos médicos y generar diagnóstico."
)

# ------------------ SESSION STATE ------------------
if "history" not in st.session_state:
    st.session_state.history = []

# ------------------ FUNCIONES AUXILIARES ------------------
def generar_reporte_pdf(input_text, extracted_data, diagnosis):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    x = 50
    y = height - 50

    def draw_text(label, content):
        nonlocal y
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x, y, label)
        y -= 15
        c.setFont("Helvetica", 10)
        for line in content.split("\n"):
            if y < 80:
                c.showPage()
                y = height - 50
            c.drawString(x + 10, y, line[:1000])
            y -= 13
        y -= 10

    c.setFont("Helvetica-Bold", 14)
    c.drawString(x, y, "🩺 Reporte Médico Automatizado")
    y -= 25

    draw_text("📝 Texto Procesado:", input_text)
    draw_text(
        "📁 Información Médica Extraída:",
        json.dumps(extracted_data, indent=2, ensure_ascii=False),
    )
    draw_text("👨‍⚕️ Diagnóstico:", json.dumps(diagnosis, indent=2, ensure_ascii=False))

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


def show_diagnosis_pipeline(input_text):
    st.write("### 🧠 Texto recibido:")
    st.write(input_text)

    with st.spinner("🩺 Extrayendo información médica..."):
        try:
            ext_res = requests.post(EXTRACT_URL, json={"text": input_text})
            ext_res.raise_for_status()
            ext_data = ext_res.json()
        except Exception as e:
            st.error(f"❌ Error en extracción médica: {e}")
            return

    if not ext_data:
        st.warning("⚠️ No se obtuvo información médica.")
        return

    st.subheader("📁 Datos extraídos:")
    st.json(ext_data)

    with st.spinner("🧠 Generando diagnóstico..."):
        try:
            diag_res = requests.post(DIAG_URL, json=ext_data)
            diag_res.raise_for_status()
            diag_data = diag_res.json()
        except Exception as e:
            st.error(f"❌ Error generando diagnóstico: {e}")
            return

    if diag_data:
        st.subheader("👨‍⚕️ Diagnóstico Resultado:")
        st.json(diag_data)

        st.session_state.history.append(
            {
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "input_text": input_text,
                "extracted_data": ext_data,
                "diagnosis": diag_data,
            }
        )

        st.download_button(
            label="📥 Descargar Diagnóstico JSON",
            data=json.dumps(diag_data, indent=2, ensure_ascii=False),
            file_name="diagnostico.json",
            mime="application/json",
        )

        pdf_file = generar_reporte_pdf(input_text, ext_data, diag_data)
        st.download_button(
            label="🧾 Descargar Reporte PDF",
            data=pdf_file,
            file_name="reporte_medico.pdf",
            mime="application/pdf",
        )
    else:
        st.warning("⚠️ No se recibió un diagnóstico válido.")


# ------------------ OPCIÓN DE ENTRADA ------------------
source = st.radio(
    "¿Cómo quieres enviar la info?",
    ("Audio (link)", "Grabar Audio", "Texto Libre"),
)

# ------------------ AUDIO: ENLACE ------------------
if source == "Audio (link)":
    audio_url = st.text_input("🎵 Pega aquí el link del audio (mp3, wav, etc.)")
    if st.button("Procesar Audio"):
        if not audio_url.strip():
            st.error("❌ Debes ingresar un link de audio válido.")
        else:
            with st.spinner("🔊 Transcribiendo audio..."):
                try:
                    trans_res = requests.post(TRANSCRIBE_URL, json={"audioUrl": audio_url})
                    trans_res.raise_for_status()
                    trans_data = trans_res.json()
                    texto_transcrito = trans_data.get("transcription", "").strip()
                except Exception as e:
                    st.error(f"❌ Error al transcribir audio: {e}")
                    texto_transcrito = None

            if texto_transcrito:
                st.success("✅ Transcripción completada.")
                show_diagnosis_pipeline(texto_transcrito)
            else:
                st.warning("⚠️ No se pudo obtener texto transcrito.")

# ------------------ AUDIO: GRABAR DIRECTAMENTE ------------------
elif source == "Grabar Audio":
    st.write("🎙️ Haz clic en el botón y graba tu mensaje de voz.")
    audio_value = st.audio_input("Grabar Audio")  # Devuelve UploadedFile

    if audio_value is not None:
        st.success("🎉 Grabación completada.")
        # Leemos bytes del UploadedFile
        wav_bytes = audio_value.read()
        # Codificamos a base64
        b64 = base64.b64encode(wav_bytes).decode("utf-8")

        with st.spinner("🔊 Enviando grabación base64 para transcripción..."):
            try:
                payload = {"audioBase64": b64}
                trans_res = requests.post(TRANSCRIBE_URL, json=payload)
                trans_res.raise_for_status()
                trans_data = trans_res.json()
                texto_transcrito = trans_data.get("transcription", "").strip()
            except Exception as e:
                st.error(f"❌ Error al transcribir grabación: {e}")
                texto_transcrito = None

        if texto_transcrito:
            st.success("✅ Transcripción completada.")
            show_diagnosis_pipeline(texto_transcrito)
        else:
            st.warning("⚠️ No se pudo obtener texto transcrito de la grabación.")

# ------------------ TEXTO LIBRE ------------------
elif source == "Texto Libre":
    user_text = st.text_area("✍️ Ingresa aquí tu texto médico o consulta:")
    if st.button("Procesar Texto"):
        if not user_text.strip():
            st.error("❌ Debes escribir algo de texto.")
        else:
            show_diagnosis_pipeline(user_text.strip())

# ------------------ HISTORIAL ------------------
if st.session_state.history:
    st.write("---")
    st.write("## 📚 Historial de esta sesión")

    for i, entry in enumerate(reversed(st.session_state.history), start=1):
        with st.expander(f"📝 Consulta #{i} - {entry['timestamp']}"):
            st.markdown("**Texto ingresado:**")
            st.code(entry["input_text"], language="markdown")

            st.markdown("**🧬 Datos extraídos:**")
            st.json(entry["extracted_data"])

            st.markdown("**👨‍⚕️ Diagnóstico:**")
            st.json(entry["diagnosis"])
