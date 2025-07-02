import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

// L'import corretto per la funzione di ricerca, come da documentazione ufficiale.
import { GoogleSearch } from "@google/generative-ai/server";

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const sanitizeDescription = (description) => {
  if (!description) return '';
  const withoutHtml = description.replace(/<[^>]*>?/gm, ' ').replace(/&[a-z]+;/gi, ' ');
  const singleSpace = withoutHtml.replace(/\s+/g, ' ').trim();
  return singleSpace.length > 2000 ? `${singleSpace.substring(0, 2000)}...` : singleSpace;
};

// --- ROTTA PER IL RATING CON RICERCA GOOGLE INTEGRATA ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    let cleanBookDescription = sanitizeDescription(book.description);

    // --- LOGICA DI RICERCA AUTOMATICA ---
    if (!cleanBookDescription || cleanBookDescription.length < 100) {
      console.log(`⚠️ Descrizione per "${book.title}" mancante o troppo corta. Avvio ricerca Google...`);
      const searchQuery = `trama libro ${book.title} ${book.authors?.[0] || ''}`;
      try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            tools: [new GoogleSearch()],
            toolConfig: {
                googleSearch: {
                    resultCount: 3
                }
            }
        });
        const result = await model.generateContent(`Riassumi in modo dettagliato la trama di questo libro: ${searchQuery}`);
        const text = result.response.text();

        if (text) {
          cleanBookDescription = sanitizeDescription(text);
          console.log(`✅ Trovata descrizione alternativa per "${book.title}" tramite ricerca IA.`);
        } else {
           console.log(`❌ Ricerca IA per "${book.title}" non ha prodotto risultati utili.`);
        }
      } catch (searchError) {
          console.error(`Errore durante la ricerca IA per "${book.title}":`, searchError);
      }
    } else {
        console.log(`✅ Usando la descrizione fornita per "${book.title}".`);
    }

    const analysisModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `
      Basandoti sul profilo del lettore e sulla descrizione del libro, esegui un'analisi di compatibilità accurata. La DESCRIZIONE è la fonte più importante.
      PROFILO LETTORE:
      - Generi: ${userPreferences.favoriteGenres?.join(', ')}
      - Bio: "${userPreferences.bio}"
      - Vibes: ${userPreferences.vibes?.join(', ')}
      LIBRO TARGET:
      - Titolo: ${book.title}
      - Descrizione (da usare per l'analisi): "${cleanBookDescription}"
      OUTPUT JSON OBBLIGATORIO:
      { "final_rating": number, "short_reasoning": "stringa", "positive_points": ["array"], "negative_points": ["array"] }
    `;

    const result = await analysisModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Risposta IA non in formato JSON.');
    
    res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    console.error('ERRORE CRITICO /api/rate-book:', error);
    res.status(500).json({ error: "Errore interno del server AI." });
  }
});


// AVVIO DEL SERVER
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server con ricerca Google integrata in ascolto su porta ${PORT}`);
});
