import { exportDecodingSchemas } from '../../schema';

export * from './request';
export * from './prompt';
export * from './coder';

/** The CoderFragment JSON schema for the forced tool, at the FROZEN DECODE_CAPS (so the tool
 *  definition — and thus the prompt-cache prefix — is identical on every call). */
export function coderToolSchema(): Record<string, unknown> {
  return exportDecodingSchemas().coderFragment;
}
