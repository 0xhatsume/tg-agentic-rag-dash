'use client';

import { useEffect, useState } from 'react';
import { NavLinks } from '@/components/nav-links';
import { AuthButton } from '@/components/auth-button';
import { MobileNav } from '@/components/mobile-nav';
import { useSupabase } from '@/components/supabase-provider';
import { useUserStore } from '@/lib/stores/user-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

interface Agent {
  id: string;
  name: string;
  description: string;
  avatar_url: string | null;
}

interface AgentDetails {
  id: string;
  agent_id: string;
  system_prompt: string;
  bio: string[];
  lore: string[];
  topics: string[];
  adjectives: string[];
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  message_examples: any[];
  post_examples: string[];
}

export default function AgentsPage() {
  const { supabase } = useSupabase();
  const user = useUserStore(state => state.user);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isAddingAgent, setIsAddingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    description: '',
    avatar_url: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [agentDetails, setAgentDetails] = useState<AgentDetails | null>(null);
  const [newBioItem, setNewBioItem] = useState('');
  const [newLoreItem, setNewLoreItem] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newAdjective, setNewAdjective] = useState('');
  const [newStyleItem, setNewStyleItem] = useState({ category: 'all', text: '' });
  const [newPostExample, setNewPostExample] = useState('');

  useEffect(() => {
    if (user) {
      loadAgents();
    }
  }, [user]);

  useEffect(() => {
    if (selectedAgent) {
      loadAgentDetails(selectedAgent.id);
    } else {
      setAgentDetails(null);
    }
  }, [selectedAgent]);

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error('Error loading agents:', error);
      toast.error('Failed to load agents');
    }
  };

  const loadAgentDetails = async (agentId: string) => {
    try {
      const { data, error } = await supabase
        .from('agent_details')
        .select('*')
        .eq('agent_id', agentId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') { // No rows returned error
          // Create default agent details
          const defaultDetails = {
            agent_id: agentId,
            system_prompt: '',
            bio: [],
            lore: [],
            topics: [],
            adjectives: [],
            style: {
              all: [],
              chat: [],
              post: []
            },
            message_examples: [],
            post_examples: []
          };

          const { data: newData, error: insertError } = await supabase
            .from('agent_details')
            .insert(defaultDetails)
            .select()
            .single();

          if (insertError) throw insertError;
          setAgentDetails(newData);
        } else {
          throw error;
        }
      } else {
        setAgentDetails(data);
      }
    } catch (error) {
      console.error('Error loading agent details:', error);
      toast.error('Failed to load agent details');
    }
  };

  const handleAddAgent = async () => {
    if (!user || !newAgent.name.trim()) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('agents')
        .insert({
          user_id: user.id,
          name: newAgent.name.trim(),
          description: newAgent.description.trim(),
          avatar_url: newAgent.avatar_url.trim() || null,
        });

      if (error) throw error;

      toast.success('Agent added successfully');
      setIsAddingAgent(false);
      setNewAgent({ name: '', description: '', avatar_url: '' });
      loadAgents();
    } catch (error) {
      console.error('Error adding agent:', error);
      toast.error('Failed to add agent');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    try {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;

      toast.success('Agent deleted successfully');
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(null);
      }
      loadAgents();
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast.error('Failed to delete agent');
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedAgent || !agentDetails) return;

    try {
      const { error } = await supabase
        .from('agent_details')
        .upsert({
          agent_id: selectedAgent.id,
          ...agentDetails
        });

      if (error) throw error;
      toast.success('Agent details saved successfully');
    } catch (error) {
      console.error('Error saving agent details:', error);
      toast.error('Failed to save agent details');
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 md:mb-8">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-4">
            <MobileNav />
            <h1 className="text-2xl font-bold text-primary">AI Agents</h1>
          </div>
          <div className="md:hidden">
            <AuthButton />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-8 w-full md:w-auto">
          <NavLinks />
          <AuthButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-secondary/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-primary">Your Agents</h2>
            <Dialog open={isAddingAgent} onOpenChange={setIsAddingAgent}>
              <DialogTrigger asChild>
                <Button className="bg-secondary hover:bg-secondary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Agent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Agent</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newAgent.name}
                      onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                      placeholder="Enter agent name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={newAgent.description}
                      onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
                      placeholder="Enter agent description"
                    />
                  </div>
                  <div>
                    <Label htmlFor="avatar">Avatar URL (optional)</Label>
                    <Input
                      id="avatar"
                      value={newAgent.avatar_url}
                      onChange={(e) => setNewAgent({ ...newAgent, avatar_url: e.target.value })}
                      placeholder="Enter avatar URL"
                    />
                  </div>
                  <Button 
                    className="w-full bg-secondary hover:bg-secondary/90"
                    onClick={handleAddAgent}
                    disabled={isLoading || !newAgent.name.trim()}
                  >
                    {isLoading ? 'Adding...' : 'Add Agent'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-col h-[calc(33vh)]">
            <div className="border rounded-lg overflow-y-auto flex-1">
              <div className="space-y-1">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                      selectedAgent?.id === agent.id
                        ? 'border-2 border-blue-900/50 bg-secondary/5'
                        : 'border-secondary/20 hover:border-orange-500/50 hover:border-2'
                    }`}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="border border-gray-700">
                          <AvatarImage src={agent.avatar_url || undefined} />
                          <AvatarFallback>
                            {agent.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-primary">{agent.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAgent(agent.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {agents.length === 0 && (
                  <p className="text-secondary text-center py-8">
                    No agents added yet. Click the "Add Agent" button to create one.
                  </p>
                )}
              </div>
            </div>
          </div>

          {selectedAgent && (
            <div className="mt-6 p-4 rounded-lg border border-secondary/20">
              <h3 className="font-medium text-primary mb-2">Agent Description</h3>
              <p className="text-secondary">
                {selectedAgent.description || 'No description available.'}
              </p>
            </div>
          )}

          {selectedAgent && (
            <div className="mt-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="personality">Personality</TabsTrigger>
                  <TabsTrigger value="style">Style</TabsTrigger>
                  <TabsTrigger value="examples">Examples</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="mt-4">
                  <Card>
                    <CardContent className="space-y-4 pt-4">
                      <div>
                        <Label htmlFor="system-prompt">System Prompt</Label>
                        <Textarea
                          id="system-prompt"
                          value={agentDetails?.system_prompt || ''}
                          onChange={(e) => setAgentDetails(prev => prev ? {
                            ...prev,
                            system_prompt: e.target.value
                          } : null)}
                          placeholder="Enter system prompt"
                          className="mt-1"
                        />
                      </div>
                      <Button onClick={handleSaveDetails}>Save Changes</Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="personality" className="mt-4">
                  <Card>
                    <CardContent className="space-y-6 pt-4">
                      <div>
                        <Label>Bio</Label>
                        <div className="space-y-2 mt-2">
                          {agentDetails?.bio.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="flex-1">{item}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAgentDetails(prev => prev ? {
                                  ...prev,
                                  bio: prev.bio.filter((_, i) => i !== index)
                                } : null)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <Input
                              value={newBioItem}
                              onChange={(e) => setNewBioItem(e.target.value)}
                              placeholder="Add new bio item"
                            />
                            <Button
                              onClick={() => {
                                if (newBioItem.trim()) {
                                  setAgentDetails(prev => prev ? {
                                    ...prev,
                                    bio: [...prev.bio, newBioItem.trim()]
                                  } : null);
                                  setNewBioItem('');
                                }
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>

                      <Button onClick={handleSaveDetails}>Save Changes</Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="style" className="mt-4">
                  <Card>
                    <CardContent className="space-y-6 pt-4">
                      {['all', 'chat', 'post'].map((category) => (
                        <div key={category}>
                          <Label className="capitalize">{category} Style</Label>
                          <div className="space-y-2 mt-2">
                            {agentDetails?.style[category as keyof typeof agentDetails.style]?.map((item, index) => (
                              <div key={index} className="flex items-center gap-2">
                                <span className="flex-1">{item}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setAgentDetails(prev => {
                                      if (!prev) return null;
                                      const newStyle = { ...prev.style };
                                      newStyle[category as keyof typeof agentDetails.style] = 
                                        newStyle[category as keyof typeof agentDetails.style].filter((_, i) => i !== index);
                                      return { ...prev, style: newStyle };
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <Button onClick={handleSaveDetails}>Save Changes</Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="examples" className="mt-4">
                  <Card>
                    <CardContent className="space-y-6 pt-4">
                      <div>
                        <Label>Post Examples</Label>
                        <div className="space-y-2 mt-2">
                          {agentDetails?.post_examples.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="flex-1">{item}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setAgentDetails(prev => prev ? {
                                  ...prev,
                                  post_examples: prev.post_examples.filter((_, i) => i !== index)
                                } : null)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <div className="flex gap-2">
                            <Input
                              value={newPostExample}
                              onChange={(e) => setNewPostExample(e.target.value)}
                              placeholder="Add new post example"
                            />
                            <Button
                              onClick={() => {
                                if (newPostExample.trim()) {
                                  setAgentDetails(prev => prev ? {
                                    ...prev,
                                    post_examples: [...prev.post_examples, newPostExample.trim()]
                                  } : null);
                                  setNewPostExample('');
                                }
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                      <Button onClick={handleSaveDetails}>Save Changes</Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </main>
    </div>
  );
} 