"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/SupabaseProvider";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Save,
  Loader2,
  User,
  Building,
  Key
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    company_name: "",
    slug: "",
    vapi_org_id: "",
  });

  const loadProfile = useCallback(async () => {
    try {
      if (user?.id) {
        const response = await fetch(`/api/dashboard/profile?userId=${user.id}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setProfile(result.data);
            setFormData({
              full_name: result.data.full_name || "",
              company_name: result.data.company_name || "",
              slug: result.data.slug || "",
              vapi_org_id: result.data.vapi_org_id || "",
            });
          }
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);

    try {
      const response = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          ...formData,
        }),
      });

      if (response.ok) {
        setHasChanges(false);
        await loadProfile();
      }
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account settings</p>
      </div>

      {/* Profile Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Profile</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input
              value={formData.full_name}
              onChange={(e) => handleInputChange("full_name", e.target.value)}
              placeholder="Your name"
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <Label>Email</Label>
            <Input
              value={user?.email || ""}
              disabled
              className="bg-gray-50 dark:bg-gray-700/50 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Email cannot be changed</p>
          </div>
        </div>
      </div>

      {/* Company Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Building className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Company</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <Label>Company Name</Label>
            <Input
              value={formData.company_name}
              onChange={(e) => handleInputChange("company_name", e.target.value)}
              placeholder="Your company name"
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <Label>URL Slug</Label>
            <Input
              value={formData.slug}
              onChange={(e) => handleInputChange("slug", e.target.value)}
              placeholder="your-company"
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Your dashboard URL: /{formData.slug || "your-company"}
            </p>
          </div>
        </div>
      </div>

      {/* Integration Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Integrations</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <Label>VAPI Organization ID</Label>
            <Input
              value={formData.vapi_org_id}
              onChange={(e) => handleInputChange("vapi_org_id", e.target.value)}
              placeholder="org_..."
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Connect your VAPI account for AI calling
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
        >
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
