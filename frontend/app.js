document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('record-btn');
    const statusDiv = document.getElementById('status');
    const chatContainer = document.getElementById('chat-container');

    const API_ENDPOINT = 'http://localhost:8000/process_audio';

    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimeout;

    recordBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = sendAudioToServer;

            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('recording');
            statusDiv.textContent = 'Recording... (5s max)';
            
            // Auto-stop after 5 seconds
            recordingTimeout = setTimeout(stopRecording, 5000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            statusDiv.textContent = 'Error: Could not access microphone.';
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearTimeout(recordingTimeout); // Clear the auto-stop timeout
            isRecording = false;
            recordBtn.classList.remove('recording');
            statusDiv.textContent = 'Processing...';
            recordBtn.disabled = true; // Disable button while processing
        }
    };

    const sendAudioToServer = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = []; // Reset chunks

        const formData = new FormData();
        formData.append('audio_file', audioBlob, 'user_audio.webm');

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            processResponse(data);

        } catch (error) {
            console.error('Error sending audio to server:', error);
            statusDiv.textContent = 'Error processing audio. Please try again.';
            addMessage('ai', 'Sorry, I ran into an error. Could you please try again?');
        } finally {
            recordBtn.disabled = false; // Re-enable button
            statusDiv.textContent = 'Click the mic to start speaking (5s)';
        }
    };
    
    const processResponse = (data) => {
        // Add user's transcribed message and correction
        addMessage('user', data.user_text, data.correction);

        // Add AI's reply
        addMessage('ai', data.ai_text);

        // Play AI's audio reply if available
        if (data.audio_base64) {
            const audioBlob = base64ToBlob(data.audio_base64, 'audio/mp3');
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
        }
    };

    const addMessage = (sender, text, correction = '') => {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${sender}-wrapper`;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.textContent = text;
        
        chatContainer.appendChild(messageDiv);

        // Add correction text if it exists
        if (correction) {
            const correctionDiv = document.createElement('div');
            correctionDiv.className = 'correction-text';
            correctionDiv.textContent = correction;
            chatContainer.appendChild(correctionDiv);
        }

        // Scroll to the bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };
    
    // Helper function to convert base64 string to a Blob
    const base64ToBlob = (base64, contentType) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    };

    // Initial welcome message
    addMessage('ai', 'Hello! I\'m your TalkMate. Click the microphone button and say something to get started!');
}); 