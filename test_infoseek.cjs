const axios = require('axios');
require('dotenv').config();

function generateCpf() {
  const n = (count) => Array.from({length: count}, () => Math.floor(Math.random() * 9)).join('');
  const calcDigit = (cpf) => {
    let sum = 0;
    for (let i = 0; i < cpf.length; i++) sum += parseInt(cpf[i]) * ((cpf.length + 1) - i);
    let rem = (sum * 10) % 11;
    if (rem === 10) rem = 0;
    return rem;
  };
  let base = n(9);
  base += calcDigit(base);
  base += calcDigit(base);
  return base;
}

async function testApi() {
  const apiKey = process.env.INFOSEEK_API_KEY || "sk_prod_eb4a54b45ccda5c36979cefda9f051cba9adaf158db3bab226647fa56ae42d22";
  const endpoint = "https://api.infoseekdata.com.br/api/validate/cpf";
  const testCpf = generateCpf();
  console.log("Testing with CPF:", testCpf);
  try {
    const response = await axios.post(
      endpoint,
      { value: testCpf },
      {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    console.log("Success:", JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.log("Error:", err.response ? err.response.data : err.message);
  }
}
testApi();
