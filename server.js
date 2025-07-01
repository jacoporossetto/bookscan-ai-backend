import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();

const allowedOrigins = [
    'http://localhost:5173',
    'capacitor://localhost',
    'http://localhost'
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- ROTTA PER IL RATING (CON PROMPT POTENZIATO) ---
app.post('/api/rate-book', async (req, res) => {
  const { book, userPreferences, readingHistory } = req.body;

  if (!book || !userPreferences) {
    return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // --- IL NUOVO PROMPT AVANZATO ---
  const prompt = `
    Sei un critico letterario e un book advisor d'élite, con una profonda comprensione della psicologia dei lettori. Il tuo compito è eseguire un'analisi di compatibilità estremamente accurata e strutturata.

    **PROCESSO DI ANALISI OBBLIGATORIO (Chain of Thought):**

    **1. Analisi del Lettore:** Assimila il profilo del lettore.
    * **Generi Chiave:** ${userPreferences.favoriteGenres?.join(', ') || 'Non specificati'}
    * **Bio / Cosa Cerca:** "${userPreferences.bio || 'Non specificata'}"
    * **Vibes / Atmosfere Desiderate:** ${userPreferences.vibes?.join(', ') || 'Non specificate'}
    * **Ritmo di Lettura Preferito:** ${userPreferences.readingPace || 'Non specificato'}
    * **Cronologia Recente (per calibrare i gusti):** ${JSON.stringify(readingHistory) || 'Nessuna'}

    **2. Analisi del Libro Target:** Analizza il libro in ogni sua parte.
    * **Titolo:** ${book.title}
    * **Descrizione (fonte primaria di analisi):** "${book.description}"
    * **Categorie Fornite:** ${book.categories?.join(', ')}

    **3. Analisi Comparativa (Step Fondamentale):**
    * **Affinità Trama:** Confronta la **descrizione** del libro con la **bio** del lettore. La trama descritta soddisfa ciò che il lettore cerca in una storia? Assegna un punteggio da 1.0 a 5.0.
    * **Affinità Stile/Vibes:** La **descrizione** suggerisce un'atmosfera e uno stile in linea con le **vibes** e il **ritmo** ricercati dal lettore? Assegna un punteggio da 1.0 a 5.0.
    * **Affinità Genere:** Le **categorie** del libro corrispondono ai **generi preferiti** del lettore? Considera anche le affinità tra generi (es. un thriller psicologico può piacere a chi ama il giallo). Assegna un punteggio da 1.0 a 5.0.

    **4. Calcolo Punteggio Finale:**
    * Calcola il **punteggio finale** come media ponderata dei sotto-punteggi (dai più peso all'affinità della trama).

    **5. Output Strutturato:**
    * Fornisci la tua analisi ESCLUSIVAMENTE in formato JSON, senza testo, commenti o markdown prima o dopo.

    **STRUTTURA JSON DI OUTPUT OBBLIGATORIA:**
    {
      "rating_details": {
        "plot_affinity": { "score": number, "reason": "stringa breve che motiva il punteggio" },
        "style_affinity": { "score": number, "reason": "stringa breve che motiva il punteggio" },
        "genre_affinity": { "score": number, "reason": "stringa breve che motiva il punteggio" }
      },
      "final_rating": number, // La media ponderata finale
      "confidence_level": "stringa ('Alta', 'Media' o 'Bassa') che indica quanto sei sicuro della tua analisi",
      "short_reasoning": "stringa singola di massimo 15 parole che riassume il tuo giudizio complessivo",
      "positive_points": ["array di 2 o 3 stringhe con i motivi per cui potrebbe piacere"],
      "negative_points": ["array di 1 o 2 stringhe con i potenziali punti deboli per questo lettore"]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('La risposta dell\'IA per il rating non è in formato JSON valido.');
    }
    const jsonData = JSON.parse(jsonMatch[0]);
    res.json(jsonData);

  } catch (error) {
    console.error('Errore durante la chiamata all\'IA:', error);
    res.status(500).json({ error: "Impossibile contattare il servizio di analisi AI." });
  }
});


// ... (la tua rotta /api/describe-book e il resto del server rimangono invariati) ...


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server potenziato in ascolto sulla porta ${PORT}`);
});
