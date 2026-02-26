"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTenant } from "@/components/providers/TenantProvider";
import { useAuth } from "@/components/providers/SupabaseProvider";
// Messages now loaded via API route
import type { Message, MessageTemplate, OutreachChannel } from "@/lib/types-outbound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { 
  MessageSquare, 
  Mail, 
  Instagram, 
  Phone,
  Send,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  Eye,
  Reply,
  FileText
} from "lucide-react";

// Rename FileText to Template for readability
const Template = FileText;
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

type ChannelType = OutreachChannel | 'call_script';

const channelConfig: Record<ChannelType, { label: string; icon: typeof MessageSquare; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "text-green-600 bg-green-100 dark:bg-green-900/30" },
  email: { label: "Email", icon: Mail, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  instagram_dm: { label: "Instagram DM", icon: Instagram, color: "text-pink-600 bg-pink-100 dark:bg-pink-900/30" },
  sms: { label: "SMS", icon: Phone, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30" },
  call: { label: "Arama", icon: Phone, color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
  call_script: { label: "Arama Scripti", icon: Phone, color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30" },
};

export default function MessagesPage() {
  const params = useParams();
  const tenant = params?.tenant as string;
  useTenant(); // Ensure tenant context is available
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeChannel, setActiveChannel] = useState<OutreachChannel>("whatsapp");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Compose form
  const [composeData, setComposeData] = useState({
    channel: "whatsapp" as OutreachChannel,
    recipient: "",
    subject: "",
    content: "",
  });

  // Template form
  const [templateData, setTemplateData] = useState<{
    name: string;
    channel: MessageTemplate['channel'];
    language: MessageTemplate['language'];
    subject: string;
    content: string;
  }>({
    name: "",
    channel: "whatsapp",
    language: "tr",
    subject: "",
    content: "",
  });

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      // Use server-side API route
      const response = await fetch(`/api/dashboard/messages?channel=${activeChannel}&limit=50&userId=${user.id}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setMessages(result.messages || []);
          setTemplates(result.templates || []);
          return;
        }
      }
      setMessages([]);
      setTemplates([]);
    } catch (error) {
      console.error("Error loading messages:", error);
      setMessages([]);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeChannel, user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [user?.id, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleSendMessage = async () => {
    if (!user?.id) return;
    setIsSending(true);
    try {
      const response = await fetch(`/api/dashboard/messages?userId=${user.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          channel: composeData.channel,
          recipient: composeData.recipient,
          subject: composeData.subject,
          content: composeData.content,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to send message");
      }
      
      setShowComposeDialog(false);
      setComposeData({ channel: "whatsapp", recipient: "", subject: "", content: "" });
      await loadData();
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateTemplate = async () => {
    setIsSending(true);
    try {
      // Template creation - for now just close dialog
      // TODO: Add template API route
      setShowTemplateDialog(false);
      setTemplateData({ name: "", channel: "whatsapp", language: "tr", subject: "", content: "" });
      await loadData();
    } catch (error) {
      console.error("Error creating template:", error);
    } finally {
      setIsSending(false);
    }
  };

  const useTemplate = (template: MessageTemplate) => {
    // Convert call_script to call for OutreachChannel
    const channel: OutreachChannel = template.channel === 'call_script' ? 'call' : template.channel;
    setComposeData({
      channel,
      recipient: "",
      subject: template.subject || "",
      content: template.content,
    });
    setShowComposeDialog(true);
  };

  // Don't block on loading - show UI immediately

  const filteredMessages = messages.filter(msg => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      msg.recipient?.toLowerCase().includes(query) ||
      msg.content?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mesajlar</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Multi-kanal mesajlaşma yönetimi
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowTemplateDialog(true)}>
            <Template className="w-4 h-4 mr-2" />
            Yeni Şablon
          </Button>
          <Button onClick={() => setShowComposeDialog(true)}>
            <Send className="w-4 h-4 mr-2" />
            Mesaj Gönder
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Channel Tabs */}
      <Tabs value={activeChannel} onValueChange={(value) => setActiveChannel(value as OutreachChannel)}>
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          {(["whatsapp", "email", "instagram_dm", "sms"] as OutreachChannel[]).map((channel) => {
            const config = channelConfig[channel];
            const Icon = config.icon;
            return (
              <TabsTrigger key={channel} value={channel} className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{config.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeChannel} className="space-y-4 mt-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Send className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{messages.filter(m => m.status === 'sent').length}</p>
                    <p className="text-xs text-gray-500">Gönderildi</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{messages.filter(m => m.status === 'delivered').length}</p>
                    <p className="text-xs text-gray-500">İletildi</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold">{messages.filter(m => m.read_at).length}</p>
                    <p className="text-xs text-gray-500">Okundu</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Reply className="w-5 h-5 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold">{messages.filter(m => m.replied_at).length}</p>
                    <p className="text-xs text-gray-500">Yanıtlandı</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Mesaj veya alıcı ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Messages List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {(() => {
                  const config = channelConfig[activeChannel];
                  const Icon = config.icon;
                  return <Icon className={cn("w-5 h-5", config.color.split(" ")[0])} />;
                })()}
                {channelConfig[activeChannel].label} Mesajları
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredMessages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Henüz mesaj yok</p>
                  <Button className="mt-4" onClick={() => setShowComposeDialog(true)}>
                    <Send className="w-4 h-4 mr-2" />
                    İlk Mesajı Gönder
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMessages.map((message) => (
                    <div
                      key={message.id}
                      className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{message.recipient}</p>
                          {message.subject && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">{message.subject}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full font-medium",
                            message.status === 'delivered' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            message.status === 'sent' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                            message.status === 'failed' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                            "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400"
                          )}>
                            {message.status === 'delivered' ? "İletildi" :
                             message.status === 'sent' ? "Gönderildi" :
                             message.status === 'failed' ? "Başarısız" : message.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(new Date(message.created_at), "d MMM HH:mm", { locale: tr })}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{message.content}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {message.read_at && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Okundu
                          </span>
                        )}
                        {message.replied_at && (
                          <span className="flex items-center gap-1">
                            <Reply className="w-3 h-3" /> Yanıtlandı
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Template className="w-5 h-5 text-primary" />
            Mesaj Şablonları
          </CardTitle>
          <CardDescription>Hızlı mesaj göndermek için şablonlarınız</CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Template className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Henüz şablon yok</p>
              <Button className="mt-4" variant="outline" onClick={() => setShowTemplateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Şablon Oluştur
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => {
                const config = channelConfig[template.channel];
                const Icon = config.icon;
                return (
                  <div
                    key={template.id}
                    className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => useTemplate(template)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("p-1.5 rounded", config.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{template.name}</span>
                      <span className="text-xs text-gray-500 ml-auto">{template.language === 'tr' ? '🇹🇷' : '🇬🇧'}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{template.content}</p>
                    <Button variant="ghost" size="sm" className="mt-2 w-full">
                      <Send className="w-4 h-4 mr-2" />
                      Kullan
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Mesaj Gönder</DialogTitle>
            <DialogDescription>Yeni bir mesaj oluşturun ve gönderin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kanal</Label>
                <Select
                  value={composeData.channel}
                  onValueChange={(value) => setComposeData({ ...composeData, channel: value as OutreachChannel })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["whatsapp", "email", "instagram_dm", "sms"] as OutreachChannel[]).map((channel) => (
                      <SelectItem key={channel} value={channel}>{channelConfig[channel].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Alıcı *</Label>
                <Input
                  value={composeData.recipient}
                  onChange={(e) => setComposeData({ ...composeData, recipient: e.target.value })}
                  placeholder={composeData.channel === 'email' ? "email@example.com" : "+90 555 123 4567"}
                />
              </div>
            </div>
            {composeData.channel === 'email' && (
              <div className="space-y-2">
                <Label>Konu</Label>
                <Input
                  value={composeData.subject}
                  onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                  placeholder="Email konusu"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Mesaj *</Label>
              <Textarea
                value={composeData.content}
                onChange={(e) => setComposeData({ ...composeData, content: e.target.value })}
                placeholder="Mesajınızı yazın..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComposeDialog(false)}>İptal</Button>
            <Button onClick={handleSendMessage} disabled={isSending || !composeData.recipient || !composeData.content}>
              {isSending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              Gönder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Yeni Şablon</DialogTitle>
            <DialogDescription>Tekrar kullanılabilir bir mesaj şablonu oluşturun.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Şablon Adı *</Label>
                <Input
                  value={templateData.name}
                  onChange={(e) => setTemplateData({ ...templateData, name: e.target.value })}
                  placeholder="Hoş geldiniz mesajı"
                />
              </div>
              <div className="space-y-2">
                <Label>Kanal</Label>
                <Select
                  value={templateData.channel}
                  onValueChange={(value) => setTemplateData({ ...templateData, channel: value as MessageTemplate['channel'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["whatsapp", "email", "instagram_dm", "sms"] as OutreachChannel[]).map((channel) => (
                      <SelectItem key={channel} value={channel}>{channelConfig[channel].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dil</Label>
              <Select
                value={templateData.language}
                onValueChange={(value) => setTemplateData({ ...templateData, language: value as MessageTemplate['language'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tr">🇹🇷 Türkçe</SelectItem>
                  <SelectItem value="en">🇬🇧 English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {templateData.channel === 'email' && (
              <div className="space-y-2">
                <Label>Konu</Label>
                <Input
                  value={templateData.subject}
                  onChange={(e) => setTemplateData({ ...templateData, subject: e.target.value })}
                  placeholder="Email konusu"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>İçerik *</Label>
              <Textarea
                value={templateData.content}
                onChange={(e) => setTemplateData({ ...templateData, content: e.target.value })}
                placeholder="Şablon içeriği... {{name}} gibi değişkenler kullanabilirsiniz."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>İptal</Button>
            <Button onClick={handleCreateTemplate} disabled={isSending || !templateData.name || !templateData.content}>
              {isSending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
