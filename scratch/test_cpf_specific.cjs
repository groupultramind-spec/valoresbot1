const axios = require('axios');
const API_KEY = "sk_prod_eb4a54b45ccda5c36979cefda9f051cba9adaf158db3bab226647fa56ae42d22";
const doc = "39544196889"; 

async function test() {
  try {
    const res = await axios.post("https://api.infoseekdata.com.br/api/validate/cpf", 
      { value: doc },
      { headers: { "X-API-Key": API_KEY, "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` } }
    );
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log(e.response ? e.response.data : e.message);
  }
}
test();
