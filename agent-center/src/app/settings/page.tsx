'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/lib/stores/user-store';
import { useSupabase } from '@/components/supabase-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type ApiKey = Database['public']['Tables']['api_keys']['Row'];

export default function SettingsPage() {
  const { user, profile, setProfile } = useUserStore();
  const { supabase, isPasswordChangeInProgress, setIsPasswordChangeInProgress } = useSupabase();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) {
      router.push('/');
    }
  }, [user, router]);

  useEffect(() => {
    const loadApiKeys = async () => {
      if (!user) return;
      setIsLoadingKeys(true);
      try {
        const { data, error } = await supabase
          .from('api_keys')
          .select('*')
          .order('provider');
        
        if (error) throw error;
        setApiKeys(data || []);
      } catch (error) {
        console.error('Error loading API keys:', error);
        toast.error('Failed to load API keys');
      } finally {
        setIsLoadingKeys(false);
      }
    };

    loadApiKeys();
  }, [user, supabase]);

  const handleUpdateUsername = async () => {
    if (!user || !username.trim()) return;

    setIsLoading(true);
    try {
      // Check if username is taken
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .neq('id', user.id)
        .single();

      if (existingUser) {
        // toast here
        toast.error('Username is already taken');
        throw new Error('Username is already taken');
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username })
        .eq('id', user.id);

      // toast here
      if (error) {
        toast.error('Error updating username');
        throw error;
      }

      toast.success('Username updated successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error updating username');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }
    
    //setIsChangingPassword(true);
    try {
      console.log('Attempting to update password...');
      
      // Signal password change is starting
      setIsPasswordChangeInProgress(true);
      
      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }
      
    } catch (error) {
      console.error('Password update error:', error);
      toast.error(error instanceof Error ? error.message : 'Error updating password');
      setIsPasswordChangeInProgress(false);
      setIsLoading(false);
    } finally {
      console.log('Resetting isChangingPassword state');
      //setIsChangingPassword(false);
      setIsLoading(false);
    }
  };

  // Tracking Password Change and Refreshing the Page
  useEffect(() => {
      // Clear password fields
      setCurrentPassword('');
      setNewPassword('');
      setIsLoading(false);
  }, [
    //isChangingPassword
    isPasswordChangeInProgress
  ]);

  const handleSaveApiKey = async () => {
    if (!user || !selectedProvider || !apiKeyInput) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('api_keys')
        .upsert({
          user_id: user.id,
          provider: selectedProvider,
          api_key: apiKeyInput,
        }, {
          onConflict: 'user_id,provider'
        });

      if (error) throw error;

      toast.success('API key saved successfully');
      setApiKeyInput('');
      setSelectedProvider('');
      
      // Reload API keys
      const { data } = await supabase
        .from('api_keys')
        .select('*')
        .order('provider');
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error saving API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string, provider: string) => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;

      toast.success(`${provider} API key removed`);
      setApiKeys(apiKeys.filter(key => key.id !== keyId));
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to remove API key');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    try {
      // Upload to storage bucket
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('profile_pictures')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL with timestamp to bust cache
      const { data: { publicUrl } } = supabase.storage
        .from('profile_pictures')
        .getPublicUrl(filePath);

      // Add timestamp to URL to prevent caching
      const urlWithTimestamp = `${publicUrl}?t=${new Date().getTime()}`;

      // Update profile with cache-busting URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithTimestamp })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Get the updated profile and update the store
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('username, email, avatar_url')
        .eq('id', user.id)
        .single();
      
      if (updatedProfile) {
        setProfile(updatedProfile);  // Update the global store
      }

      toast.success('Profile picture updated');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to update profile picture');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarFile(null);
    }
  };

  if (!profile) return null;
  console.log("profile", profile);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="container max-w-2xl py-10 px-4">
        <Button 
          variant="ghost" 
          onClick={() => router.push('/')}
          className="mb-4 text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-primary">Account Settings</CardTitle>
            <CardDescription>
              Manage your account settings and preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>
                      {profile.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <label 
                    htmlFor="avatar-upload" 
                    className="absolute bottom-0 right-0 p-1 bg-secondary rounded-full cursor-pointer hover:bg-secondary/90"
                  >
                    <Upload className="h-4 w-4 text-white" />
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={isUploadingAvatar}
                  />
                </div>
                <div>
                  <h3 className="font-medium">Profile Picture</h3>
                  <p className="text-sm text-muted-foreground">
                    {isUploadingAvatar ? 'Uploading...' : 'Click the upload icon to change your picture'}
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label>Username</Label>
                <div className="flex gap-2">
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter new username"
                  />
                  <Button 
                    onClick={handleUpdateUsername} 
                    disabled={isLoading || username === profile.username}
                    className="bg-accent hover:bg-accent/90 text-white"
                  >
                    {isPasswordChangeInProgress ? 'Updating...' : 'Update'}
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium text-primary">Change Password</h3>
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                    <Button 
                      onClick={handleUpdatePassword}
                      disabled={isPasswordChangeInProgress || !(newPassword.length > 5 && currentPassword.length > 5)}
                      className="bg-accent hover:bg-accent/90 text-white whitespace-nowrap"
                    >
                      {isPasswordChangeInProgress ? 'Updating...' : 'Change Password'}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Password must be at least 6 characters long
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium text-primary">API Keys</h3>
                
                <div className="space-y-4">
                  <div className="grid gap-4">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="flex items-center justify-between p-3 border rounded-md">
                        <span className="font-medium">{key.provider}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground">
                            {key.api_key.substring(0, 4)}...{key.api_key.slice(-4)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteApiKey(key.id, key.provider)}
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label>Update your API Key</Label>
                    <div className="flex gap-2">
                      <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select Provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="google">Google AI</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Enter API Key"
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleSaveApiKey}
                        disabled={isLoading || !selectedProvider || !apiKeyInput}
                        className="bg-accent hover:bg-accent/90 text-white"
                      >
                        {isLoading ? "Saving..." : "Save Key"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 