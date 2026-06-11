import axios from "axios";

async function test() {
  try {
    const apiKey = "sk_8f07ee89c5e85ea793f060047ee295992a7407d2593f9bc3";
    const response = await axios.get("https://api.elevenlabs.io/v1/user", {
      headers: { 'xi-api-key': apiKey }
    });
    console.log("ElevenLabs Status:", response.status);
    console.log("Subscription:", response.data.subscription);
  } catch (err) {
    console.log("ElevenLabs Error:", err.response?.data || err.message);
  }
}

test();
