import axios from "axios";

async function test() {
  try {
    const apiKey = "sk_prod_eb4a54b45ccda5c36979cefda9f051cba9adaf158db3bab226647fa56ae42d22";
    const endpoint = "https://api.infoseekdata.com.br/api/validate/cpf";
    
    const cpf = "39544196889"; 

    const response = await axios.post(
      endpoint,
      { value: cpf },
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    console.log(JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.log("Error:", err.response?.data || err.message);
  }
}

test();
