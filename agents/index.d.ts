export type InvestorId = 'cto' | 'tech_bro' | 'interrogator' | 'sympathizer';
export interface CallOptions {
  mode: 'mock' | 'live';
  agentIds?: Partial<Record<InvestorId, string>>;
  textOnly?: boolean;
  getSignedUrl?: (role: InvestorId) => Promise<string>;
}
export interface InvestorCall {
  start(): Promise<{ kind: string }>;
  stop(): Promise<void>;
  setActiveAgent(id: InvestorId): void;
  setMicMuted(muted: boolean): void;
  simulateUtterance(text: string): unknown;
  onScoreUpdate(fn: (event: { scores: Record<InvestorId, number>; results?: Partial<Record<InvestorId, { reason: string }>> }) => void): () => void;
  onTranscript(fn: (event: { speaker: string; text: string }) => void): () => void;
  onAgentSpeaking(fn: (event: { agentId: string; speaking: boolean }) => void): () => void;
  onLeave(fn: (event: { agentId: InvestorId; reason: string }) => void): () => void;
  onOffer(fn: (event: { agentId: InvestorId; reason: string }) => void): () => void;
  onError(fn: (event: { error: unknown }) => void): () => void;
}
export function createInvestorCall(options: CallOptions): InvestorCall;
