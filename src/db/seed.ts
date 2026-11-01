import { categoryPalette } from '../theme';
import type { Kind } from './types';

/** The list every install starts with. Existing data is moved here by migration v2. */
export const PERSONAL_LIST_ID = 'list-personal';

interface SeedCategory {
  // Stable ids (only for the Personal list) so backups from different phones merge.
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
}

const p = categoryPalette;

/** Suggested categories. Onboarding shows them and keeps only the ones the user taps. */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  { id: 'cat-mercado', name: 'Mercado', emoji: '🥑', color: p[0], kind: 'expense' },
  { id: 'cat-comer-afuera', name: 'Comer afuera', emoji: '🍔', color: p[1], kind: 'expense' },
  { id: 'cat-transporte', name: 'Transporte', emoji: '🚗', color: p[4], kind: 'expense' },
  { id: 'cat-hogar', name: 'Hogar', emoji: '🏠', color: p[7], kind: 'expense' },
  { id: 'cat-servicios', name: 'Servicios', emoji: '💡', color: p[5], kind: 'expense' },
  { id: 'cat-salud', name: 'Salud', emoji: '💊', color: p[6], kind: 'expense' },
  { id: 'cat-ropa', name: 'Ropa', emoji: '👕', color: p[2], kind: 'expense' },
  { id: 'cat-entretenimiento', name: 'Entretenimiento', emoji: '🎬', color: p[3], kind: 'expense' },
  { id: 'cat-educacion', name: 'Educación', emoji: '📚', color: p[8], kind: 'expense' },
  { id: 'cat-mascotas', name: 'Mascotas', emoji: '🐶', color: p[7], kind: 'expense' },
  { id: 'cat-lujo', name: 'Lujo', emoji: '💎', color: p[4], kind: 'expense' },
  { id: 'cat-suscripciones', name: 'Suscripciones', emoji: '📱', color: p[9], kind: 'expense' },
  { id: 'cat-otros', name: 'Otros', emoji: '📦', color: p[8], kind: 'expense' },
  { id: 'cat-salario', name: 'Salario', emoji: '💰', color: p[6], kind: 'income' },
  { id: 'cat-otros-ingresos', name: 'Otros ingresos', emoji: '💵', color: p[0], kind: 'income' },
];
