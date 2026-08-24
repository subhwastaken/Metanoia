const MODEL_FALLBACK = [
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
];

export async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  options: { json?: boolean; temperature?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  for (const model of MODEL_FALLBACK) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`Gemini ${model} failed (${res.status}):`, err.slice(0, 200));
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch (e) {
      console.warn(`Gemini ${model} error:`, e);
    }
  }

  return null;
}
