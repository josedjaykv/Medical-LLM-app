# Medical LLM App

## Descripción Técnica Breve

Este proyecto implementa una aplicación médica basada en modelos de lenguaje grandes (LLMs) para facilitar la transcripción de audio, la extracción de información médica estructurada y la generación de diagnósticos y tratamientos. La aplicación se compone de un frontend interactivo desarrollado con Streamlit (Python) y un backend de funciones serverless implementado con Firebase Cloud Functions (Node.js). Se integra con la API de OpenAI para las capacidades de Speech-to-Text (Whisper) y procesamiento de lenguaje natural (GPT-4o).

## Flujo de Funcionamiento de la Aplicación

El flujo de la aplicación está diseñado para ser intuitivo y procesar la información médica de manera secuencial:

1.  **Interacción con el Frontend:** El usuario interactúa con la interfaz de Streamlit, donde puede grabar audio directamente o proporcionar texto.
2.  **Transcripción de Audio (si aplica):**
    *   Si el usuario graba o sube un archivo de audio, el frontend envía este audio (o su URL si ya está alojado) a la función `transcribeAudio` del backend.
    *   La función `transcribeAudio` utiliza el modelo Whisper de OpenAI para convertir el audio en texto.
    *   El texto transcrito es devuelto al frontend.
3.  **Extracción de Información Médica:**
    *   El texto (ya sea transcrito del audio o ingresado directamente por el usuario) es enviado por el frontend a la función `extractMedicalInfo` del backend.
    *   `extractMedicalInfo` emplea el modelo GPT-4o de OpenAI para analizar el texto y extraer datos estructurados como síntomas, información del paciente (nombre, edad, identificación) y el motivo de la consulta, siguiendo un esquema JSON predefinido.
    *   La información médica estructurada es enviada de vuelta al frontend.
4.  **Generación de Diagnóstico:**
    *   La información médica estructurada recibida en el paso anterior es enviada por el frontend a la función `generateDiagnosis` del backend.
    *   `generateDiagnosis` utiliza GPT-4o para generar un diagnóstico, un plan de tratamiento y recomendaciones, también siguiendo un esquema JSON específico.
    *   El diagnóstico y las recomendaciones son presentados al usuario en el frontend.

## Decisiones de Diseño Relevantes

*   **Modelos de Lenguaje Grandes (LLMs) de OpenAI:** La integración con OpenAI (Whisper para Speech-to-Text y GPT-4o para procesamiento de texto) permite aprovechar capacidades de IA de vanguardia para la transcripción precisa y la comprensión contextual de la información médica. GPT-4o fue seleccionado por su capacidad para seguir instrucciones de formato JSON y su rendimiento en tareas de razonamiento.
*   **Gestión Segura de API Keys:** Para la seguridad de las credenciales de OpenAI, se utiliza el mecanismo de Firebase Secrets (`defineSecret`). Esto asegura que la API Key no se exponga en el código fuente ni en variables de entorno no seguras, sino que se inyecte de forma segura en el entorno de ejecución de las funciones.
*   **Frontend Interactivo con Streamlit:** Streamlit fue elegido por su capacidad para construir rápidamente aplicaciones web interactivas en Python con un código mínimo. Esto permite un desarrollo ágil de la interfaz de usuario para la interacción con el usuario y la visualización de los resultados.
*   **Funciones Modulares:** El backend se divide en tres funciones distintas (`transcribeAudio`, `extractMedicalInfo`, `generateDiagnosis`). Esta modularidad mejora la mantenibilidad del código, permite el escalado independiente de cada componente y facilita la depuración.
*   **Esquemas JSON para Interacción con LLMs:** La definición de esquemas JSON (`extractSchema`, `diagSchema`) para la entrada y salida de los modelos de lenguaje asegura que la información se extraiga y se genere en un formato estructurado y predecible, lo cual es crucial para la integración con el frontend y la fiabilidad de los datos.
*   **Manejo de CORS:** Se implementó `cors` en todas las funciones HTTP para permitir solicitudes de origen cruzado de forma segura, asegurando que el frontend pueda comunicarse con el backend sin problemas de seguridad.
*   **Versión de Node.js:** Se especificó Node.js 22 en `package.json` para las funciones de segunda generación, garantizando la compatibilidad con las últimas características y optimizaciones del runtime de Cloud Run.

