import { supabase } from '../lib/supabase';
import type { AssetFolder, AssetFolderItem } from './types';

export async function fetchFolders(folderType?: string): Promise<AssetFolder[]> {
  if (!supabase) return [];
  let query = supabase.from('asset_folders').select('*').order('sort_order', { ascending: true });
  if (folderType && folderType !== 'all') {
    query = query.or(`folder_type.eq.${folderType},folder_type.eq.all`);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch folders:', error);
    return [];
  }
  return data || [];
}

export async function createFolder(
  name: string,
  folderType: string = 'all',
  parentId?: string,
  color?: string
): Promise<AssetFolder | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('asset_folders')
    .insert({
      name,
      folder_type: folderType,
      parent_id: parentId || null,
      color: color || '#f7b500',
    })
    .select()
    .maybeSingle();
  if (error) {
    console.error('Failed to create folder:', error);
    return null;
  }
  return data;
}

export async function renameFolder(id: string, name: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('asset_folders').update({ name }).eq('id', id);
  if (error) {
    console.error('Failed to rename folder:', error);
    return false;
  }
  return true;
}

export async function deleteFolder(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('asset_folders').delete().eq('id', id);
  if (error) {
    console.error('Failed to delete folder:', error);
    return false;
  }
  return true;
}

export async function addAssetToFolder(folderId: string, assetId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('asset_folder_items')
    .upsert({ folder_id: folderId, asset_id: assetId }, { onConflict: 'folder_id,asset_id' });
  if (error) {
    console.error('Failed to add asset to folder:', error);
    return false;
  }
  return true;
}

export async function removeAssetFromFolder(folderId: string, assetId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('asset_folder_items')
    .delete()
    .eq('folder_id', folderId)
    .eq('asset_id', assetId);
  if (error) {
    console.error('Failed to remove asset from folder:', error);
    return false;
  }
  return true;
}

export async function getFolderItems(folderId: string): Promise<AssetFolderItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('asset_folder_items')
    .select('*')
    .eq('folder_id', folderId)
    .order('added_at', { ascending: false });
  if (error) {
    console.error('Failed to fetch folder items:', error);
    return [];
  }
  return data || [];
}
