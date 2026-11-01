// Local emoji suggestions for a category name (like MonAi's "Tecnología" → 💻 📱 🖥️ 🔌 🤖).
// Gemini adds better ones when the key is set; see pipeline.ts.

import { keywords } from '../lib/text';

const EMOJI_MAP: { words: string[]; emojis: string[] }[] = [
  { words: ['tecnologia', 'tecno', 'computador', 'gadgets'], emojis: ['💻', '📱', '🖥️', '🔌', '🤖'] },
  { words: ['celular', 'plan', 'datos', 'telefono', 'movil'], emojis: ['📱', '📶', '☎️', '🔋', '📞'] },
  { words: ['domicilio', 'domicilios', 'delivery', 'pedidos'], emojis: ['🛵', '🏠', '📦', '🍕', '🛍️'] },
  { words: ['comer', 'comida', 'restaurante', 'afuera', 'almuerzos'], emojis: ['🍔', '🍕', '🍽️', '🌮', '🍜'] },
  { words: ['mercado', 'supermercado', 'compras', 'viveres'], emojis: ['🥑', '🛒', '🍎', '🥦', '🧺'] },
  { words: ['transporte', 'bus', 'taxi', 'uber', 'movilidad'], emojis: ['🚌', '🚕', '🚗', '🚇', '🛴'] },
  { words: ['auto', 'carro', 'gasolina', 'vehiculo'], emojis: ['🚗', '⛽', '🔧', '🅿️', '🚙'] },
  { words: ['moto', 'motos'], emojis: ['🏍️', '⛽', '🛵', '🪖', '🔧'] },
  { words: ['hogar', 'casa', 'arriendo', 'vivienda'], emojis: ['🏠', '🛋️', '🔑', '🧹', '🏡'] },
  { words: ['servicios', 'luz', 'agua', 'gas', 'internet'], emojis: ['💡', '🚰', '🔥', '🌐', '🧾'] },
  { words: ['salud', 'medico', 'drogueria', 'farmacia'], emojis: ['💊', '🩺', '🏥', '❤️‍🩹', '🦷'] },
  { words: ['gimnasio', 'gym', 'deporte', 'ejercicio'], emojis: ['🏋️', '💪', '⚽', '🏃', '🧘'] },
  { words: ['ropa', 'vestuario', 'moda', 'zapatos'], emojis: ['👕', '👖', '👟', '🧥', '👗'] },
  { words: ['entretenimiento', 'ocio', 'cine', 'diversion', 'salidas'], emojis: ['🎬', '🎮', '🎉', '🎟️', '🍿'] },
  { words: ['educacion', 'estudio', 'universidad', 'cursos', 'libros'], emojis: ['📚', '🎓', '✏️', '🏫', '💡'] },
  { words: ['mascotas', 'mascota', 'perro', 'gato'], emojis: ['🐶', '🐱', '🦴', '🐾', '🐕'] },
  { words: ['lujo', 'joyas', 'caprichos'], emojis: ['💎', '👑', '💍', '⌚', '✨'] },
  { words: ['suscripciones', 'streaming', 'apps'], emojis: ['📺', '🎵', '📱', '🍿', '☁️'] },
  { words: ['viajes', 'viaje', 'vacaciones', 'turismo'], emojis: ['✈️', '🏖️', '🧳', '🗺️', '🏨'] },
  { words: ['regalos', 'regalo', 'detalles'], emojis: ['🎁', '💐', '🎀', '💝', '🎂'] },
  { words: ['bebe', 'hijos', 'ninos'], emojis: ['🍼', '🧸', '👶', '🎒', '🧃'] },
  { words: ['pareja', 'novia', 'novio', 'citas'], emojis: ['❤️', '🌹', '🥂', '💑', '🍷'] },
  { words: ['ahorro', 'ahorros', 'inversion', 'inversiones'], emojis: ['🐷', '📈', '🏦', '💰', '🪙'] },
  { words: ['deudas', 'credito', 'tarjeta', 'prestamo', 'cuotas', 'manejo'], emojis: ['💳', '🏦', '🧾', '📉', '💸'] },
  { words: ['salario', 'sueldo', 'nomina', 'trabajo'], emojis: ['💰', '🤑', '💵', '💼', '🏦'] },
  { words: ['ingresos', 'ventas', 'extra', 'freelance'], emojis: ['💵', '📈', '🪙', '🧾', '💸'] },
  { words: ['cafe', 'tinto'], emojis: ['☕', '🥐', '🍪', '🧁', '🍩'] },
  { words: ['belleza', 'peluqueria', 'cuidado', 'personal'], emojis: ['💇', '💅', '🧴', '💄', '🪒'] },
];

const FALLBACK = ['📦', '🛍️', '💳', '⭐', '🏷️'];

export function suggestEmojisLocally(name: string): string[] {
  const words = new Set(keywords(name));
  const found: string[] = [];
  for (const entry of EMOJI_MAP) {
    if (entry.words.some((w) => words.has(w))) found.push(...entry.emojis);
  }
  return [...new Set(found.length ? found : FALLBACK)].slice(0, 5);
}
