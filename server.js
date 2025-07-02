import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

// Importiamo il nostro nuovo strumento di ricerca
import { search } from '@google/generative-ai/server';

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

// --- ROTTA DI RATING POTENZIATA CON RICERCA GOOGLE ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    let cleanBookDescription = sanitizeDescription(book.description);

    // --- LOGICA DI RICERCA AUTOMATICA ---
    if (!cleanBookDescription || cleanBookDescription.length < 50) {
      console.log(`⚠️ Descrizione per "${book.title}" mancante o troppo corta. Avvio ricerca su Google...`);
      const searchQuery = `trama libro ${book.title} ${book.authors?.[0] || ''}`;
      try {
        const searchResult = await search({ query: searchQuery });
        // Prendiamo i primi 3 snippet e li uniamo per avere una descrizione più ricca
        const snippets = searchResult.results.slice(0, 3).map(r => r.snippet).join(' ');
        if (snippets) {
          cleanBookDescription = sanitizeDescription(snippets);
          console.log(`✅ Trovata descrizione alternativa per "${book.title}" tramite Google.`);
        } else {
           console.log(`❌ Ricerca Google per "${book.title}" non ha prodotto risultati utili.`);
        }
      } catch (searchError) {
          console.error(`Errore durante la ricerca Google per "${book.title}":`, searchError);
      }
    } else {
        console.log(`✅ Usando la descrizione fornita per "${book.title}".`);
    }
    // ------------------------------------

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

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

    const result = await model.generateContent(prompt);
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server con ricerca Google integrata in ascolto su porta ${PORT}`);
});
