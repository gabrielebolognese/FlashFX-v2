import { GenerationPipeline, GenerationStageData } from '../types/aiPipeline';

const STORAGE_KEY = 'flashfx_ai_generations';
const MAX_STORED_GENERATIONS = 20;

export class GenerationStorageService {
  static generatePipelineId(): string {
    return `generation_pipeline_${Date.now()}`;
  }

  static createNewPipeline(userPrompt: string): GenerationPipeline {
    return {
      id: this.generatePipelineId(),
      timestamp: new Date().toISOString(),
      userPrompt,
      stages: {},
      status: 'in-progress',
      errorLog: [],
    };
  }

  static saveGenerationPipeline(pipeline: GenerationPipeline): void {
    try {
      const stored = this.loadAllGenerations();
      const existingIndex = stored.findIndex(p => p.id === pipeline.id);

      if (existingIndex >= 0) {
        stored[existingIndex] = pipeline;
      } else {
        stored.unshift(pipeline);
      }

      const limited = stored.slice(0, MAX_STORED_GENERATIONS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));

      console.log(`[Storage] Saved generation pipeline: ${pipeline.id}`);
    } catch (error) {
      console.error('[Storage] Failed to save generation pipeline:', error);
    }
  }

  static loadGenerationPipeline(pipelineId: string): GenerationPipeline | null {
    try {
      const stored = this.loadAllGenerations();
      const pipeline = stored.find(p => p.id === pipelineId);
      return pipeline || null;
    } catch (error) {
      console.error('[Storage] Failed to load generation pipeline:', error);
      return null;
    }
  }

  static loadAllGenerations(): GenerationPipeline[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('[Storage] Failed to load generations:', error);
      return [];
    }
  }

  static deleteGeneration(pipelineId: string): void {
    try {
      const stored = this.loadAllGenerations();
      const filtered = stored.filter(p => p.id !== pipelineId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      console.log(`[Storage] Deleted generation: ${pipelineId}`);
    } catch (error) {
      console.error('[Storage] Failed to delete generation:', error);
    }
  }

  static clearOldGenerations(): void {
    try {
      const stored = this.loadAllGenerations();
      const limited = stored.slice(0, MAX_STORED_GENERATIONS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
      console.log(`[Storage] Cleaned up old generations, keeping ${limited.length}`);
    } catch (error) {
      console.error('[Storage] Failed to clear old generations:', error);
    }
  }

  static exportGeneration(pipelineId: string): string {
    const pipeline = this.loadGenerationPipeline(pipelineId);
    if (!pipeline) {
      throw new Error('Generation not found');
    }
    return JSON.stringify(pipeline, null, 2);
  }

  static getGenerationStats(): {
    total: number;
    completed: number;
    failed: number;
    partial: number;
  } {
    const generations = this.loadAllGenerations();
    return {
      total: generations.length,
      completed: generations.filter(g => g.status === 'complete').length,
      failed: generations.filter(g => g.status === 'failed').length,
      partial: generations.filter(g => g.status === 'partial').length,
    };
  }

  static updatePipelineStage(
    pipelineId: string,
    stageData: Partial<GenerationStageData>
  ): void {
    const pipeline = this.loadGenerationPipeline(pipelineId);
    if (!pipeline) {
      console.warn(`[Storage] Pipeline ${pipelineId} not found for update`);
      return;
    }

    pipeline.stages = {
      ...pipeline.stages,
      ...stageData,
    };

    this.saveGenerationPipeline(pipeline);
  }

  static updatePipelineStatus(
    pipelineId: string,
    status: GenerationPipeline['status'],
    metadata?: GenerationPipeline['metadata']
  ): void {
    const pipeline = this.loadGenerationPipeline(pipelineId);
    if (!pipeline) {
      console.warn(`[Storage] Pipeline ${pipelineId} not found for status update`);
      return;
    }

    pipeline.status = status;
    if (metadata) {
      pipeline.metadata = metadata;
    }

    this.saveGenerationPipeline(pipeline);
  }

  static addPipelineError(pipelineId: string, error: GenerationPipeline['errorLog'][0]): void {
    const pipeline = this.loadGenerationPipeline(pipelineId);
    if (!pipeline) {
      console.warn(`[Storage] Pipeline ${pipelineId} not found for error logging`);
      return;
    }

    pipeline.errorLog.push(error);
    this.saveGenerationPipeline(pipeline);
  }
}
