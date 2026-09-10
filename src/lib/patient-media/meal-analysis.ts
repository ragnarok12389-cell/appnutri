import { MealPhotoAnalysis, MealPhotoAnalysisSchema } from '@/types/patient-media';

const SYSTEM_PROMPT = `Você analisa uma fotografia de refeição para educação alimentar. Identifique apenas o que estiver visualmente sustentado. Estime calorias e macronutrientes como intervalos aproximados, nunca como medição exata. Não diagnostique, não prescreva, não afirme alergênicos ausentes e não altere planos. Responda somente JSON válido com: summary, identified_items [{name, confidence de 0 a 1}], estimated_calories {min,max} ou null, estimated_macros_g {protein,carbohydrate,fat} ou null, plan_alignment (aligned, partially_aligned, unclear ou no_active_plan), observations, safety_flags, confidence (low, medium ou high), disclaimer.`;

export async function analyzeMealImage(input: {
  bytes: Uint8Array;
  mimeType: string;
  hasActivePlan: boolean;
}): Promise<{ analysis: MealPhotoAnalysis; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('AI_PROVIDER_UNAVAILABLE');

  const model = process.env.GEMINI_VISION_MODEL ?? 'gemini-3.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [
          { text: input.hasActivePlan ? 'Analise a refeição. Existe um plano ativo, mas não presuma os itens prescritos.' : 'Analise a refeição. Não existe plano alimentar ativo.' },
          { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.bytes).toString('base64') } },
        ] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1000, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
  if (!text) throw new Error('AI_EMPTY_RESPONSE');
  const parsed = MealPhotoAnalysisSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('AI_INVALID_RESPONSE');
  return { analysis: parsed.data, model };
}