## Variables de Entorno

Para el correcto funcionamiento de la aplicación, es necesario configurar la siguiente variable de entorno:

*   **`OPENAI_API_KEY`**: Esta es la clave de API necesaria para autenticarse con los servicios de OpenAI (Whisper y GPT-4o). Debe configurarse como un secreto de Firebase para las funciones del backend.

## Cómo Levantar la Aplicación (Local y Despliegue)

### Prerrequisitos

Asegurarse de tener instalados los siguientes componentes en tu sistema:

*   **Node.js y npm:** Necesarios para las funciones de Firebase.
*   **Python y pip:** Necesarios para la aplicación Streamlit.
*   **Firebase CLI:** La interfaz de línea de comandos de Firebase. Si no la tienes, instálala globalmente:bash
    npm install -g firebase-tools
    ```
    Asegúrate de que tu Firebase CLI sea la versión `11.18.0` o superior para compatibilidad con Node.js 22.[1]

### Configuración de APIs (OpenAI)

La clave de API de OpenAI se gestiona como un secreto de Firebase para el backend.

1.  **Configurar el Secreto de OpenAI:**
    Navega a la raíz de tu proyecto (donde se encuentra la carpeta `functions`). Ejecuta el siguiente comando en tu terminal y sigue las instrucciones para introducir tu clave de API de OpenAI:
    ```bash
    firebase functions:secrets:set OPENAI_API_KEY
    ```
    Esto almacena tu clave de forma segura en Google Cloud Secret Manager.[2]

### Ejecución Local del Backend (Firebase Cloud Functions)

Para ejecutar las funciones de Firebase localmente utilizando el emulador:

1.  **Navega al directorio de funciones:**
    ```bash
    cd functions
    ```
2.  **Instala las dependencias de Node.js:**
    ```bash
    npm install
    ```
3.  **Asegúrate de que `package.json` usa Node.js 22:**
    Abre `functions/package.json` y verifica que la sección `"engines"` esté configurada así:
    ```json
    "engines": {
      "node": "22"
    }
    ```
4.  **Inicia el emulador de Firebase:**
    ```bash
    firebase emulators:start --only functions
    ```
    Esto iniciará un servidor local que emulará tus funciones de Cloud Functions. Las URLs de las funciones emuladas se mostrarán en la salida de la terminal.

### Ejecución Local del Frontend (Streamlit)

Para ejecutar la aplicación Streamlit localmente:

1.  **Navega al directorio del frontend:**
    Asume que tu archivo principal de Streamlit se llama `app.py` y está en la raíz de tu proyecto o en una carpeta específica del frontend (ajusta la ruta si es diferente).
    ```bash
    cd <ruta_a_tu_frontend> # Por ejemplo, cd../frontend si estás en la carpeta functions
    ```
2.  **Crea un entorno virtual (recomendado):**
    ```bash
    python -m venv.venv
    ```
3.  **Activa el entorno virtual:**
    *   **Windows:**
        ```bash
       .venv\Scripts\activate
        ```
    *   **macOS/Linux:**
        ```bash
        source.venv/bin/activate
        ```
4.  **Instala las dependencias de Python:**
    Asegúrate de tener un archivo `requirements.txt` en el directorio de tu frontend con las dependencias necesarias (como `streamlit`, `requests`, `reportlab`, `streamlit-audiorecorder` [3]).
    ```bash
    pip install -r requirements.txt
    ```
5.  **Ejecuta la aplicación Streamlit:**
    ```bash
    streamlit run app.py # Reemplaza 'app.py' con el nombre de tu archivo principal de Streamlit
    ```
    Streamlit abrirá automáticamente la aplicación en tu navegador web predeterminado (generalmente en `http://localhost:8501` [4, 5]).

### Despliegue de las Funciones (Opcional, a la Nube)

Si deseas desplegar tus funciones a Firebase Cloud Functions en la nube:

1.  **Asegúrate de haber configurado el secreto `OPENAI_API_KEY`** como se describe en la sección "Configuración de APIs".
2.  **Navega al directorio `functions`:**
    ```bash
    cd functions
    ```
3.  **Despliega las funciones:**
    ```bash
    firebase deploy --only functions
    ```
    Esto subirá tu código a Google Cloud y desplegará las funciones. El proceso puede tomar unos minutos.

---
