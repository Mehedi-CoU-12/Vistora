import { registerSource } from '../streamResolver';
import { storedStreamSource } from './storedStream';





































export function installStreamSources(): void {
  
  
  
  

  
  
  registerSource(storedStreamSource);
}
