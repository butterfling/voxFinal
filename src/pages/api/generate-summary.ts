import { type NextApiRequest, type NextApiResponse } from "next";
import { pipeline } from '@xenova/transformers';

let summarizer: any = null;

async function initializeSummarizer() {
  if (!summarizer) {
    console.log('Initializing summarizer...');
    summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
    console.log('Summarizer initialized successfully');
  }
  return summarizer;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[DEBUG] Starting summary generation process');
    const { transcripts } = req.body;

    if (!Array.isArray(transcripts)) {
      return res.status(400).json({ error: 'Transcripts must be an array' });
    }

    if (transcripts.length === 0) {
      return res.status(400).json({ error: 'Transcripts array is empty' });
    }

    const fullText = transcripts.join('\n');

    if (!fullText.trim()) {
      return res.status(400).json({ error: 'No valid transcript content provided' });
    }

    console.log(`[DEBUG] Input text length: ${fullText.length} characters`);
    console.log('[DEBUG] Initializing pipeline');

    // Initialize the summarizer
    const summarizer = await initializeSummarizer();
    console.log('[DEBUG] Pipeline initialized, generating summary');

    console.log('Generating summary for transcript length:', fullText.length);

    // Generate summary
    const result = await summarizer(fullText, {
      max_length: 250,  // Increased for more comprehensive summaries
      min_length: 50,   // Increased to avoid too short summaries
      length_penalty: 2.0, // Encourage longer, more detailed summaries
      num_beams: 4,     // Use beam search for better quality
      early_stopping: true,
      do_sample: false  // Deterministic generation
    });

    console.log('[DEBUG] Summary generation completed:', result);
    console.log('[DEBUG] Generated summary: ', result[0].summary_text);

    if (!result?.[0]?.summary_text) {
      console.error('BERT response missing content:', result);
      return res.status(500).json({ error: 'Invalid response from summarizer' });
    }

    const summary = result[0].summary_text;
    return res.status(200).json({ summary });
  } catch (error: unknown) {
    console.error('[DEBUG] Error in summary generation:', error);
    
    if (error instanceof Error) {
      return res.status(500).json({ 
        error: 'Failed to generate summary',
        message: error.message,
        name: error.name
      });
    }
    
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
}
