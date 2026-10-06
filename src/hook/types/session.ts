export const HOOK_STATE_DIR_NAME = 'ambicode-hook-state';

export interface DeliveryKey {
  epoch: string;
  agentKey: string;
  kind: 'edit-reminder' | 'shared-contract' | 'ticket-prepare' | 'route-step';
  subject: string;
  contentHash: string;
}
