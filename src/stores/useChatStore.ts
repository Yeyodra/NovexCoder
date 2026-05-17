import { create } from 'zustand';
import { Message, ChatToolCall } from '@/types';

interface ChatState {
  // Existing
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  appendStreamToken: (token: string) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearStreaming: () => void;

  // Tool call state
  toolCalls: Record<string, ChatToolCall[]>;
  addToolCall: (messageId: string, toolCall: ChatToolCall) => void;
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ChatToolCall>) => void;
  setToolCalls: (messageId: string, toolCalls: ChatToolCall[]) => void;
  clearToolCalls: (messageId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  // Existing state
  messages: [],
  streamingText: '',
  isStreaming: false,
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  appendStreamToken: (token) => set((state) => ({ streamingText: state.streamingText + token })),
  setStreaming: (isStreaming) => set({ isStreaming }),
  clearStreaming: () => set({ streamingText: '', isStreaming: false }),

  // Tool call state
  toolCalls: {},
  addToolCall: (messageId, toolCall) => set((state) => ({
    toolCalls: {
      ...state.toolCalls,
      [messageId]: [...(state.toolCalls[messageId] || []), toolCall],
    },
  })),
  updateToolCall: (messageId, toolCallId, updates) => set((state) => ({
    toolCalls: {
      ...state.toolCalls,
      [messageId]: (state.toolCalls[messageId] || []).map((tc) =>
        tc.id === toolCallId ? { ...tc, ...updates } : tc
      ),
    },
  })),
  setToolCalls: (messageId, toolCalls) => set((state) => ({
    toolCalls: {
      ...state.toolCalls,
      [messageId]: toolCalls,
    },
  })),
  clearToolCalls: (messageId) => set((state) => {
    const { [messageId]: _, ...rest } = state.toolCalls;
    return { toolCalls: rest };
  }),
}));
