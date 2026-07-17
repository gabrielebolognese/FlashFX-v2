import { supabase } from '../lib/supabase';

export interface CloudProject {
  id: string;
  user_id: string;
  project_name: string;
  description: string | null;
  file_size: number;
  thumbnail: string | null;
  schema_version: number;
  element_count: number;
  animation_count: number;
  tags: string[] | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface UploadProjectOptions {
  projectName: string;
  description?: string;
  fileBlob: Blob;
  thumbnail?: string;
  schemaVersion: number;
  elementCount: number;
  animationCount: number;
  tags?: string[];
  isPublic?: boolean;
}

export class CloudProjectService {
  public async uploadProject(options: UploadProjectOptions): Promise<CloudProject> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User must be authenticated to upload projects');
    }

    const arrayBuffer = await options.fileBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { data, error } = await supabase
      .from('project_files')
      .insert({
        user_id: user.id,
        project_name: options.projectName,
        description: options.description || null,
        file_data: uint8Array,
        file_size: options.fileBlob.size,
        thumbnail: options.thumbnail || null,
        schema_version: options.schemaVersion,
        element_count: options.elementCount,
        animation_count: options.animationCount,
        tags: options.tags || null,
        is_public: options.isPublic || false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upload project: ${error.message}`);
    }

    return data as CloudProject;
  }

  public async updateProject(
    projectId: string,
    options: Partial<UploadProjectOptions>
  ): Promise<CloudProject> {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (options.projectName) updateData.project_name = options.projectName;
    if (options.description !== undefined) updateData.description = options.description;
    if (options.thumbnail !== undefined) updateData.thumbnail = options.thumbnail;
    if (options.tags !== undefined) updateData.tags = options.tags;
    if (options.isPublic !== undefined) updateData.is_public = options.isPublic;

    if (options.fileBlob) {
      const arrayBuffer = await options.fileBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      updateData.file_data = uint8Array;
      updateData.file_size = options.fileBlob.size;
    }

    if (options.schemaVersion !== undefined) updateData.schema_version = options.schemaVersion;
    if (options.elementCount !== undefined) updateData.element_count = options.elementCount;
    if (options.animationCount !== undefined)
      updateData.animation_count = options.animationCount;

    const { data, error } = await supabase
      .from('project_files')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }

    return data as CloudProject;
  }

  public async downloadProject(projectId: string): Promise<Blob> {
    const { data, error } = await supabase
      .from('project_files')
      .select('file_data')
      .eq('id', projectId)
      .single();

    if (error) {
      throw new Error(`Failed to download project: ${error.message}`);
    }

    if (!data || !data.file_data) {
      throw new Error('Project file data not found');
    }

    const uint8Array = new Uint8Array(data.file_data);
    return new Blob([uint8Array], { type: 'application/octet-stream' });
  }

  public async listUserProjects(): Promise<CloudProject[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User must be authenticated to list projects');
    }

    const { data, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }

    return data as CloudProject[];
  }

  public async listPublicProjects(limit: number = 50): Promise<CloudProject[]> {
    const { data, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list public projects: ${error.message}`);
    }

    return data as CloudProject[];
  }

  public async deleteProject(projectId: string): Promise<void> {
    const { error } = await supabase.from('project_files').delete().eq('id', projectId);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  public async getProject(projectId: string): Promise<CloudProject> {
    const { data, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      throw new Error(`Failed to get project: ${error.message}`);
    }

    return data as CloudProject;
  }

  public async searchProjects(searchTerm: string): Promise<CloudProject[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User must be authenticated to search projects');
    }

    const { data, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('user_id', user.id)
      .or(`project_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to search projects: ${error.message}`);
    }

    return data as CloudProject[];
  }
}
