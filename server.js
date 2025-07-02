import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- FUNZIONE DI PULIZIA DEFINITIVA ---
// Rimuove i tag HTML e altri artefatti comuni, garantendo testo pulito.
const sanitizeDescription = (description) => {
  if (!description) return ''; // Restituisce una stringa vuota se non c'è descrizione.
  // Rimuove tag HTML, entità HTML (es. &amp;) e spazi extra.
  const withoutHtml = description.replace(/<[^>]*>?/gm, ' ').replace(/&[a-z]+;/gi, ' ');
  const singleSpace = withoutHtml.replace(/\s+/g, ' ').trim();
  // Tronca a una lunghezza sicura per l'IA.
  return singleSpace.length > 2000 ? `${singleSpace.substring(0, 2000)}...` : singleSpace;
};

// --- ROTTA UNICA E POTENZIATA ---
app.post('/api/analyze-book', async (req, res) => {
  try {
    const { book, userPreferences } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    // --- PULIZIA DEI DATI E LOG DI CONTROLLO ---
    const cleanBookDescription = sanitizeDescription(book.description);
    let descriptionUsed = cleanBookDescription;

    if (!descriptionUsed || descriptionUsed.length < 150) {
      console.log(`⚠️ Descrizione per "${book.title}" mancante/corta. Avvio ricerca Google...`);
      const searchModel = genAI.getGenerativeModel({
          model: "gemini-1.5-pro",
          tools: [{googleSearch: {}}]
      });
      const searchQuery = `trama completa libro ${book.title} ${book.authors?.[0] || ''}`;
      try {
        const result = await searchModel.generateContent(`Usando la ricerca Google, trova e restituisci una sinossi dettagliata per il libro: ${searchQuery}`);
        const foundText = result.response.text();
        if (foundText) {
          descriptionUsed = sanitizeDescription(foundText);
          console.log(`✅ Trovata descrizione alternativa per "${book.title}"`);
        } else {
           console.log(`❌ Ricerca IA per "${book.title}" non ha prodotto risultati utili.`);
           descriptionUsed = "Descrizione non trovata.";
        }
      } catch (searchError) {
          console.error(`Errore durante la ricerca IA per "${book.title}":`, searchError);
          descriptionUsed = "Descrizione non trovata.";
      }
    } else {
        console.log(`✅ Usando la descrizione fornita per "${book.title}".`);
    }

    // --- Logica di Analisi Finale ---
    const analysisModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `
      PROCESSO DI ANALISI CRITICA OBBLIGATORIO:
      Sei un book advisor d'élite. Analizza la compatibilità tra il lettore e il libro forniti. La tua analisi deve basarsi PRIMARIAMENTE sulla DESCRIZIONE del libro.

      1.  **PROFILO LETTORE:**
          * **Generi Amati:** ${userPreferences.favoriteGenres?.join(', ') || 'N/A'}
          * **Cosa Cerca (Bio):** "${userPreferences.bio || 'N/A'}"
          * **Vibes Desiderate:** ${userPreferences.vibes?.join(', ') || 'N/A'}

      2.  **LIBRO DA ANALIZZARE:**
          * **Titolo:** ${book.title}
          * **Descrizione da Usare per l'Analisi:** "${descriptionUsed}"

      3.  **ANALISI COMPARATIVA E PUNTEGGI (scala 1.0-5.0):**
          * **Punteggio Trama:** Quanto la descrizione del libro si allinea con la Bio del lettore?
          * **Punteggio Stile:** Il tono della descrizione corrisponde alle Vibes del lettore?
          * **Punteggio Genere:** Quanto sono affini le categorie del libro ai generi amati dal lettore?

      4.  **OUTPUT OBBLIGATORIO (ESCLUSIVAMENTE JSON):**
          Calcola una media ponderata (60% Trama, 30% Stile, 10% Genere) per il punteggio finale. Il punteggio finale DEVE essere compreso tra 1.0 e 5.0.
          Restituisci un oggetto JSON con questa esatta struttura:
          {
            "rating_details": {
              "plot_affinity": { "score": number, "reason": "stringa breve motivazione" },
              "style_affinity": { "score": number, "reason": "stringa breve motivazione" },
              "genre_affinity": { "score": number, "reason": "stringa breve motivazione" }
            },
            "final_rating": number,
            "confidence_level": "stringa ('Alta', 'Media', 'Bassa')",
            "short_reasoning": "stringa di massimo 15 parole",
            "positive_points": ["array di 2-3 stringhe concise"],
            "negative_points": ["array di 1-2 stringhe concise"],
            "description_used": "${descriptionUsed.replace(/"/g, '\\"')}"
          }
    `;

    const result = await analysisModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Risposta IA non in formato JSON valido.');
    
    res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    console.error('ERRORE CRITICO /api/analyze-book:', error);
    res.status(500).json({ error: "Errore interno nel server di analisi AI." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server Super-Intelligente in ascolto sulla porta ${PORT}`);
});
