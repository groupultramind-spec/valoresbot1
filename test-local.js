import axios from "axios";

async function testAll() {
  try {
    const docRes = await axios.post("http://localhost:80/api/v1/validate/document", {
      docType: "CPF",
      docValue: "39544196889"
    });
    console.log("Validate Doc Result:", docRes.data);
    
    if (docRes.data.success && docRes.data.name) {
       const ttsRes = await axios.post("http://localhost:80/api/v1/tts", {
         name: docRes.data.name,
         attendantName: "Sofia",
         voiceId: "EXAVITQu4vr4xnSDxMaL",
         value: "R$ 100,00",
         docType: "CPF"
       });
       console.log("TTS Result Success:", !!ttsRes.data.audioBase64);
    }
  } catch(e) {
    console.error("Test Error:", e.response?.data || e.message);
  }
}

testAll();
