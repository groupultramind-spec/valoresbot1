import axios from "axios";

const key = "bpx_8NHZUlae4L5ykZsdFGIXyFmryV6wpB0X2M0wWuN0";
const payload = {
  amount: 2.99,
  payer_document: "12345678900",
  payer_name: "Teste Lead",
  webhook_url: "https://consultavaloresdisponiveis.com.br/api/v1/buypix/webhook"
};

async function testBuyPix() {
  try {
    const response = await axios.post('https://buypix.me/api/v1/deposits', payload, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': "TEST12345"
      }
    });
    console.log("Success:", JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}

testBuyPix();
