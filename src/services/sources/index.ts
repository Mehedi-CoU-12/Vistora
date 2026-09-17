import { registerSource } from '../streamResolver';
import { movieboxStreamSource } from './movieboxStream';
import { storedStreamSource } from './storedStream';

export function installStreamSources(): void {
  registerSource(storedStreamSource);
  registerSource(movieboxStreamSource);
}
