const axios = require('axios');
const API_KEY = "sk_prod_eb4a54b45ccda5c36979cefda9f051cba9adaf158db3bab226647fa56ae42d22";

function generateCnpj() {
  const randomDigit = () => Math.floor(Math.random() * 9);
  const n = Array.from({length: 8}, randomDigit).concat([0, 0, 0, 1]);
  let d1 = n[0]*5 + n[1]*4 + n[2]*3 + n[3]*2 + n[4]*9 + n[5]*8 + n[6]*7 + n[7]*6 + n[8]*5 + n[9]*4 + n[10]*3 + n[11]*2;
  d1 = 11 - (d1 % 11);
  if (d1 >= 10) d1 = 0;
  let d2 = n[0]*6 + n[1]*5 + n[2]*4 + n[3]*3 + n[4]*2 + n[5]*9 + n[6]*8 + n[7]*7 + n[8]*6 + n[9]*5 + n[10]*4 + n[11]*3 + d1*2;
  d2 = 11 - (d2 % 11);
  if (d2 >= 10) d2 = 0;
  return n.join('') + d1 + d2;
}

const doc = generateCnpj();
console.log("Testing CNPJ:", doc);

async function test() {
  try {
    const res = await axios.post("https://api.infoseekdata.com.br/api/validate/cnpj", 
      { value: doc },
      { headers: { "X-API-Key": API_KEY, "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` } }
    );
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.log(e.response ? e.response.data : e.message);
  }
}
test();
