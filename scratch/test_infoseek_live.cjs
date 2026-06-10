const axios = require('axios');
const API_KEY = "sk_prod_eb4a54b45ccda5c36979cefda9f051cba9adaf158db3bab226647fa56ae42d22";

function generateCpf() {
  const randomDigit = () => Math.floor(Math.random() * 9);
  const n = Array.from({length: 9}, randomDigit);
  let d1 = n.reduce((total, digit, i) => total + (digit * (10 - i)), 0);
  d1 = 11 - (d1 % 11);
  if (d1 >= 10) d1 = 0;
  let d2 = n.reduce((total, digit, i) => total + (digit * (11 - i)), 0) + (d1 * 2);
  d2 = 11 - (d2 % 11);
  if (d2 >= 10) d2 = 0;
  return n.join('') + d1 + d2;
}

const doc = generateCpf();
console.log("Testing CPF:", doc);

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
