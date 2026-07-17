import { supabase } from '../lib/supabase';
import { Preset, PresetCreateInput, PresetUpdateInput } from '../types/preset';

export class PresetService {
  static async getUserPresets(userId: string): Promise<Preset[]> {
    const { data, error } = await supabase
      .from('presets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching presets:', error);
      throw error;
    }

    return data || [];
  }

  static async createPreset(userId: string, preset: PresetCreateInput): Promise<Preset> {
    const { data, error } = await supabase
      .from('presets')
      .insert({
        user_id: userId,
        name: preset.name,
        description: preset.description,
        elements: preset.elements,
        thumbnail: preset.thumbnail,
        element_count: preset.element_count
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating preset:', error);
      throw error;
    }

    return data;
  }

  static async updatePreset(presetId: string, updates: PresetUpdateInput): Promise<Preset> {
    const { data, error } = await supabase
      .from('presets')
      .update(updates)
      .eq('id', presetId)
      .select()
      .single();

    if (error) {
      console.error('Error updating preset:', error);
      throw error;
    }

    return data;
  }

  static async deletePreset(presetId: string): Promise<void> {
    const { error } = await supabase
      .from('presets')
      .delete()
      .eq('id', presetId);

    if (error) {
      console.error('Error deleting preset:', error);
      throw error;
    }
  }

  static exportPresetsToJSON(presets: Preset[]): string {
    const exportData = presets.map(preset => ({
      name: preset.name,
      description: preset.description,
      elements: preset.elements,
      element_count: preset.element_count,
      created_at: preset.created_at
    }));

    return JSON.stringify(exportData, null, 2);
  }

  static async importPresetsFromJSON(userId: string, jsonString: string): Promise<Preset[]> {
    try {
      const importedData = JSON.parse(jsonString);

      if (!Array.isArray(importedData)) {
        throw new Error('Invalid JSON format: expected an array of presets');
      }

      const createdPresets: Preset[] = [];

      for (const presetData of importedData) {
        if (!presetData.name || !presetData.elements) {
          console.warn('Skipping invalid preset:', presetData);
          continue;
        }

        const preset = await this.createPreset(userId, {
          name: presetData.name,
          description: presetData.description,
          elements: presetData.elements,
          element_count: presetData.element_count || presetData.elements.length
        });

        createdPresets.push(preset);
      }

      return createdPresets;
    } catch (error) {
      console.error('Error importing presets:', error);
      throw error;
    }
  }

  static savePresetsToLocalStorage(presets: Preset[]): void {
    try {
      const exportData = this.exportPresetsToJSON(presets);
      localStorage.setItem('design_presets', exportData);
    } catch (error) {
      console.error('Error saving presets to local storage:', error);
    }
  }

  static loadPresetsFromLocalStorage(): Preset[] {
    try {
      const storedData = localStorage.getItem('design_presets');
      if (!storedData) return [];

      return JSON.parse(storedData);
    } catch (error) {
      console.error('Error loading presets from local storage:', error);
      return [];
    }
  }
}
