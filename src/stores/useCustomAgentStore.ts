import { create } from 'zustand';
import { CustomAgent } from '@/types';

interface CustomAgentState {
  customAgents: CustomAgent[];
  setCustomAgents: (agents: CustomAgent[]) => void;
  addCustomAgent: (agent: CustomAgent) => void;
  updateCustomAgent: (id: string, agent: CustomAgent) => void;
  removeCustomAgent: (id: string) => void;
}

export const useCustomAgentStore = create<CustomAgentState>((set) => ({
  customAgents: [],
  setCustomAgents: (agents) => set({ customAgents: agents }),
  addCustomAgent: (agent) => set((state) => ({ customAgents: [...state.customAgents, agent] })),
  updateCustomAgent: (id, agent) =>
    set((state) => ({
      customAgents: state.customAgents.map((a) => (a.id === id ? agent : a)),
    })),
  removeCustomAgent: (id) =>
    set((state) => ({
      customAgents: state.customAgents.filter((a) => a.id !== id),
    })),
}));
