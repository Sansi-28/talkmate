import os
import base64
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
import json

# Load environment variables from .env file
load_dotenv()

# Initialize OpenAI client
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY not found in .env file")
client = OpenAI(api_key=api_key)

# Initialize FastAPI app
app = FastAPI()

# Configure CORS (Cross-Origin Resource Sharing)
origins = [
    "http://localhost",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://talkmate-frontend.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# System prompt for the AI model
SYSTEM_PROMPT = """
You are a friendly and encouraging language tutor. Your goal is to have a natural, supportive conversation.
The user will provide a text transcription of their spoken words.
You must respond in two parts, formatted as a single JSON object:
1.  "reply": A conversational, friendly reply to the user's message. Keep it concise.
2.  "correction": A quick, simple grammar or phrasing correction of the user's original text. If there are no errors, return an empty string "".

Example:
User says: "I goed to the store yesterday."
Your JSON output:
{
  "reply": "That sounds nice! What did you get from the store?",
  "correction": "A small tip: it's better to say 'I went to the store yesterday.'"
}
"""

@app.post("/process_audio")
async def process_audio(audio_file: UploadFile = File(...)):
    try:
        # 1. STT: Transcribe audio using Whisper
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio_file:
            contents = await audio_file.read()
            temp_audio_file.write(contents)
            temp_audio_file.flush()
            
            # Re-open the file for reading and send to Whisper
            with open(temp_audio_file.name, "rb") as f:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f
                )
        user_text = transcription.text
        os.remove(temp_audio_file.name) # Clean up the temp file

        if not user_text.strip():
             return {"user_text": "(No speech detected)", "ai_text": "I couldn't hear anything, could you try again?", "correction": "", "audio_base64": ""}

        # 2. Chat: Get AI reply and correction from GPT-4
        response = client.chat.completions.create(
            model="gpt-3.5-turbo-1106", # <---- THIS IS THE CHANGED LINE
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_text}
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        
        ai_response_content = response.choices[0].message.content
        ai_data = json.loads(ai_response_content)
        ai_text = ai_data.get("reply", "I'm not sure how to respond to that.")
        correction = ai_data.get("correction", "")

        # 3. TTS: Convert the AI's reply to audio
        speech_response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=ai_text,
            response_format="mp3"
        )
        
        # Encode audio to Base64 to send it in the JSON response
        audio_bytes = speech_response.read()
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

        return {
            "user_text": user_text,
            "ai_text": ai_text,
            "correction": correction,
            "audio_base64": audio_base64
        }

    except Exception as e:
        print(f"An error occurred in process_audio: {e}") # Add this line
        print(f"Error type: {type(e)}") # Optional: also print the type of error
        import traceback
        traceback.print_exc() # Optional: prints the full traceback to logs
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "TalkMate backend is running."} 
