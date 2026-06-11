import axios from "axios";

async function test() {
  try {
    const apiKey = "sk_8f07ee89c5e85ea793f060047ee295992a7407d2593f9bc3";
    const idVoz = "EXAVITQu4vr4xnSDxMaL";
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${idVoz}`,
      {
        text: "Teste de áudio",
        model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_128'
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );
    console.log("ElevenLabs TTS Status:", response.status);
    console.log("Audio size:", response.data.byteLength);
  } catch (err) {
    if (err.response?.data) {
        console.log("ElevenLabs Error:", Buffer.from(err.response.data).toString());
    } else {
        console.log("Error:", err.message);
    }
  }
}

test();
