'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useUserStore } from '@/lib/stores/user-store';
import { Database } from '@/lib/types';

interface SupabaseContextType {
  supabase: ReturnType<typeof createClientComponentClient<Database>>;
  isPasswordChangeInProgress: boolean;
  setIsPasswordChangeInProgress: (inProgress: boolean) => void;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const setUser = useUserStore(state => state.setUser);
  const setProfile = useUserStore(state => state.setProfile);
  const [isPasswordChangeInProgress, setIsPasswordChangeInProgress] = useState(false);
  const user = useUserStore(state => state.user);

  // Initial session check - runs once on mount
  useEffect(() => {
    const initSession = async () => {
      console.log('Initializing session...');
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    
    initSession();
  }, [supabase, setUser]);

  // Profile fetching effect
  useEffect(() => {
    const fetchProfile = async () => {
      if (user?.id) {
        console.log('Fetching profile for user:', user.id);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('username, email, avatar_url')
          .eq('id', user.id)
          .single();
          
        if (error) {
          console.error('Error fetching profile:', error);
          return;
        }
        
        console.log('Fetched profile:', profile);
        setProfile(profile);
      } else {
        setProfile(null);
      }
    };

    fetchProfile();
  }, [user, supabase, setProfile]);

  // Auth state change listener
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      setUser(session?.user ?? null);
      
      if (event === 'SIGNED_IN') {
        //toast.success('User successfully signed in!');
        console.log('User successfully signed in!');
        router.refresh();
      }
      if (event === 'SIGNED_OUT') {
        toast.success('Successfully signed out!');
        router.refresh();
      }
      if (event === 'USER_UPDATED') {
        if (isPasswordChangeInProgress) {
          toast.success('Password updated successfully!');
          setIsPasswordChangeInProgress(false);
        } else {
          toast.success('Your account has been updated successfully!');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router, setUser, isPasswordChangeInProgress]);

  const value = {
    supabase,
    isPasswordChangeInProgress,
    setIsPasswordChangeInProgress,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
}; 