import { registerSource } from '../streamResolver';
import { storedStreamSource } from './storedStream';
import { externalStreamSource } from './externalStream';
import { movieboxStreamSource } from './movieboxStream';

export function installStreamSources(): void {
  registerSource(storedStreamSource);
  registerSource(externalStreamSource);
  registerSource(movieboxStreamSource);
}
