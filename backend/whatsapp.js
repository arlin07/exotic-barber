const axios = require('axios');
require('dotenv').config();

async function enviarWhatsApp(numero, mensaje) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
    console.log('⚠️ WhatsApp no configurado aún. Mensaje simulado a', numero, ':', mensaje);
    return;
  }
  try {
    const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp",
      to: numero,
      type: "text",
      text: { body: mensaje }
    }, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
    });
  } catch (error) {
    console.log('Error enviando WhatsApp:', error.response?.data || error.message);
  }
}

module.exports = enviarWhatsApp;