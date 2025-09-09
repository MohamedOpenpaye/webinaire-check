export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { email, visitorId } = req.query;
  let finalEmail = email;

  console.log("📥 Reçu → email:", email, "| visitorId:", visitorId);

  // 🧩 Si pas d'email, tenter via visitorId
  if (!finalEmail && visitorId) {
    console.log("🔍 Recherche email via visitorId...");

    try {
      const response = await fetch(`https://api.intercom.io/contacts/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: {
            operator: "AND",
            value: [
              { field: "id", operator: "=", value: visitorId },
              { field: "role", operator: "=", value: "user" }
            ]
          }
        })
      });

      const data = await response.json();
      console.log("📬 Résultat de recherche Intercom:", JSON.stringify(data, null, 2));

      if (data?.data?.length > 0) {
        finalEmail = data.data[0].email;
        console.log("📧 Email trouvé via visitorId :", finalEmail);
      } else {
        return res.status(400).json({
          eligible: false,
          reason: "Email introuvable via visitorId",
          debug: { visitorId }
        });
      }

    } catch (error) {
      console.error("❌ Erreur Intercom lors de la recherche visitorId :", error);
      return res.status(500).json({
        error: "Erreur serveur lors de la récupération de l'email depuis visitorId",
        details: error.message
      });
    }
  }

  // ❌ Email toujours manquant ?
  if (!finalEmail) {
    return res.status(400).json({
      eligible: false,
      reason: "Email introuvable",
      debug: { visitorId }
    });
  }

  try {
    console.log("🔍 Recherche du contact par email :", finalEmail);

    const searchResponse = await fetch("https://api.intercom.io/contacts/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: {
          operator: "AND",
          value: [
            { field: "email", operator: "=", value: finalEmail },
            { field: "role", operator: "=", value: "user" }
          ]
        }
      })
    });

    const data = await searchResponse.json();
    console.log("📬 Données retour email :", JSON.stringify(data, null, 2));

    if (!data || !data.data || data.data.length === 0) {
      return res.status(404).json({
        eligible: false,
        reason: "Utilisateur non trouvé par email",
        debug: { email: finalEmail }
      });
    }

    const contact = data.data[0];
    const timestamp = contact.signed_up_at;

    if (!timestamp) {
      return res.status(200).json({
        eligible: false,
        reason: "Date d'inscription non définie",
        debug: { email: finalEmail, contact_id: contact.id }
      });
    }

    const createdAt = new Date(timestamp * 1000);
    const now = new Date();
    const daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);
    const eligible = daysSinceSignup <= 60;

    return res.status(200).json({
      eligible,
      reason: eligible
        ? "Inscrit depuis moins de 60 jours"
        : "Inscrit depuis plus de 60 jours",
      debug: {
        email: finalEmail,
        contact_id: contact.id,
        signedUpAt: createdAt.toISOString(),
        daysSinceSignup: Math.floor(daysSinceSignup)
      }
    });

  } catch (error) {
    console.error("❌ Erreur recherche contact par email :", error);
    return res.status(500).json({
      error: "Erreur serveur lors de la vérification d'éligibilité",
      details: error.message
    });
  }
}
