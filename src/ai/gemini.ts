// Minimal Gemini REST client (no SDK, so nothing native is added).
//
// Uses the Interactions API, which Google recommends for new projects since June 2026:
// https://ai.google.dev/gemini-api/docs/interactions
// If the endpoint answers 404 (e.g. a model only available on the legacy API), it falls back to
// models.generateContent, which Google still fully supports.
// store=false: Google does not keep the interaction for server-side history.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 45_000;

export type AiPart = { type: 'text'; text: string } | { type: 'audio'; data: string; mimeType: string };

export interface AiRequest {
  apiKey: string;
  model: string;
  system: string;
  parts: AiPart[];
  /** JSON schema. When present the answer is parsed as JSON. */
  schema?: Record<string, unknown>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'quota' | 'network' | 'server' | 'format',
  ) {
    super(message);
  }
}

function errorFor(status: number, body: string): AiError {
  const lower = body.toLowerCase();
  if (status === 400 && (lower.includes('api key') || lower.includes('api_key'))) {
    return new AiError('La clave de Gemini no es válida. Revísala en Configuración → Inteligencia artificial.', 'key');
  }
  if (status === 401 || status === 403) {
    return new AiError('Gemini rechazó la clave. Revísala en Configuración → Inteligencia artificial.', 'key');
  }
  if (status === 429) {
    return new AiError('Se acabó el cupo gratis de Gemini por ahora. Intenta en un rato.', 'quota');
  }
  if (status >= 500) {
    return new AiError('Gemini no está respondiendo. Intenta en un momento.', 'server');
  }
  return new AiError(`Gemini respondió con un error (${status}).`, 'server');
}

async function post(url: string, apiKey: string, body: unknown): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status, text: await res.text() };
  } catch {
    throw new AiError('No hay conexión con Gemini. Revisa tu internet.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

type Json = Record<string, unknown>;

function interactionsBody(req: AiRequest): Json {
  return {
    model: req.model,
    system_instruction: req.system,
    store: false,
    input: req.parts.map((p) =>
      p.type === 'text' ? { type: 'text', text: p.text } : { type: 'audio', data: p.data, mime_type: p.mimeType },
    ),
    ...(req.schema ? { response_format: { type: 'text', mime_type: 'application/json', schema: req.schema } } : {}),
  };
}

/** Model text in any of the shapes the Interactions API may use. */
function interactionsText(json: Json): string {
  if (typeof json.output_text === 'string') return json.output_text;
  const fromBlocks = (blocks: unknown) =>
    Array.isArray(blocks)
      ? (blocks as Json[]).filter((c) => c.type === 'text' && typeof c.text === 'string').map((c) => c.text as string).join('')
      : '';
  const steps = Array.isArray(json.steps) ? (json.steps as Json[]) : [];
  const fromSteps = steps.filter((s) => s.type === 'model_output').map((s) => fromBlocks(s.content)).join('');
  if (fromSteps) return fromSteps;
  // Older shape: "outputs": [{ "type": "text", "text": "..." }]
  return fromBlocks(json.outputs);
}

function generateContentBody(req: AiRequest): Json {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [
      {
        role: 'user',
        parts: req.parts.map((p) =>
          // generateContent documents "audio/aac" for AAC; the .m4a recording is AAC.
          p.type === 'text' ? { text: p.text } : { inlineData: { mimeType: p.mimeType === 'audio/m4a' ? 'audio/aac' : p.mimeType, data: p.data } },
        ),
      },
    ],
    ...(req.schema ? { generationConfig: { responseMimeType: 'application/json', responseJsonSchema: req.schema } } : {}),
  };
}

function generateContentText(json: Json): string {
  const candidates = Array.isArray(json.candidates) ? (json.candidates as Json[]) : [];
  const parts = (candidates[0]?.content as Json | undefined)?.parts;
  return Array.isArray(parts)
    ? (parts as Json[]).map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
    : '';
}

function parseJson(text: string): Json | null {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
}

function isKeyError(status: number, body: string): boolean {
  return errorFor(status, body).kind === 'key';
}

/**
 * Sends the request and returns the model's text. Interactions API first; the legacy
 * generateContent is used if Interactions answers 404, rejects the request shape (400 that is not a
 * key problem) or returns no text. A wrong key or an empty quota is reported right away.
 */
export async function generate(req: AiRequest): Promise<string> {
  const first = await post(`${BASE}/interactions`, req.apiKey, interactionsBody(req));
  if (first.status >= 200 && first.status < 300) {
    const json = parseJson(first.text);
    const text = json ? interactionsText(json).trim() : '';
    if (text) return text;
  } else if (first.status === 429 || isKeyError(first.status, first.text) || (first.status !== 404 && first.status !== 400)) {
    throw errorFor(first.status, first.text);
  }

  const second = await post(`${BASE}/models/${encodeURIComponent(req.model)}:generateContent`, req.apiKey, generateContentBody(req));
  if (second.status < 200 || second.status >= 300) throw errorFor(second.status, second.text);
  const json = parseJson(second.text);
  if (!json) throw new AiError('Gemini devolvió una respuesta que no se pudo leer.', 'format');
  const text = generateContentText(json).trim();
  if (!text) throw new AiError('Gemini no devolvió texto.', 'format');
  return text;
}

/** Like `generate` but parses the JSON answer (the schema makes Gemini answer JSON only). */
export async function generateJson<T>(req: AiRequest & { schema: Record<string, unknown> }): Promise<T> {
  const text = await generate(req);
  // Some models wrap JSON in ```json fences even in JSON mode; strip them just in case.
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(clean) as T;
  } catch {
    throw new AiError('Gemini devolvió un JSON inválido.', 'format');
  }
}
