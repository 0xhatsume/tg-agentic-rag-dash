import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

interface UserState {
  user: User | null;
  setUser: (user: User | null) => void;
  userSettings: {
    theme: string;
    newsPreferences: string[];
  };
  setUserSettings: (settings: { theme: string; newsPreferences: string[] }) => void;
}

export const useStore = create<UserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  userSettings: {
    theme: 'system',
    newsPreferences: [],
  },
  setUserSettings: (settings) => set({ userSettings: settings }),
})); 