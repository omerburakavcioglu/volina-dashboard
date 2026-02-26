"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/SupabaseProvider";
import type { AISettings } from "@/lib/types-outbound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Bot, 
  MessageSquare, 
  Clock,
  Save,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

export default function AISettingsPage() {
  const { user } = useAuth();

  const [settings, setSettings] = useState<AISettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const [formData, setFormData] = useState({
    agent_name: "Volina AI",
    opening_script_tr: "",
    opening_script_en: "",
    curiosity_questions_tr: [] as string[],
    curiosity_questions_en: [] as string[],
    negative_response_handling_tr: "",
    negative_response_handling_en: "",
    goal_description_tr: "",
    goal_description_en: "",
    max_unreachable_attempts: 5,
    unreachable_timeout_days: 30,
    call_hours_start: "09:00",
    call_hours_end: "18:00",
    announce_ai: true,
  });

  const loadSettings = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/dashboard/ai-settings?userId=${user.id}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const data = result.data;
          setSettings(data);
          setFormData({
            agent_name: data.agent_name || "Volina AI",
            opening_script_tr: data.opening_script_tr || "",
            opening_script_en: data.opening_script_en || "",
            curiosity_questions_tr: data.curiosity_questions_tr || [],
            curiosity_questions_en: data.curiosity_questions_en || [],
            negative_response_handling_tr: data.negative_response_handling_tr || "",
            negative_response_handling_en: data.negative_response_handling_en || "",
            goal_description_tr: data.goal_description_tr || "",
            goal_description_en: data.goal_description_en || "",
            max_unreachable_attempts: data.max_unreachable_attempts || 5,
            unreachable_timeout_days: data.unreachable_timeout_days || 30,
            call_hours_start: data.call_hours_start || "09:00",
            call_hours_end: data.call_hours_end || "18:00",
            announce_ai: data.announce_ai ?? true,
          });
        }
      }
    } catch (error) {
      console.error("Error loading AI settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadSettings();
    } else {
      setIsLoading(false);
    }
  }, [user?.id, loadSettings]);

  const handleInputChange = (field: string, value: string | number | boolean | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);

    try {
      const response = await fetch(`/api/dashboard/ai-settings?userId=${user.id}`, {
        method: settings ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, userId: user.id }),
      });

      if (response.ok) {
        setHasChanges(false);
        await loadSettings();
      }
    } catch (error) {
      console.error("Error saving AI settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const addQuestion = (lang: "tr" | "en") => {
    const field = lang === "tr" ? "curiosity_questions_tr" : "curiosity_questions_en";
    handleInputChange(field, [...formData[field], ""]);
  };

  const updateQuestion = (lang: "tr" | "en", index: number, value: string) => {
    const field = lang === "tr" ? "curiosity_questions_tr" : "curiosity_questions_en";
    const updated = [...formData[field]];
    updated[index] = value;
    handleInputChange(field, updated);
  };

  const removeQuestion = (lang: "tr" | "en", index: number) => {
    const field = lang === "tr" ? "curiosity_questions_tr" : "curiosity_questions_en";
    const updated = formData[field].filter((_, i) => i !== index);
    handleInputChange(field, updated);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Settings</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Configure your AI voice agent</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
        >
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      {/* Agent Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Agent Configuration</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <Label>Agent Name</Label>
            <Input
              value={formData.agent_name}
              onChange={(e) => handleInputChange("agent_name", e.target.value)}
              placeholder="Volina AI"
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Label>Announce AI</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">Inform caller that they are speaking with an AI</p>
            </div>
            <Switch
              checked={formData.announce_ai}
              onCheckedChange={(v) => handleInputChange("announce_ai", v)}
            />
          </div>
        </div>
      </div>

      {/* Call Hours */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Call Schedule</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={formData.call_hours_start}
                onChange={(e) => handleInputChange("call_hours_start", e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={formData.call_hours_end}
                onChange={(e) => handleInputChange("call_hours_end", e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Unreachable Attempts</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formData.max_unreachable_attempts}
                onChange={(e) => handleInputChange("max_unreachable_attempts", parseInt(e.target.value) || 5)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
            <div>
              <Label>Timeout Days</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={formData.unreachable_timeout_days}
                onChange={(e) => handleInputChange("unreachable_timeout_days", parseInt(e.target.value) || 30)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scripts - Turkish */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Scripts (Turkish)</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <Label>Opening Script</Label>
            <Textarea
              value={formData.opening_script_tr}
              onChange={(e) => handleInputChange("opening_script_tr", e.target.value)}
              placeholder="Hello, this is..."
              rows={3}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <Label>Goal Description</Label>
            <Textarea
              value={formData.goal_description_tr}
              onChange={(e) => handleInputChange("goal_description_tr", e.target.value)}
              placeholder="The goal of this call is to..."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <Label>Negative Response Handling</Label>
            <Textarea
              value={formData.negative_response_handling_tr}
              onChange={(e) => handleInputChange("negative_response_handling_tr", e.target.value)}
              placeholder="When customer says no..."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Curiosity Questions</Label>
              <Button variant="ghost" size="sm" onClick={() => addQuestion("tr")}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {formData.curiosity_questions_tr.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={q}
                    onChange={(e) => updateQuestion("tr", i, e.target.value)}
                    placeholder={`Question ${i + 1}`}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeQuestion("tr", i)}>
                    <Trash2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </Button>
                </div>
              ))}
              {formData.curiosity_questions_tr.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">No questions added</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scripts - English */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Scripts (English)</h2>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <Label>Opening Script</Label>
            <Textarea
              value={formData.opening_script_en}
              onChange={(e) => handleInputChange("opening_script_en", e.target.value)}
              placeholder="Hello, this is..."
              rows={3}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <Label>Goal Description</Label>
            <Textarea
              value={formData.goal_description_en}
              onChange={(e) => handleInputChange("goal_description_en", e.target.value)}
              placeholder="The goal of this call is to..."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <Label>Negative Response Handling</Label>
            <Textarea
              value={formData.negative_response_handling_en}
              onChange={(e) => handleInputChange("negative_response_handling_en", e.target.value)}
              placeholder="When customer says no..."
              rows={2}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Curiosity Questions</Label>
              <Button variant="ghost" size="sm" onClick={() => addQuestion("en")}>
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {formData.curiosity_questions_en.map((q, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={q}
                    onChange={(e) => updateQuestion("en", i, e.target.value)}
                    placeholder={`Question ${i + 1}`}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeQuestion("en", i)}>
                    <Trash2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </Button>
                </div>
              ))}
              {formData.curiosity_questions_en.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">No questions added</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
