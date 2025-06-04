// index.js (funciones Firebase)
/* eslint-disable */

const formidable = require("formidable");
const fs = require("fs");
const axios = require("axios");
const tmp = require("tmp");
const { OpenAI } = require("openai");
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const cors = require("cors")({ origin: true });

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
let openaiClientInstance;
function getOpenAIClient() {
  if (!openaiClientInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error("OpenAI API key not configured or not accessible.");
      throw new Error("OpenAI API key is missing.");
    }
    openaiClientInstance = new OpenAI({ apiKey });
  }
  return openaiClientInstance;
}

const extractSchema = {
  type: "object",
  properties: {
    sintomas: { type: "array", items: { type: "string" } },
    paciente: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        edad: { type: "integer" },
        identificacion: { type: "string" },
      },
      required: ["nombre", "edad", "identificacion"],
    },
    motivo_consulta: { type: "string" },
  },
  required: ["sintomas", "paciente", "motivo_consulta"],
};

const diagSchema = {
  type: "object",
  properties: {
    diagnostico: { type: "string" },
    tratamiento: { type: "string" },
    recomendaciones: { type: "string" },
  },
  required: ["diagnostico", "tratamiento", "recomendaciones"],
};

////////////////////////////////////////////////////////////////////////////////
// Función #1: Transcribir Audio (soporta URL y Base64)
////////////////////////////////////////////////////////////////////////////////

exports.transcribeAudio = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 300,
  },
  async (req, res) => {
    return cors(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ error: "Solo se permite el método POST." });
        }

        // Si viene base64 en JSON: { audioBase64: "..." }
        if (req.body.audioBase64) {
          const b64 = req.body.audioBase64;
          // Decodificar base64 a bytes y guardar temp .wav
          const buffer = Buffer.from(b64, "base64");
          const tempFile = tmp.fileSync({ postfix: ".wav" });
          fs.writeFileSync(tempFile.name, buffer);

          const currentOpenAI = getOpenAIClient();
          try {
            const whisperResponse = await currentOpenAI.audio.transcriptions.create({
              file: fs.createReadStream(tempFile.name),
              model: "whisper-1",
              response_format: "text",
            });
            tempFile.removeCallback();
            return res.status(200).json({ transcription: whisperResponse });
          } catch (whisperErr) {
            logger.error("Error al transcribir base64 con Whisper:", whisperErr);
            tempFile.removeCallback();
            return res.status(500).json({ error: "Falla al transcribir audio." });
          }
        }

        // Si viene JSON con { audioUrl }
        const { audioUrl } = req.body;
        if (!audioUrl || typeof audioUrl !== "string") {
          return res.status(400).json({ error: "Campo 'audioUrl' inválido o faltante." });
        }

        // Descargar audio a temp
        const tempFile = tmp.fileSync({ postfix: ".wav" });
        const writer = fs.createWriteStream(tempFile.name);
        let downloadResponse;
        try {
          downloadResponse = await axios({
            method: "get",
            url: audioUrl,
            responseType: "stream",
          });
        } catch (downloadErr) {
          logger.error("Error al descargar audio (URL):", downloadErr);
          tempFile.removeCallback();
          return res
            .status(400)
            .json({ error: "No se pudo descargar el audio desde la URL proporcionada." });
        }

        await new Promise((resolve, reject) => {
          downloadResponse.data.pipe(writer);
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        const currentOpenAI = getOpenAIClient();
        try {
          const whisperResponse = await currentOpenAI.audio.transcriptions.create({
            file: fs.createReadStream(tempFile.name),
            model: "whisper-1",
            response_format: "text",
          });
          tempFile.removeCallback();
          return res.status(200).json({ transcription: whisperResponse });
        } catch (whisperErr) {
          logger.error("Error al transcribir con Whisper (URL):", whisperErr);
          tempFile.removeCallback();
          return res.status(500).json({ error: "Falla al transcribir audio." });
        }
      } catch (error) {
        logger.error("Error en transcripción:", error);
        return res.status(500).json({ error: "Falla al transcribir audio." });
      }
    });
  }
);

