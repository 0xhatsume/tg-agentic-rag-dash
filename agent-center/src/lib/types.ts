export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          created_at: string;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          created_at?: string;
          avatar_url?: string | null;
        };
        Update: {
          username?: string;
          email?: string;
          avatar_url?: string | null;
        };
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          api_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          api_key: string;
          created_at?: string;
        };
        Update: {
          provider?: string;
          api_key?: string;
        };
      };
    };
  };
}; 