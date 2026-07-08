export interface PipelineContext {
  jobId: string;
  // Path to the active file being processed in this step
  currentFilePath: string;
  // Detected marketplace plugin name, if any
  detectedPlugin?: string;
}

export interface PipelineStep {
  name: string;
  execute(context: PipelineContext): Promise<PipelineContext>;
}
