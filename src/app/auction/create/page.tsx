'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Trophy, Users, User, Copy, Check, Play, Settings, LogOut, Crown, ChevronDown } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface CreateAuctionForm {
  name: string;
  maxTeams: number;
  playersPerTeam: number;
}

interface CreateAuctionFormErrors {
  name?: string;
  maxTeams?: string;
  playersPerTeam?: string;
}

interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}

export default function CreateAuctionPage() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CreateAuctionForm>({
    name: '',
    maxTeams: 8,
    playersPerTeam: 15
  });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [roomKey, setRoomKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [errors, setErrors] = useState<CreateAuctionFormErrors>({});

  // Fixed budget at 120 crores (in lakhs for easier handling)
  const FIXED_BUDGET = 12000; // 120 crores = 12000 lakhs

  useEffect(() => {
    checkAuthAndLoadProfile();
  }, []);

  const checkAuthAndLoadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/auth');
        return;
      }

      setUser(session.user);

      // Load user profile
      const { data: profile } = await supabase
        .from('users_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading user data:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Generate a random 6-digit room key
  const generateRoomKey = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Check if profile is complete
  const isProfileComplete = (): boolean => {
    return !!(userProfile?.full_name && userProfile.full_name.trim());
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: CreateAuctionFormErrors = {};

    if (!form.name.trim()) {
      newErrors.name = 'Auction name is required';
    }

    if (form.maxTeams < 2 || form.maxTeams > 10) {
      newErrors.maxTeams = 'Number of teams must be between 2 and 10';
    }

    if (form.playersPerTeam < 11 || form.playersPerTeam > 25) {
      newErrors.playersPerTeam = 'Players per team must be between 11 and 25';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createAuction = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isProfileComplete()) {
      alert('Please complete your profile first by adding your full name.');
      router.push('/profile');
      return;
    }

    if (!validateForm()) return;

    setCreating(true);

    try {
      const roomKey = generateRoomKey();

      // Create auction room
      const { data: roomData, error: roomError } = await supabase
        .from('auction_rooms')
        .insert([{
          room_key: roomKey,
          name: form.name.trim(),
          creator_id: user!.id,
          status: 'waiting',
          max_participants: form.maxTeams,
          budget_per_team: FIXED_BUDGET,
          players_per_team: form.playersPerTeam,
          timer_seconds: 30
        }])
        .select()
        .single();

      if (roomError) {
        console.error('Room creation error:', roomError);
        throw new Error(roomError.message || 'Failed to create auction room');
      }

      // Initialize auction state
      const { error: stateError } = await supabase
        .from('auction_state')
        .insert([{
          room_id: roomData.id,
          is_active: false,
          is_paused: false,
          current_player: null,
          current_player_index: -1,
          current_bid: 0,
          base_price: 0,
          leading_team: null,
          time_remaining: 30,
          player_queue: [],
          sold_players: [],
          unsold_players: []
        }]);

      if (stateError) {
        console.error('State creation error:', stateError);
        throw new Error(stateError.message || 'Failed to initialize auction state');
      }

      setRoomKey(roomKey);
      setCreated(true);
    } catch (error) {
      console.error('Error creating auction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create auction. Please try again.';
      alert(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const copyRoomKey = async () => {
    try {
      await navigator.clipboard.writeText(roomKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = roomKey;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const goToAuction = () => {
    router.push(`/auction/${roomKey}`);
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      </div>
    );
  }

  if (created) {
    return (
      <div>
        {/* Navigation */}
        <nav className="nav">
          <div className="container">
            <div className="nav-content">
              <a href="/dashboard" className="nav-brand">
                <Trophy className="w-6 h-6" />
                <span>IPL Auction</span>
              </a>

              <div className="nav-actions">
                <div className={`profile-dropdown ${showProfileDropdown ? 'open' : ''}`}>
                  <button
                    className="profile-trigger"
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  >
                    <img
                      src={userProfile?.avatar_url || user?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
                      alt="Profile"
                      className="user-avatar"
                    />
                    <ChevronDown className="w-4 h-4 chevron-icon" />
                  </button>

                  {showProfileDropdown && (
                    <div className="profile-dropdown-menu">
                      <div className="profile-dropdown-item" style={{ cursor: 'default' }}>
                        <User className="w-4 h-4" />
                        <div>
                          <div className="font-semibold text-sm">
                            {userProfile?.full_name || user?.user_metadata?.full_name || 'User'}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                            {user?.email}
                          </div>
                        </div>
                      </div>

                      <hr style={{ margin: '0.5rem 0', border: 'none', borderTop: '1px solid var(--border-default)' }} />

                      <button
                        className="profile-dropdown-item"
                        onClick={() => {
                          setShowProfileDropdown(false);
                          router.push('/profile');
                        }}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Profile Settings
                      </button>

                      <button
                        className="profile-dropdown-item danger"
                        onClick={() => {
                          setShowProfileDropdown(false);
                          signOut();
                        }}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Close dropdown when clicking outside */}
        {showProfileDropdown && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10,
            }}
            onClick={() => setShowProfileDropdown(false)}
          />
        )}

        {/* Success Page */}
        <main className="container section fade-in">
          <div className="text-center mb-8">
            <div className="feature-icon mb-6" style={{ background: 'linear-gradient(135deg, var(--accent-green) 0%, #10b981 100%)', width: '5rem', height: '5rem', margin: '0 auto' }}>
              <Check className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Auction Created Successfully! 🎉</h1>
            <p className="text-xl" style={{ color: 'var(--text-muted)' }}>
              Your IPL auction room is ready. Share the room key with your friends!
            </p>
          </div>

          <div className="card card-lg slide-up max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold mb-4">{form.name}</h2>

              <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 rounded-lg p-6 mb-6">
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Room Key</div>
                <div className="text-4xl font-bold font-mono mb-4" style={{ color: 'var(--primary-purple)' }}>
                  {roomKey}
                </div>
                <button
                  onClick={copyRoomKey}
                  className="btn btn-secondary"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Room Key'}
                </button>
              </div>

              <div className="grid grid-2 gap-4 mb-6">
                <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                  <div className="text-2xl font-bold">{form.maxTeams}</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Max Teams</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-green-500/10 to-blue-500/10 rounded-lg border border-green-500/20">
                  <div className="text-2xl font-bold">{form.playersPerTeam}</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Players per Team</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-lg border border-yellow-500/20">
                  <div className="text-2xl font-bold">₹120Cr</div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Budget per Team</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-pink-500/10 to-red-500/10 rounded-lg border border-pink-500/20">
                  <div className="text-2xl font-bold">
                    <Users className="w-6 h-6 mx-auto" />
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Auctioneer Only
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="btn btn-secondary flex-1"
                >
                  Back to Dashboard
                </button>
                <button
                  onClick={goToAuction}
                  className="btn btn-primary flex-1"
                >
                  <Play className="w-4 h-4" />
                  Enter Auction Room
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation */}
      <nav className="nav">
        <div className="container">
          <div className="nav-content">
            <a href="/dashboard" className="nav-brand">
              <Trophy className="w-6 h-6" />
              <span>IPL Auction</span>
            </a>

            <div className="nav-actions">
              <div className={`profile-dropdown ${showProfileDropdown ? 'open' : ''}`}>
                <button
                  className="profile-trigger"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                >
                  <img
                    src={userProfile?.avatar_url || user?.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
                    alt="Profile"
                    className="user-avatar"
                  />
                  <ChevronDown className="w-4 h-4 chevron-icon" />
                </button>

                {showProfileDropdown && (
                  <div className="profile-dropdown-menu">
                    <div className="profile-dropdown-item" style={{ cursor: 'default' }}>
                      <User className="w-4 h-4" />
                      <div>
                        <div className="font-semibold text-sm">
                          {userProfile?.full_name || user?.user_metadata?.full_name || 'User'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                          {user?.email}
                        </div>
                      </div>
                    </div>

                    <hr style={{ margin: '0.5rem 0', border: 'none', borderTop: '1px solid var(--border-default)' }} />

                    <button
                      className="profile-dropdown-item"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        router.push('/profile');
                      }}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Profile Settings
                    </button>

                    <button
                      className="profile-dropdown-item danger"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        signOut();
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Close dropdown when clicking outside */}
      {showProfileDropdown && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
          }}
          onClick={() => setShowProfileDropdown(false)}
        />
      )}

      {/* Main Content */}
      <main className="container section fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Create New Auction 🏏</h1>
          <p className="text-xl" style={{ color: 'var(--text-muted)' }}>
            Set up your IPL auction room and invite your friends!
          </p>
        </div>

        {!isProfileComplete() && (
          <div className="alert alert-warning mb-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5" />
              <div>
                <div className="font-semibold">Profile Incomplete</div>
                <div className="text-sm">Please complete your profile before creating an auction.</div>
              </div>
            </div>
            <button
              onClick={() => router.push('/profile')}
              className="btn btn-warning btn-sm"
            >
              Complete Profile
            </button>
          </div>
        )}

        <div className="card card-lg slide-up max-w-2xl mx-auto">
          <form onSubmit={createAuction} className="space-y-6">
            <div className="text-center mb-6">
              <div className="feature-icon mb-4" style={{ background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-cyan) 100%)', width: '4rem', height: '4rem', margin: '0 auto' }}>
                <Plus className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Auction Configuration</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Configure your auction settings below
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">
                <Trophy className="w-4 h-4" />
                Auction Name
              </label>
              <input
                type="text"
                className={`form-input ${errors.name ? 'error' : ''}`}
                placeholder="Enter auction name (e.g., IPL 2024 Auction)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={100}
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>

            <div className="grid grid-2 gap-4">
              <div className="form-group">
                <label className="form-label">
                  <Users className="w-4 h-4" />
                  Max Teams
                </label>
                <select
                  className={`form-input ${errors.maxTeams ? 'error' : ''}`}
                  value={form.maxTeams}
                  onChange={(e) => setForm({ ...form, maxTeams: parseInt(e.target.value) })}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                    <option key={num} value={num}>{num} Teams</option>
                  ))}
                </select>
                {errors.maxTeams && <div className="form-error">{errors.maxTeams}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">
                  <User className="w-4 h-4" />
                  Players per Team
                </label>
                <select
                  className={`form-input ${errors.playersPerTeam ? 'error' : ''}`}
                  value={form.playersPerTeam}
                  onChange={(e) => setForm({ ...form, playersPerTeam: parseInt(e.target.value) })}
                >
                  {[11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(num => (
                    <option key={num} value={num}>{num} Players</option>
                  ))}
                </select>
                {errors.playersPerTeam && <div className="form-error">{errors.playersPerTeam}</div>}
              </div>
            </div>

            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                <div className="font-semibold">Budget Information</div>
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Each team will have a budget of ₹120 Crores to build their squad, just like the real IPL auction!
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !isProfileComplete()}
                className="btn btn-primary flex-1"
              >
                {creating ? (
                  <>
                    <div className="spinner-sm"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Create Auction
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
