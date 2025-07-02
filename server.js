import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

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

// --- ROTTA UNICA E POTENZIATA ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    let cleanBookDescription = sanitizeDescription(book.description);
    
    // --- INTEGRAZIONE DELLA RICERCA GOOGLE NELL'IA ---
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        // Abilitiamo lo strumento di ricerca direttamente nel modello
        tools: {
          googleSearch: {},
        },
    });

    // --- PROMPT FINALE ---
    // Ora il prompt è più diretto. Chiediamo all'IA di cercare la trama SE necessario.
    const prompt = `
      Sei un critico letterario e book advisor d'élite. Il tuo compito è creare un'analisi di compatibilità accurata per il libro fornito, basandoti sul profilo del lettore.

      **PROCESSO DI ANALISI OBBLIGATORIO:**

      **1. Analisi Dati Forniti:**
         - PROFILO LETTORE: Generi=${userPreferences.favoriteGenres?.join(', ') || 'N/A'}, Bio="${userPreferences.bio || 'N/A'}", Vibes=${userPreferences.vibes?.join(', ') || 'N/A'}.
         - LIBRO: Titolo="${book.title}", Autore="${book.authors?.[0] || ''}", Descrizione Fornita="${cleanBookDescription}".

      **2. Azione Critica (SE la "Descrizione Fornita" è assente, troppo corta, o inutile):**
         - Esegui una ricerca Google per trovare la trama o una sinossi dettagliata del libro "${book.title}".

      **3. Analisi Comparativa:**
         - Basandoti sulla descrizione (quella fornita o quella che hai trovato), valuta l'affinità della trama e dello stile con le preferenze del lettore.

      **4. Output JSON Obbligatorio:**
          {
            "final_rating": number,
            "short_reasoning": "stringa max 15 parole",
            "positive_points": ["array di 2-3 stringhe sui motivi per cui potrebbe piacere"],
            "negative_points": ["array di 1-2 potenziali punti deboli"]
          }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Risposta IA non in formato JSON valido.');
    
    res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    console.error('ERRORE CRITICO NEL SERVER /api/rate-book:', error);
    res.status(500).json({ error: "Errore interno nel server di analisi AI." });
  }
});

// AVVIO DEL SERVER
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server con ricerca Google integrata in ascolto su porta ${PORT}`);
});
