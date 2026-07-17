export type PipelineStage =
  | 'idle'
  | 'validating'
  | 'high-level'
  | 'low-level'
  | 'placing'
  | 'complete'
  | 'error';

export type ValidationStatus = 'pending' | 'accepted' | 'rejected' | null;

export interface ValidationResponse {
  accepted: boolean;
  rawResponse: string;
  timestamp: string;
}

export interface HighLevelShape {
  type: 'rectangle' | 'circle' | 'text' | 'line' | 'button';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  content?: string;
}

export interface LowLevelShapeSettings {
  style: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    opacity: number;
    borderRadius: number;
    useGradientFill?: boolean;
    gradientType?: 'linear' | 'radial';
    gradientColors?: Array<{ color: string; position: number }>;
    gradientAngle?: number;
  };
  dimensions: {
    width: number;
    height: number;
  };
  scale: {
    x: number;
    y: number;
    uniform: boolean;
  };
  rotation: {
    angle: number;
  };
  timing?: {
    startTime: number;
    endTime: number;
  };
  text?: {
    content: string;
    fontSize: number;
    fontWeight: string;
    fontFamily: string;
    textColor: string;
    textAlign: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
  };
  line?: {
    lineType: 'line' | 'arrow' | 'pen';
    arrowStart: boolean;
    arrowEnd: boolean;
    arrowheadType: 'triangle' | 'circle' | 'bar' | 'diamond';
    arrowheadSize: number;
    lineCap: 'round' | 'butt' | 'square';
    lineJoin: 'round' | 'bevel' | 'miter';
    dashArray: number[];
  };
}

export interface LowLevelShape {
  name: string;
  version: string;
  timestamp: string;
  shapeType: string;
  settings: LowLevelShapeSettings;
}

export interface GenerationProgress {
  current: number;
  total: number;
  currentElement?: string;
  estimatedTimeRemaining?: number;
}

export interface PipelineError {
  stage: PipelineStage;
  message: string;
  code?: string;
  details?: any;
  timestamp: string;
  recoverable: boolean;
}

export interface GenerationStageData {
  validation?: {
    status: 'accepted' | 'rejected';
    rawResponse: string;
    timestamp: string;
  };
  highLevel?: {
    shapes: HighLevelShape[];
    rawResponse: string;
    timestamp: string;
  };
  lowLevel?: {
    shapes: LowLevelShape[];
    failedIndices: number[];
    timestamp: string;
  };
  placement?: {
    elementIds: string[];
    failed: number[];
    timestamp: string;
  };
}

export interface GenerationPipeline {
  id: string;
  timestamp: string;
  userPrompt: string;
  stages: GenerationStageData;
  status: 'complete' | 'partial' | 'failed' | 'in-progress';
  errorLog: PipelineError[];
  metadata?: {
    totalElements: number;
    successfulElements: number;
    processingTimeMs: number;
  };
}

export interface OpenAIThreadMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenAIRunStatus {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'requires_action';
  error?: {
    code: string;
    message: string;
  };
}
