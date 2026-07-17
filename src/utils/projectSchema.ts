import Ajv, { JSONSchemaType } from 'ajv';
import { ProjectFile } from '../types/project';

// AJV-compatible JSON Schema for ProjectFile validation
export const projectJsonSchema: JSONSchemaType<ProjectFile> = {
  type: 'object',
  properties: {
    proj_id: { type: 'string', minLength: 1 },
    name: { type: 'string', nullable: true },
    schemaVersion: { type: 'number', minimum: 1 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    author: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', nullable: true }
      },
      required: ['id'],
      additionalProperties: false,
      nullable: true
    },
    canvas: {
      type: 'object',
      properties: {
        width: { type: 'number', minimum: 1 },
        height: { type: 'number', minimum: 1 },
        fps: { type: 'number', minimum: 1, maximum: 120, nullable: true },
        background: { type: 'string', nullable: true },
        unit: { type: 'string', enum: ['px', 'percent'], nullable: true },
        grid: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            size: { type: 'number', minimum: 1 },
            snap: { type: 'boolean' }
          },
          required: ['enabled', 'size', 'snap'],
          additionalProperties: false,
          nullable: true
        }
      },
      required: ['width', 'height'],
      additionalProperties: false
    },
    elements: {
      type: 'object',
      properties: {
        byId: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              // Shape validation - basic structure (detailed validation in runtime)
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                name: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number', minimum: 0 },
                height: { type: 'number', minimum: 0 }
              },
              required: ['id', 'type', 'name', 'x', 'y', 'width', 'height'],
              additionalProperties: true // Allow additional shape properties
            }
          },
          additionalProperties: false
        },
        order: {
          type: 'array',
          items: { type: 'string' }
        },
        groups: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string', nullable: true },
                children: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              required: ['id', 'children'],
              additionalProperties: false
            }
          },
          additionalProperties: false,
          nullable: true
        }
      },
      required: ['byId', 'order'],
      additionalProperties: false
    },
    animations: {
      type: 'object',
      properties: {
        byId: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string', nullable: true },
                type: { type: 'string', enum: ['opacity', 'transform', 'scale', 'rotate', 'color'] },
                elementId: { type: 'string' },
                duration: { type: 'number', minimum: 0 }
              },
              required: ['id', 'type', 'elementId', 'duration'],
              additionalProperties: true
            }
          },
          additionalProperties: false
        },
        order: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        }
      },
      required: ['byId'],
      additionalProperties: false,
      nullable: true
    },
    assets: {
      type: 'object',
      properties: {
        images: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              properties: {
                id: { type: 'string' },
                src: { type: 'string' },
                name: { type: 'string', nullable: true },
                width: { type: 'number', nullable: true },
                height: { type: 'number', nullable: true }
              },
              required: ['id', 'src'],
              additionalProperties: false
            }
          },
          additionalProperties: false,
          nullable: true
        },
        audio: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              properties: {
                id: { type: 'string' },
                src: { type: 'string' },
                duration: { type: 'number', nullable: true }
              },
              required: ['id', 'src'],
              additionalProperties: false
            }
          },
          additionalProperties: false,
          nullable: true
        },
        fonts: {
          type: 'object',
          patternProperties: {
            '^.*$': {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                family: { type: 'string' }
              },
              required: ['id', 'name', 'family'],
              additionalProperties: false
            }
          },
          additionalProperties: false,
          nullable: true
        }
      },
      additionalProperties: false,
      nullable: true
    },
    settings: {
      type: 'object',
      properties: {
        defaultEasing: { type: 'string', nullable: true },
        exportDefaults: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['webm', 'mp4'] },
            quality: { type: 'number', minimum: 0, maximum: 1, nullable: true }
          },
          required: ['format'],
          additionalProperties: false,
          nullable: true
        },
        autosaveIntervalMs: { type: 'number', minimum: 1000, nullable: true },
        editor: {
          type: 'object',
          properties: {
            gridSnap: { type: 'boolean', nullable: true },
            showRulers: { type: 'boolean', nullable: true }
          },
          additionalProperties: false,
          nullable: true
        }
      },
      additionalProperties: false,
      nullable: true
    },
    metadata: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        },
        description: { type: 'string', nullable: true },
        thumbnail: { type: 'string', nullable: true },
        protected: { type: 'boolean', nullable: true },
        versionLabel: { type: 'string', nullable: true }
      },
      additionalProperties: false,
      nullable: true
    },
    changeLog: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ts: { type: 'string', format: 'date-time' },
          authorId: { type: 'string', nullable: true },
          summary: { type: 'string' },
          diff: { type: ['string', 'number', 'boolean', 'array', 'object', 'null'], nullable: true } // Allow any type for diff
        },
        required: ['id', 'ts', 'summary'],
        additionalProperties: false
      },
      nullable: true
    },
    sync: {
      type: 'object',
      properties: {
        remoteId: { type: 'string', nullable: true },
        lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
        revision: { type: 'number', nullable: true }
      },
      additionalProperties: false,
      nullable: true
    }
  },
  required: ['proj_id', 'schemaVersion', 'createdAt', 'updatedAt', 'canvas', 'elements'],
  additionalProperties: false
};

// Create AJV validator instance
export const createProjectValidator = () => {
  const ajv = new Ajv({ 
    allErrors: true,
    verbose: true,
    strictSchema: false,
    formats: {
      // Add custom date-time format if needed
      'date-time': true
    }
  });
  
  return ajv.compile(projectJsonSchema);
};

// Constants
export const CURRENT_SCHEMA_VERSION = 1;
export const MAX_PROJECT_SIZE_MB = 10;
export const MAX_ELEMENTS_COUNT = 20000;
export const PROJECT_FILE_EXTENSION = '.flashfx.json';

// Utility functions for validation
export const validateProjectSize = (jsonString: string): boolean => {
  const sizeMB = new Blob([jsonString]).size / (1024 * 1024);
  return sizeMB <= MAX_PROJECT_SIZE_MB;
};

export const validateElementsCount = (project: ProjectFile): boolean => {
  const elementCount = Object.keys(project.elements.byId).length;
  return elementCount <= MAX_ELEMENTS_COUNT;
};

export const sanitizeAssetUrl = (url: string): string => {
  // Prevent javascript: and other dangerous protocols
  if (url.startsWith('javascript:') || url.startsWith('data:text/html')) {
    return '';
  }
  
  // Limit data URI length for thumbnails
  if (url.startsWith('data:') && url.length > 100000) { // 100KB limit
    return '';
  }
  
  return url;
};