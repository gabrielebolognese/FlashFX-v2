import { exportDecodingSchemas } from '../../schema';

export * from './prompt';
export * from './request';
export * from './client';
export * from './director';
export * from './testDescriptions';

/** The DirectorOutput JSON schema for the forced tool, at the FROZEN DECODE_CAPS (so the tool
 *  definition — and thus the prompt-cache prefix — is identical on every call). */
export function directorToolSchema(): Record<string, unknown> {
  return exportDecodingSchemas().directorOutput;
}
