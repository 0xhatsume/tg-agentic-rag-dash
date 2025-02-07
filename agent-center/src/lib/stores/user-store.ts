import { create } from 'zustand';
import { User } from '@supabase/supabase-js';

interface UserProfile {
  username: string;
  email: string;
  avatar_url?: string | null;
}

interface UserState {
  user: User | null;
  profile: UserProfile | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
})); 