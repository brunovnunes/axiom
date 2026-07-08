import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { LabelProfile } from './LabelProfile.js';

const LabelProfileSchema = z.object({
  name: z.string(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  dpi: z.number().positive(),
  description: z.string().optional(),
});

export const ConfigSchema = z.object({
  defaultPrinter: z.string().default(''),
  renderer: z.enum(['local']).default('local'),
  autoPrint: z.boolean().default(true),
  shopeeRasterScale: z.number().int().min(1).max(10).default(3),
  workspace: z.string().default('./data'),
  labelProfiles: z.record(LabelProfileSchema).optional(),
  autoDetectProfile: z.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

let currentConfig: Config | null = null;

export function loadConfig(configPath = 'config.json'): Config {
  const resolvedPath = path.resolve(configPath);
  
  if (!fs.existsSync(resolvedPath)) {
    // Generate default configuration file
    const defaultConfig = ConfigSchema.parse({});
    fs.writeFileSync(resolvedPath, JSON.stringify(defaultConfig, null, 4), 'utf-8');
    currentConfig = defaultConfig;
    return defaultConfig;
  }

  try {
    const rawData = fs.readFileSync(resolvedPath, 'utf-8');
    const parsedData = JSON.parse(rawData);
    const validated = ConfigSchema.parse(parsedData);
    currentConfig = validated;
    return validated;
  } catch (error) {
    console.error(`Failed to load config from ${resolvedPath}, falling back to defaults:`, error);
    const fallback = ConfigSchema.parse({});
    currentConfig = fallback;
    return fallback;
  }
}

export function getConfig(): Config {
  if (!currentConfig) {
    return loadConfig();
  }
  return currentConfig;
}

/**
 * Get label profiles from config (with defaults if not specified)
 */
export function getLabelProfiles(): Record<string, LabelProfile> {
  const config = getConfig();
  
  if (config.labelProfiles) {
    return config.labelProfiles as Record<string, LabelProfile>;
  }

  // Return default profiles if none configured
  return {
    marketplace_10x15: {
      name: 'Marketplace 10×15cm',
      widthMm: 100,
      heightMm: 150,
      dpi: 203,
      description: 'Marketplace labels (Shopee, Mercado Livre)',
    },
    mlb_40x25: {
      name: 'MLB 40×25mm',
      widthMm: 40,
      heightMm: 25,
      dpi: 203,
      description: 'Mercado Libre small label',
    },
    default: {
      name: 'Default Profile',
      widthMm: 101.6,
      heightMm: 152.4,
      dpi: 203,
      description: '4×6 inch standard',
    },
  };
}
