export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  thumbnail: string | null;
  modifiedAt: string | null;
  path?: string;
}

export interface DriveListResponse {
  items: DriveItem[];
  nextPageToken: string | null;
}

export interface DriveSearchResponse {
  items: DriveItem[];
  nextPageToken: string | null;
}

export interface DriveDownloadResponse {
  url: string;
  name: string;
  mimeType: string;
  size: number | null;
}

export interface AssetFolder {
  id: string;
  name: string;
  parent_id: string | null;
  folder_type: 'images' | 'videos' | 'audio' | 'all';
  color: string;
  sort_order: number;
  created_at: string;
}

export interface AssetFolderItem {
  id: string;
  folder_id: string;
  asset_id: string;
  added_at: string;
}
