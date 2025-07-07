/**
 * @fileoverview User profile management page
 * Handles user profile display, editing, avatar upload, and account management
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User, Mail, Phone, Calendar, ArrowLeft, Save, Camera, Shield, Clock, Star, Trophy, Trash2, AlertTriangle, ChevronDown, Settings } from 'lucide-react';

/**
 * Interface representing a user's profile data
 */
interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  avatar_url?: string;
}

/**
 * ProfilePage component for managing user account and profile information
 * Provides functionality for:
 * - Viewing and editing profile details
 * - Uploading profile pictures
 * - Managing account settings
 * - Deleting account
 *
 * @returns JSX element containing the profile management interface
 */
export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State management for user data and UI
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state for profile editing
  const [profile, setProfile] = useState({
    fullName: '',
    phone: '',
    dateOfBirth: '',
  });

  /**
   * Initialize component by checking authentication and loading profile data
   */
  useEffect(() => {
    checkAuthAndLoadProfile();
  }, []);

  /**
   * Checks user authentication status and loads profile data
   * Redirects to auth page if user is not authenticated
   */
  const checkAuthAndLoadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/auth');
        return;
      }

      setUser(session.user);
      await loadProfile(session.user);
    } catch (error) {
      console.error('Error loading user data:', error);
      router.push('/auth');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Signs out the current user and redirects to auth page
   */
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/auth');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  /**
   * Loads user profile data from the database
   * Creates a new profile if one doesn't exist
   *
   * @param currentUser - The authenticated user object
   */
  const loadProfile = async (currentUser: any) => {
    // Get user profile from database
    const { data: existingProfile, error } = await supabase
      .from('users_profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist, create one with auth data
      const newProfileData = {
        id: currentUser.id,
        full_name: currentUser.user_metadata?.full_name || '',
        avatar_url: currentUser.user_metadata?.avatar_url || '',
        phone: null,
        date_of_birth: null
      };

      const { data: newProfile, error: createError } = await supabase
        .from('users_profiles')
        .insert(newProfileData)
        .select()
        .single();

      if (!createError && newProfile) {
        setUserProfile(newProfile);
        setProfile({
          fullName: newProfile.full_name || '',
          phone: newProfile.phone || '',
          dateOfBirth: newProfile.date_of_birth || '',
        });
      }
    } else if (!error && existingProfile) {
      setUserProfile(existingProfile);
      setProfile({
        fullName: existingProfile.full_name || '',
        phone: existingProfile.phone || '',
        dateOfBirth: existingProfile.date_of_birth || '',
      });
    }

    setLoading(false);
  };

  /**
   * Handles profile picture upload
   * Validates file type and size, converts to base64, and saves to database
   *
   * @param event - File input change event
   */
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    setUploadingImage(true);
    try {
      // Convert image to base64 and store in database
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const base64String = e.target?.result as string;

          // Update profile with new avatar URL
          const { error: updateError } = await supabase
            .from('users_profiles')
            .update({ avatar_url: base64String })
            .eq('id', user.id);

          if (updateError) {
            console.error('Database update error:', updateError);
            throw new Error(`Database error: ${updateError.message}`);
          }

          // Update local state
          setUserProfile(prev => prev ? { ...prev, avatar_url: base64String } : prev);
          alert('Profile picture updated successfully!');
        } catch (error) {
          console.error('Error processing image:', error);
          const errorMsg = error instanceof Error ? error.message : 'Failed to process image';
          alert(`Failed to upload image: ${errorMsg}`);
        } finally {
          setUploadingImage(false);
        }
      };

      reader.onerror = () => {
        console.error('Error reading file');
        alert('Failed to read the selected file');
        setUploadingImage(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to upload image: ${errorMsg}`);
      setUploadingImage(false);
    }
  };

  /**
   * Handles profile form submission
   * Validates and saves profile data to database
   *
   * @param e - Form submission event
   */
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) return;

    setSaving(true);
    try {
      // Update user profile in database
      const { error } = await supabase
        .from('users_profiles')
        .update({
          full_name: profile.fullName.trim() || null,
          phone: profile.phone.trim() || null,
          date_of_birth: profile.dateOfBirth || null,
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        alert('Failed to save profile. Please try again.');
        setSaving(false);
        return;
      }

      // Update local state
      setUserProfile({
        ...userProfile,
        full_name: profile.fullName.trim() || null,
        phone: profile.phone.trim() || null,
        date_of_birth: profile.dateOfBirth || null,
      });

      // Check if profile is complete and redirect
      const isProfileComplete = profile.fullName.trim();
      if (isProfileComplete) {
        alert('Profile updated successfully! Redirecting to dashboard...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);
      } else {
        alert('Profile updated successfully!');
      }
      setSaving(false);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to save profile. Please try again.');
      setSaving(false);
    }
  };

  /**
   * Handles user sign out
   */
  const handleSignOut = async () => {
    await signOut();
  };

  /**
   * Handles account deletion with confirmation
   * Permanently deletes user account and all associated data
   */
  const handleDeleteAccount = async () => {
    const requiredText = "DELETE MY ACCOUNT PERMANENTLY";

    if (deleteConfirmText.trim() !== requiredText) {
      alert('Please type the exact confirmation text to delete your account.');
      return;
    }

    setIsDeleting(true);

    try {
      if (user) {
        // Get current session token
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          alert('Session expired. Please sign in again.');
          router.push('/auth');
          return;
        }

        // Call API endpoint to delete the account
        const response = await fetch('/api/delete-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            userId: user.id,
            confirmText: deleteConfirmText.trim()
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to delete account');
        }

        alert('Your account has been permanently deleted. All your data has been removed from our system.');
        router.push('/auth');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      alert(`An error occurred while deleting your account: ${errorMessage}. Please try again or contact support.`);
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ color: 'var(--text-muted)' }}>Loading your profile...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Simplified Navigation */}
      <nav className="nav">
        <div className="container">
          <div className="nav-content">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-secondary btn-sm"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <a href="/profile" className="nav-brand">
                <span>Your Profile</span>
              </a>
            </div>

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
                        router.push('/dashboard');
                      }}
                    >
                      <Trophy className="w-4 h-4" />
                      Dashboard
                    </button>

                    <button
                      className="profile-dropdown-item danger"
                      onClick={() => {
                        setShowProfileDropdown(false);
                        signOut();
                      }}
                    >
                      <ArrowLeft className="w-4 h-4" />
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
        <div className="grid grid-2 gap-8">

          {/* Profile Sidebar */}
          <div className="slide-up">
            <div className="card card-lg text-center">
              <div className="relative mb-6" style={{ width: '8rem', height: '8rem', margin: '0 auto' }}>
                <img
                  src={userProfile?.avatar_url || 'https://via.placeholder.com/200?text=Upload+Image'}
                  alt="Profile"
                  className="w-full h-full rounded-full"
                  style={{ border: '4px solid var(--border-default)', objectFit: 'cover' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-primary btn-icon"
                  disabled={uploadingImage}
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    right: '0'
                  }}
                >
                  {uploadingImage ? (
                    <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  className="hidden"
                  accept="image/*"
                />
              </div>

              <h2 className="text-xl font-bold mb-1">
                {userProfile?.full_name || 'Add Your Name'}
              </h2>
              <p className="mb-6" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>

              <div className="grid gap-4">
                <div className="card" style={{ padding: '1rem', textAlign: 'left' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="feature-icon"
                        style={{
                          background: 'linear-gradient(135deg, var(--accent-yellow) 0%, #f59e0b 100%)',
                          width: '2.5rem',
                          height: '2.5rem'
                        }}
                      >
                        <Trophy className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-disabled)' }}>Status</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>IPL Enthusiast</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: '1rem', textAlign: 'left' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="feature-icon"
                        style={{
                          background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-cyan) 100%)',
                          width: '2.5rem',
                          height: '2.5rem'
                        }}
                      >
                        <Clock className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-disabled)' }}>Joined</p>
                        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {new Date(user?.created_at || Date.now()).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <div className="slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="card card-lg">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6" style={{ color: 'var(--primary-blue)' }} />
                <h2 className="text-2xl font-bold">Account Information</h2>
              </div>

              <form onSubmit={handleSaveProfile}>
                <div className="form-group">
                  <label className="form-label flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profile.fullName}
                    onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                    placeholder="Enter your full name"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="form-input opacity-75"
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                    Email cannot be changed
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="Enter your phone number"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={profile.dateOfBirth}
                    onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })}
                    className="form-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary btn-lg w-full"
                >
                  {saving ? (
                    <>
                      <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Profile
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Account Actions */}
            <div className="card card-lg mt-6">
              <div className="flex items-center gap-3 mb-6">
                <Star className="w-6 h-6" style={{ color: 'var(--accent-yellow)' }} />
                <h2 className="text-xl font-bold">Account Actions</h2>
              </div>

              <button
                onClick={() => signOut()}
                className="btn btn-secondary w-full mb-4"
              >
                <ArrowLeft className="w-5 h-5" />
                Sign Out
              </button>
            </div>

            {/* Danger Zone */}
            <div className="card card-lg mt-6" style={{ border: '1px solid var(--accent-red)' }}>
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="w-6 h-6" style={{ color: 'var(--accent-red)' }} />
                <h2 className="text-xl font-bold" style={{ color: 'var(--accent-red)' }}>
                  Danger Zone
                </h2>
              </div>

              <div>
                <h4 className="text-lg font-bold mb-2" style={{ color: 'var(--accent-red)' }}>
                  Delete Account
                </h4>
                <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="btn btn-danger"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ border: '1px solid var(--accent-red)' }}
          >
            <div className="text-center mb-6">
              <div
                className="feature-icon mb-4"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-red) 0%, #dc2626 100%)'
                }}
              >
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Delete Account</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                This action cannot be undone. This will permanently delete your account and all associated data.
              </p>
            </div>

            <div
              className="card mb-6"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              <h4 className="font-semibold mb-2" style={{ color: 'var(--accent-red)' }}>
                ⚠️ What will be deleted:
              </h4>
              <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <li>• Your user profile and personal information</li>
                <li>• Your profile picture and uploaded files</li>
                <li>• All auction rooms you've created</li>
                <li>• Your participation history in auctions</li>
                <li>• All associated game data and statistics</li>
              </ul>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--accent-red)' }}>
                Type <span className="font-mono bg-red-900/30 px-2 py-1 rounded">DELETE MY ACCOUNT PERMANENTLY</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="form-input"
                style={{ borderColor: 'var(--accent-red)' }}
                placeholder="DELETE MY ACCOUNT PERMANENTLY"
                disabled={isDeleting}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                disabled={isDeleting}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmText.trim() !== "DELETE MY ACCOUNT PERMANENTLY"}
                className="btn btn-danger flex-1"
              >
                {isDeleting ? (
                  <>
                    <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Account
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
