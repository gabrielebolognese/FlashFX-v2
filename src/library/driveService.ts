import type { DriveListResponse, DriveDownloadResponse, DriveSearchResponse } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/drive-assets`;

const ROOT_FOLDER_ID = '1B9QPPiE0zz4hBLsh9FeGvThSQgzoN_15';

async function callDriveFunction(params: Record<string, string>): Promise<Response> {
  const url = new URL(FUNCTION_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res;
}

export async function listDriveFolder(
  folderId: string = 'root',
  pageToken?: string
): Promise<DriveListResponse> {
  const params: Record<string, string> = { action: 'list', folderId };
  if (pageToken) params.pageToken = pageToken;
  const res = await callDriveFunction(params);
  return res.json();
}

export async function searchDriveAssets(
  query: string,
  pageToken?: string
): Promise<DriveSearchResponse> {
  const params: Record<string, string> = {
    action: 'search',
    query,
    rootFolderId: ROOT_FOLDER_ID,
  };
  if (pageToken) params.pageToken = pageToken;
  const res = await callDriveFunction(params);
  return res.json();
}

export async function getDriveDownloadInfo(fileId: string): Promise<DriveDownloadResponse> {
  const res = await callDriveFunction({ action: 'download', fileId });
  return res.json();
}

export function getDriveStreamUrl(fileId: string): string {
  const url = new URL(FUNCTION_URL);
  url.searchParams.set('action', 'stream');
  url.searchParams.set('fileId', fileId);
  return url.toString();
}
