import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- ROTTA DI RATING POTENZIATA CON GEMINI 1.5 PRO ---
app.post('/api/rate-book', async (req, res) => {
  const { book, userPreferences, readingHistory } = req.body;

  if (!book || !userPreferences) {
    return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
  }

  // Utilizziamo il modello più potente
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const prompt = `
    Sei un critico letterario e un book advisor d'élite, con una profonda comprensione della psicologia dei lettori. La tua unica missione è eseguire un'analisi di compatibilità estremamente accurata e strutturata, basandoti sui dati forniti.

    **PROCESSO DI ANALISI OBBLIGATORIO (Chain of Thought):**

    **1. Analisi Profilo Lettore:** Assimila il profilo del lettore per capire i suoi desideri.
    * **Generi Preferiti:** ${userPreferences.favoriteGenres?.join(', ') || 'Non specificati'}
    * **Bio / Cosa Cerca in una Storia:** "${userPreferences.bio || 'Non specificata'}"
    * **Vibes / Atmosfere Desiderate:** ${userPreferences.vibes?.join(', ') || 'Non specificate'}

    **2. Analisi del Libro Target:** Analizza il libro, usando la descrizione come fonte primaria.
    * **Titolo:** ${book.title}
    * **Descrizione (fonte di verità per trama e stile):** "${book.description}"
    * **Categorie Fornite:** ${book.categories?.join(', ')}

    **3. Analisi Comparativa con Punteggi Parziali (da 1.0 a 5.0):**
    * **Affinità Trama (Peso 50%):** La **descrizione** del libro promette una trama che si allinea con la **bio** del lettore? Valuta la corrispondenza e assegna un punteggio.
    * **Affinità Stile/Vibes (Peso 30%):** Il tono della **descrizione** e le categorie suggeriscono un'atmosfera in linea con le **vibes** desiderate dal lettore? Valuta e assegna un punteggio.
    * **Affinità Genere (Peso 20%):** Le **categorie** del libro combaciano con i **generi preferiti**? Considera anche generi affini. Valuta e assegna un punteggio.

    **4. Calcolo Punteggio Finale e Output:**
    * Calcola il **punteggio finale** come media ponderata dei tre sotto-punteggi.
    * Basandoti sulla qualità e quantità delle informazioni, determina il tuo livello di confidenza.
    * Estrai i punti chiave positivi e negativi dalla tua analisi.
    * Fornisci la tua analisi **ESCLUSIVAMENTE** in formato JSON, senza testo, commenti o markdown prima o dopo.

    **STRUTTURA JSON DI OUTPUT OBBLIGATORIA:**
    {
      "rating_details": {
        "plot_affinity": { "score": number, "reason": "stringa breve (max 10 parole) che motiva il punteggio della trama" },
        "style_affinity": { "score": number, "reason": "stringa breve (max 10 parole) che motiva il punteggio dello stile" },
        "genre_affinity": { "score": number, "reason": "stringa breve (max 10 parole) che motiva il punteggio del genere" }
      },
      "final_rating": number,
      "confidence_level": "stringa ('Alta', 'Media' o 'Bassa')",
      "short_reasoning": "stringa singola di massimo 15 parole che riassume il tuo giudizio complessivo",
      "positive_points": ["array di 2-3 stringhe concise sui motivi per cui potrebbe piacere"],
      "negative_points": ["array di 1-2 stringhe concise sui potenziali punti deboli per questo lettore"]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('La risposta dell\'IA per il rating non è in formato JSON valido.');
    
    const jsonData = JSON.parse(jsonMatch[0]);
    res.json(jsonData);
  } catch (error) {
    console.error('Errore durante la chiamata all\'IA:', error);
    res.status(500).json({ error: "Impossibile contattare il servizio di analisi AI." });
  }
});

// La rotta /api/describe-book rimane per compatibilità o usi futuri
app.post('/api/describe-book', async (req, res) => {
    // ... (codice invariato)
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server potenziato con Gemini 1.5 Pro in ascolto sulla porta ${PORT}`);
});
