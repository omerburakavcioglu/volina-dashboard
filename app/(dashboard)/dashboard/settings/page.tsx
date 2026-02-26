"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";
import { getDoctors, createDoctor, updateProfile } from "@/lib/supabase";
import type { Doctor } from "@/lib/types";
import { 
  User, 
  Bell, 
  Shield, 
  Globe, 
  Moon, 
  Sun,
  Save,
  Check,
  Plus,
  Users,
  Trash2,
  RefreshCw,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const colorOptions = [
  "#0055FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, isAuthenticated, isLoading: authLoading, refreshProfile } = useAuth();
  
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
  });
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
  });
  
  // Team members state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMember, setNewMember] = useState({
    name: "",
    specialty: "",
    email: "",
    phone: "",
    color_code: "#0055FF",
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user profile
  useEffect(() => {
    if (user) {
      setProfile({
        name: user.full_name || "",
        email: user.email || "",
        phone: "",
        company: "Volina AI",
      });
    }
  }, [user]);

  // Load team members
  const loadDoctors = useCallback(async () => {
    try {
      const data = await getDoctors();
      setDoctors(data);
    } catch (error) {
      console.error("Error loading doctors:", error);
    } finally {
      setIsLoadingDoctors(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadDoctors();
    }
  }, [isAuthenticated, loadDoctors]);

  const handleSave = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      await updateProfile(user.id, {
        full_name: profile.name,
      });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.specialty) {
      alert("Please fill in the name and specialty");
      return;
    }

    setIsAddingMember(true);
    try {
      const doctor = await createDoctor({
        name: newMember.name,
        specialty: newMember.specialty,
        email: newMember.email || null,
        phone: newMember.phone || null,
        color_code: newMember.color_code,
        avatar_url: null,
        is_active: true,
      });

      if (doctor) {
        setDoctors(prev => [...prev, doctor]);
        setShowAddMember(false);
        setNewMember({
          name: "",
          specialty: "",
          email: "",
          phone: "",
          color_code: "#0055FF",
        });
      }
    } catch (error) {
      console.error("Error adding team member:", error);
      alert("Failed to add team member");
    } finally {
      setIsAddingMember(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <User className="w-5 h-5" />
              Profile
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="dark:text-gray-300">Full Name</Label>
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="dark:text-gray-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white opacity-60"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 dark:text-white">
                  <Users className="w-5 h-5" />
                  Team Members
                </CardTitle>
                <CardDescription className="dark:text-gray-400">
                  Manage your team members for appointment scheduling
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddMember(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingDoctors ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : doctors.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">No team members yet</p>
                <Button onClick={() => setShowAddMember(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add your first team member
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {doctors.map((doctor) => (
                  <div 
                    key={doctor.id}
                    className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                      style={{ backgroundColor: doctor.color_code }}
                    >
                      {doctor.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{doctor.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{doctor.specialty}</p>
                    </div>
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                      {doctor.email && <p>{doctor.email}</p>}
                      {doctor.phone && <p>{doctor.phone}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <Globe className="w-5 h-5" />
              Appearance
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Customize how the dashboard looks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all",
                  theme === "light"
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
              >
                <Sun className={cn("w-5 h-5", theme === "light" ? "text-primary" : "text-gray-500")} />
                <span className={cn("font-medium", theme === "light" ? "text-primary" : "text-gray-600 dark:text-gray-300")}>
                  Light
                </span>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all",
                  theme === "dark"
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                )}
              >
                <Moon className={cn("w-5 h-5", theme === "dark" ? "text-primary" : "text-gray-500")} />
                <span className={cn("font-medium", theme === "dark" ? "text-primary" : "text-gray-600 dark:text-gray-300")}>
                  Dark
                </span>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
            <CardDescription className="dark:text-gray-400">
              Choose how you want to be notified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "email", label: "Email Notifications", desc: "Receive updates via email" },
              { key: "push", label: "Push Notifications", desc: "Receive push notifications in browser" },
              { key: "sms", label: "SMS Notifications", desc: "Receive text message alerts" },
            ].map((item) => (
              <div 
                key={item.key} 
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotifications({ 
                    ...notifications, 
                    [item.key]: !notifications[item.key as keyof typeof notifications] 
                  })}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors",
                    notifications[item.key as keyof typeof notifications]
                      ? "bg-primary"
                      : "bg-gray-300 dark:bg-gray-600"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                      notifications[item.key as keyof typeof notifications]
                        ? "translate-x-7"
                        : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="min-w-[120px]">
          {saved ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Saved!
            </>
          ) : isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Add Team Member Dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Add Team Member</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Add a new team member for appointment scheduling
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member-name" className="dark:text-gray-300">Name *</Label>
              <Input
                id="member-name"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                placeholder="John Smith"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-specialty" className="dark:text-gray-300">Role/Specialty *</Label>
              <Input
                id="member-specialty"
                value={newMember.specialty}
                onChange={(e) => setNewMember({ ...newMember, specialty: e.target.value })}
                placeholder="Sales, Support, Consulting..."
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="member-email" className="dark:text-gray-300">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  placeholder="john@company.com"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-phone" className="dark:text-gray-300">Phone</Label>
                <Input
                  id="member-phone"
                  value={newMember.phone}
                  onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Color</Label>
              <div className="flex gap-2 flex-wrap">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewMember({ ...newMember, color_code: color })}
                    className={cn(
                      "w-8 h-8 rounded-full transition-transform",
                      newMember.color_code === color && "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 scale-110"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowAddMember(false)}
              className="dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddMember}
              disabled={!newMember.name || !newMember.specialty || isAddingMember}
            >
              {isAddingMember ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
