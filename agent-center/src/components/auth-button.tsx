'use client';

import { useState } from 'react';
import { useSupabase } from './supabase-provider';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useUserStore } from '@/lib/stores/user-store';
import { UserAvatar } from './user-avatar';

export function AuthButton() {
  const supabase = useSupabase();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const user = useUserStore(state => state.user);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateUsername = (username: string) => {
    return username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
  };

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Check if input is email or username
      const isEmail = validateEmail(email);
      let signinEmail = email;

      if (!isEmail) {
        // If not an email, assume it's a username and get the email
        const { data: userData, error: userError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', email)  // Using email state for both email/username
          .single();

        if (userError || !userData) {
          throw new Error('Account not found');
        }
        signinEmail = userData.email;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: signinEmail,
        password,
      });

      if (error) throw error;

      toast.success("You've been signed in!");
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    console.log('Starting sign up process...'); // Debug log

    try {
      if (!validateEmail(email)) {
        throw new Error('Please enter a valid email address');
      }
      if (!validateUsername(username)) {
        throw new Error('Username must be 3-20 characters long and contain only letters, numbers, and underscores');
      }
      if (!validatePassword(password)) {
        throw new Error('Password must be at least 6 characters long');
      }

      console.log('Checking username availability...'); // Debug log
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
        throw new Error('Error checking username availability');
      }

      if (existingUser) {
        throw new Error('Username is already taken');
      }

      console.log('Creating auth user...'); // Debug log
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            username,
          }
        },
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('No user data returned');

      console.log('Creating profile...'); // Debug log
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            id: data.user.id,
            username,
            email,
            avatar_url: null
          }
        ]);

      if (profileError) {
        // If profile creation fails, we should clean up the auth user
        await supabase.auth.signOut();
        throw new Error('Failed to create profile. Please try again.');
      }

      // Check if email confirmation is required
      if (data.user.identities?.length === 0) {
        toast.success(
          "Account created! Please check your email to confirm your account. You'll be able to sign in after confirmation.", 
          {
            duration: 6000,
            icon: '📧',
          }
        );
      } else {
        toast.success(
          "Account created successfully! You can now sign in.", 
          {
            duration: 5000,
            icon: '✅',
          }
        );
      }

      setIsDialogOpen(false);
      setEmail('');
      setUsername('');
      setPassword('');

    } catch (error) {
      console.error('Sign up error:', error); // Debug log
      toast.error(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return user ? (
    <UserAvatar />
  ) : (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          className="bg-secondary hover:bg-secondary/90 text-white"
        >
          Register / Sign In
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] border-accent/20">
        <DialogHeader>
          <DialogTitle className="text-primary text-xl">Welcome</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary/10">
            <TabsTrigger 
              value="signin"
              className="data-[state=active]:bg-secondary data-[state=active]:text-white"
            >
              Sign In
            </TabsTrigger>
            <TabsTrigger 
              value="signup"
              className="data-[state=active]:bg-secondary data-[state=active]:text-white"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-identifier">Username or Email</Label>
                <Input
                  id="signin-identifier"
                  type="text"
                  value={email}  // We'll use the email state for both
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your username or email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-accent hover:bg-accent/90 text-white" 
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              
              <div className="space-y-2">
                <Label htmlFor="signup-username">Username</Label>
                <Input
                  id="signup-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-accent hover:bg-accent/90 text-white" 
                disabled={isLoading}
              >
                {isLoading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
} 