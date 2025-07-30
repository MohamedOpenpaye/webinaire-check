module.exports = async function handler(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email requis' });
  }

  try {
    const searchResponse = await fetch("https://api.intercom.io/contacts/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.INTERCOM_TOKEN}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: {
          operator: "AND",
          value: [
            { field: "email", operator: "=", value: email },
            { field: "role", operator: "=", value: "user" }
          ]
        }
      })
    });

    const data = await searchResponse.json();

    if (!data || !data.data || data.data.length === 0) {
      return res.status(404).json({
        eligible: false,
        reason: "Aucun user trouvé avec cet email"
      });
    }

    const contact = data.data[0];
    const timestamp = contact.custom_attributes?.inscription_date;

    if (!timestamp) {
      return res.status(200).json({
        eligible: false,
        reason: "Champ 'inscription_date' manquant",
        debug: {
          contact_id: contact.id,
          custom_attributes: contact.custom_attributes
        }
      });
    }

    const createdAt = new Date(timestamp * 1000);
    const now = new Date();
    const daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);
    const eligible = daysSinceSignup <= 30;

    return res.status(200).json({
      eligible,
      reason: eligible
        ? "Inscrit depuis moins de 30 jours"
        : "Inscrit depuis plus de 30 jours",
      debug: {
        email,
        contact_id: contact.id,
        inscriptionDate: createdAt.toISOString(),
        daysSinceSignup: Math.floor(daysSinceSignup)
      }
    });

  } catch (error) {
    console.error("Erreur Intercom API:", error);
    return res.status(500).json({
      error: "Erreur interne",
      details: error.message
    });
  }
};
