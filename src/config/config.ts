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
  role: z.enum(['orchestrator', 'print_node', 'standalone']).default('standalone'),
  orchestratorUrl: z.string().default('http://localhost:3000'),
  nodeUrl: z.string().optional(),
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
    
    // Override role if CLI arguments are provided
    const args = process.argv.slice(2);
    if (args.includes('--orchestrator')) {
      defaultConfig.role = 'orchestrator';
    } else if (args.includes('--standalone')) {
      defaultConfig.role = 'standalone';
    } else if (args.includes('--print-node') || args.includes('--node')) {
      defaultConfig.role = 'print_node';
    }

    // Check for --url or --orchestrator-url
    const urlIndex = args.findIndex(arg => arg === '--url' || arg === '--orchestrator-url');
    if (urlIndex !== -1 && args.length > urlIndex + 1) {
      defaultConfig.orchestratorUrl = args[urlIndex + 1];
    }

    const nodeUrlIndex = args.findIndex(arg => arg === '--node-url');
    if (nodeUrlIndex !== -1 && args.length > nodeUrlIndex + 1) {
      defaultConfig.nodeUrl = args[nodeUrlIndex + 1];
    }

    currentConfig = defaultConfig;
    return defaultConfig;
  }

  try {
    const rawData = fs.readFileSync(resolvedPath, 'utf-8');
    const parsedData = JSON.parse(rawData);
    const validated = ConfigSchema.parse(parsedData);
    
    // Override role if CLI arguments are provided
    const args = process.argv.slice(2);
    if (args.includes('--orchestrator')) {
      validated.role = 'orchestrator';
    } else if (args.includes('--standalone')) {
      validated.role = 'standalone';
    } else if (args.includes('--print-node') || args.includes('--node')) {
      validated.role = 'print_node';
    }
    
    // Check for --url or --orchestrator-url
    const urlIndex = args.findIndex(arg => arg === '--url' || arg === '--orchestrator-url');
    if (urlIndex !== -1 && args.length > urlIndex + 1) {
      validated.orchestratorUrl = args[urlIndex + 1];
    }
    
    const nodeUrlIndex = args.findIndex(arg => arg === '--node-url');
    if (nodeUrlIndex !== -1 && args.length > nodeUrlIndex + 1) {
      validated.nodeUrl = args[nodeUrlIndex + 1];
    }
    
    currentConfig = validated;
    return validated;
  } catch (error) {
    console.error(`Failed to load config from ${resolvedPath}, falling back to defaults:`, error);
    const fallback = ConfigSchema.parse({});
    
    // Override role if CLI arguments are provided
    const args = process.argv.slice(2);
    if (args.includes('--orchestrator')) {
      fallback.role = 'orchestrator';
    } else if (args.includes('--standalone')) {
      fallback.role = 'standalone';
    } else if (args.includes('--print-node') || args.includes('--node')) {
      fallback.role = 'print_node';
    }

    // Check for --url or --orchestrator-url
    const urlIndex = args.findIndex(arg => arg === '--url' || arg === '--orchestrator-url');
    if (urlIndex !== -1 && args.length > urlIndex + 1) {
      fallback.orchestratorUrl = args[urlIndex + 1];
    }

    const nodeUrlIndex = args.findIndex(arg => arg === '--node-url');
    if (nodeUrlIndex !== -1 && args.length > nodeUrlIndex + 1) {
      fallback.nodeUrl = args[nodeUrlIndex + 1];
    }

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