////////////////////////////////////////////////////////////////////////////////
// Función #2: Extraer Información Médica
////////////////////////////////////////////////////////////////////////////////

exports.extractMedicalInfo = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 300,
  },
  async (req, res) => {
    return cors(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ error: "Solo POST permitido." });
        }
        const { text } = req.body;
        if (!text || typeof text !== "string") {
          return res.status(400).json({ error: "Campo 'text' inválido." });
        }

        const prompt = `
Eres un asistente que extrae información médica siguiendo este esquema JSON:
${JSON.stringify(extractSchema, null, 2)}
Devuelve únicamente el JSON. No incluyas explicaciones, títulos ni formato Markdown.

Toma este input de texto y devuelve únicamente el JSON con:
- "sintomas": array de strings
- "paciente": objeto con { nombre, edad, identificacion }
- "motivo_consulta": string breve

Texto de entrada:
"${text}"
        `;

        const currentOpenAI = getOpenAIClient();
        const response = await currentOpenAI.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "Eres un extractor de info médica. Devuelve SOLO JSON válido, sin explicaciones ni etiquetas.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0,
        });

        const rawContent = response.choices[0].message.content;
        const cleanedContent = rawContent
          .trim()
          .replace(/^```json\n|```$/g, "")
          .replace(/^json\n/, "");

        let parsed;
        try {
          parsed = JSON.parse(cleanedContent);
        } catch (jsonErr) {
          logger.error("No se pudo parsear JSON en extractMedicalInfo:", rawContent);
          return res.status(500).json({
            error: "Respuesta no es JSON válido.",
            detalle: rawContent,
          });
        }

        return res.status(200).json(parsed);
      } catch (error) {
        logger.error("Error en extracción médica:", error);
        return res.status(500).json({ error: "Falla al extraer info médica." });
      }
    });
  }
);

////////////////////////////////////////////////////////////////////////////////
// Función #3: Generar Diagnóstico
////////////////////////////////////////////////////////////////////////////////

exports.generateDiagnosis = onRequest(
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 300,
  },
  async (req, res) => {
    return cors(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ error: "Solo POST permitido." });
        }
        const { sintomas, paciente, motivo_consulta } = req.body;
        if (
          !Array.isArray(sintomas) ||
          typeof paciente !== "object" ||
          typeof motivo_consulta !== "string"
        ) {
          return res.status(400).json({ error: "Datos estructurados inválidos." });
        }

        const medicalData = { sintomas, paciente, motivo_consulta };
        const prompt = `
Eres un chatbot médico que recibe datos estructurados así:
${JSON.stringify(medicalData, null, 2)}

Usa este esquema JSON para tu respuesta:
${JSON.stringify(diagSchema, null, 2)}

Genera:
- "diagnostico"
- "tratamiento"
- "recomendaciones"

Devuelve SOLO el JSON, sin explicaciones ni etiquetas.
        `;

        const currentOpenAI = getOpenAIClient();
        const response = await currentOpenAI.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "Eres un doctor virtual. Devuelve únicamente JSON válido.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0,
        });

        const rawContent = response.choices[0].message.content;
        logger.info("Respuesta cruda de diagnóstico:", rawContent);
        const cleanedContent = rawContent
          .trim()
          .replace(/^```json\n|```$/g, "")
          .replace(/^json\n/, "");

        let parsed;
        try {
          parsed = JSON.parse(cleanedContent);
        } catch (jsonErr) {
          logger.error("No se pudo parsear JSON en generateDiagnosis:", cleanedContent);
          return res.status(500).json({
            error: "Respuesta no es JSON válido (diagnóstico).",
            detalle: cleanedContent,
          });
        }

        return res.status(200).json(parsed);
      } catch (error) {
        logger.error("Error generando diagnóstico:", error);
        return res.status(500).json({ error: "Falla al generar diagnóstico." });
      }
    });
  }
);
