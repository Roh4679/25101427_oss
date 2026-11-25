import { devRules } from './dev.ts';
import { personalRules } from './personal.ts';
import { sensitiveRules } from './sensitive.ts';

export const rules = [...personalRules, ...devRules, ...sensitiveRules];
