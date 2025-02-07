'use client';
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserStore } from "@/lib/stores/user-store";
import { useSupabase } from "./supabase-provider";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

export function UserAvatar() {
  const { profile } = useUserStore();
  const setUser = useUserStore(state => state.setUser);
  const setProfile = useUserStore(state => state.setProfile);
  const supabase = useSupabase();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      console.log('Signing out...');
      const { error } = await supabase.auth.signOut();
      console.log('Sign out error:', error);
      if (error) throw error;
      
      // Clear user state
      setUser(null);
      setProfile(null);
      
      router.push('/');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  useEffect(() => {
    console.log('UserAvatar profile:', profile); // Debug log
  }, [profile]);

  // if (!profile) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Avatar className="border border-primary">
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback>
            {profile?.username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{profile?.username}</p>
            <p className="text-xs leading-none text-muted-foreground">{profile?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/settings')} className="cursor-pointer">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-red-600">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 