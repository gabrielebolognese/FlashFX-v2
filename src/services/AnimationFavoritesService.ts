import { supabase } from '../lib/supabase';

export interface AnimationFavorite {
  id: string;
  user_id: string;
  animation_id: string;
  created_at: string;
}

class AnimationFavoritesService {
  async getFavorites(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('animation_favorites')
      .select('animation_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching favorites:', error);
      return [];
    }

    return data?.map(f => f.animation_id) || [];
  }

  async addFavorite(userId: string, animationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('animation_favorites')
      .insert({ user_id: userId, animation_id: animationId });

    if (error) {
      console.error('Error adding favorite:', error);
      return false;
    }

    return true;
  }

  async removeFavorite(userId: string, animationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('animation_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('animation_id', animationId);

    if (error) {
      console.error('Error removing favorite:', error);
      return false;
    }

    return true;
  }

  async isFavorite(userId: string, animationId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('animation_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('animation_id', animationId)
      .maybeSingle();

    if (error) {
      console.error('Error checking favorite:', error);
      return false;
    }

    return !!data;
  }
}

export const animationFavoritesService = new AnimationFavoritesService();
